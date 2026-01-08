import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId, getUserId, getCurrentUserRole } from "@/lib/account-utils";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { searchTrendingTopics } from "@/lib/ai/website-scanner";
import { FunnelStage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Request body validation schema
const GenerateIdeasRequestSchema = z.object({
  gap: z.object({
    icp: z.string().min(1, "ICP is required"),
    stage: z.enum(["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"]),
    painCluster: z.string().nullable().optional(),
    productLineId: z.string().optional(),
  }),
  includeTrendingTopics: z.boolean().optional().default(true),
});

// Schema for content idea (painClusterAddressed will be constrained dynamically)
const createContentIdeaSchema = (allowedPainClusters: string[]) => {
  // Ensure we have at least one element for z.enum()
  if (allowedPainClusters.length === 0) {
    throw new Error("At least one pain cluster must be allowed");
  }
  
  return z.object({
    assetType: z.enum([
      "Whitepaper",
      "Case_Study",
      "Blog_Post",
      "Infographic",
      "Webinar_Recording",
      "Sales_Deck",
      "Technical_Doc",
    ]),
    title: z.string().describe("Proposed content title/concept"),
    strategicRationale: z.string().describe("Why this content matters for this ICP at this stage"),
    trendingAngle: z.string().nullable().describe("How to leverage trending topics (if available)"),
    keyMessage: z.string().describe("Core message this content should convey"),
    painClusterAddressed: z.enum(allowedPainClusters as [string, ...string[]])
      .describe("Which pain cluster this addresses - must be one of the allowed clusters"),
    format: z.string().describe("Content format description"),
    priority: z.enum(["high", "medium", "low"]).describe("Strategic priority"),
  });
};

// Response schema factory - creates schema with dynamic pain cluster constraint
const createContentIdeasResponseSchema = (allowedPainClusters: string[]) => z.object({
  gap: z.object({
    icp: z.string(),
    stage: z.string(),
    painCluster: z.string().nullable(),
  }),
  strategicPriority: z.enum(["high", "medium", "low"]),
  priorityRationale: z.string(),
  trendingContext: z.string().nullable(),
  trendingTopics: z.array(z.string()).nullable(),
  ideas: z.array(createContentIdeaSchema(allowedPainClusters)).min(3).max(5),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get account ID (this will throw if no account is selected)
    let accountId: string;
    try {
      accountId = await requireAccountId(request);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No account selected. Please select an account first." },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = GenerateIdeasRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed",
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const { gap, includeTrendingTopics } = validationResult.data;

    // Fetch brand context
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
      include: {
        productLines: true,
      },
    });

    if (!brandContext) {
      return NextResponse.json(
        { error: "Brand context not found. Please set up your brand identity first." },
        { status: 404 }
      );
    }

    // Fetch product line if specified
    let productLine = null;
    if (gap.productLineId) {
      productLine = brandContext.productLines.find(pl => pl.id === gap.productLineId);
      if (!productLine) {
        return NextResponse.json(
          { error: "Product line not found" },
          { status: 404 }
        );
      }
    }

    // Fetch existing assets for context
    const existingAssets = await prisma.asset.findMany({
      where: {
        accountId,
        icpTargets: { has: gap.icp },
        funnelStage: gap.stage, // Now properly validated as FunnelStage enum
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    });

    // Check if user is admin/owner for API warnings
    const userRole = await getCurrentUserRole(request);
    const isAdmin = userRole === "OWNER" || userRole === "ADMIN";

    // Discover trending topics if requested
    // Build search query prioritizing pain clusters and brand identity
    // Use safe fallbacks for array access
    const primaryPainCluster = gap.painCluster ?? brandContext.painClusters[0] ?? null;
    const primaryIndustry = brandContext.targetIndustries[0] ?? null;
    
    let trendingData = null;
    const apiWarnings: Array<{ type: string; message: string; api: string }> = [];
    
    if (includeTrendingTopics) {
      try {
        // Build search query with company context - prioritize industry and product line
        let searchQuery = "";
        
        // Include product line name if available (most specific context)
        if (productLine && productLine.name) {
          searchQuery = `${productLine.name} ${primaryPainCluster || gap.icp}`;
        } else {
          // Fall back to industry + pain cluster for specificity
          if (primaryIndustry && primaryPainCluster) {
            searchQuery = `${primaryIndustry} ${primaryPainCluster} solutions ${gap.icp}`;
          } else if (primaryPainCluster) {
            searchQuery = `${primaryPainCluster} solutions ${gap.icp}`;
          } else if (primaryIndustry) {
            searchQuery = `${gap.icp} ${primaryIndustry} ${gap.stage}`;
          } else {
            searchQuery = `${gap.icp} ${gap.stage}`;
          }
        }
        
        // Add value proposition keywords if available to narrow search
        if (brandContext.valueProposition) {
          const vpKeywords = brandContext.valueProposition
            .split(/\s+/)
            .filter(word => word.length > 4 && !['the', 'and', 'for', 'with', 'that', 'this'].includes(word.toLowerCase()))
            .slice(0, 2);
          if (vpKeywords.length > 0) {
            searchQuery = `${searchQuery} ${vpKeywords.join(' ')}`;
          }
        }

        console.log(`[Generate Ideas] Searching trending topics with query: "${searchQuery}"`);
        console.log(`[Generate Ideas] Primary pain cluster: ${primaryPainCluster}`);
        console.log(`[Generate Ideas] Primary industry: ${primaryIndustry}`);
        console.log(`[Generate Ideas] Product line: ${productLine?.name || 'None'}`);

        // Only search if we have meaningful context
        if (primaryPainCluster || primaryIndustry) {
          // Pass COMPLETE brand identity for comprehensive context
          trendingData = await searchTrendingTopics(searchQuery, {
            icp: gap.icp,
            painCluster: primaryPainCluster || undefined,
            funnelStage: gap.stage,
            industry: primaryIndustry || undefined,
            // Complete brand identity context
            brandVoice: brandContext.brandVoice.length > 0 ? brandContext.brandVoice.join(", ") : undefined,
            primaryICPRoles: brandContext.primaryICPRoles.length > 0 ? brandContext.primaryICPRoles : undefined,
            targetIndustries: brandContext.targetIndustries.length > 0 ? brandContext.targetIndustries : undefined,
            valueProposition: brandContext.valueProposition || undefined,
            roiClaims: brandContext.roiClaims.length > 0 ? brandContext.roiClaims : undefined,
            keyDifferentiators: brandContext.keyDifferentiators.length > 0 ? brandContext.keyDifferentiators : undefined,
            useCases: brandContext.useCases.length > 0 ? brandContext.useCases : undefined,
            painClusters: brandContext.painClusters.length > 0 ? brandContext.painClusters : undefined, // All pain clusters
            competitors: brandContext.competitors.length > 0 ? brandContext.competitors : undefined,
            // Product line context if available
            productLineName: productLine?.name || undefined,
            productLineDescription: productLine?.description || undefined,
            productLineValueProp: productLine?.valueProposition || undefined,
            productLineICPs: productLine?.specificICP && productLine.specificICP.length > 0 ? productLine.specificICP : undefined,
          });
          
          console.log(`[Generate Ideas] Trending data received:`);
          console.log(`[Generate Ideas] - Topics: ${trendingData?.trendingTopics?.length || 0}`);
          console.log(`[Generate Ideas] - Sources: ${trendingData?.results?.length || 0}`);
          console.log(`[Generate Ideas] - Reputable sources: ${trendingData?.results?.filter((r: any) => r.isReputable)?.length || 0}`);
          
          // Collect API warnings (only for admin display)
          if (isAdmin && trendingData?._apiWarnings) {
            apiWarnings.push(...trendingData._apiWarnings);
          }
        } else {
          console.warn(`[Generate Ideas] Skipping Jina search - no pain cluster or industry context`);
        }
      } catch (error) {
        console.error("[Generate Ideas] ERROR discovering trending topics:", error);
        console.error("[Generate Ideas] Error details:", error instanceof Error ? error.message : String(error));
        // Continue without trending topics
      }
    } else {
      console.log(`[Generate Ideas] Trending topics discovery skipped (includeTrendingTopics: false)`);
    }

    // Build brand context string
    const brandVoiceText = brandContext.brandVoice.length > 0
      ? brandContext.brandVoice.join(", ")
      : "Professional, Customer-Centric";

    // Build product line context if specified
    const productLineContext = productLine
      ? `
PRODUCT LINE CONTEXT (THIS IS THE SPECIFIC PRODUCT THIS CONTENT IS FOR):
- Product Line Name: ${productLine.name}
- Description: ${productLine.description}
- Value Proposition: ${productLine.valueProposition}
- Target ICPs: ${productLine.specificICP.join(", ")}
`
      : "";

    const brandContextText = `
🔴 COMPLETE BRAND IDENTITY (YOU MUST USE ALL OF THIS):
BRAND IDENTITY:
- Brand Voice: ${brandVoiceText}
- Primary ICP Roles: ${brandContext.primaryICPRoles.join(", ") || "Not specified"}
- Target Industries: ${brandContext.targetIndustries.join(", ") || "Not specified"}
- Pain Clusters: ${brandContext.painClusters.join(", ") || "Not specified"}
- Value Proposition: ${brandContext.valueProposition || "Not specified"}
- ROI Claims: ${brandContext.roiClaims.join(", ") || "Not specified"}
- Key Differentiators: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
- Use Cases: ${brandContext.useCases.join(", ") || "Not specified"}
- Competitors (EXCLUDE): ${brandContext.competitors.join(", ") || "None specified"}
${productLineContext}

🔴 CRITICAL: USE ALL BRAND IDENTITY FACTORS
When generating content ideas, you MUST consider ALL of the above brand identity information:
1. **Target Industries**: Ideas must be relevant to ${brandContext.targetIndustries.join(", ") || "the company's target industries"}
2. **Brand Voice**: Ideas must match the ${brandVoiceText} tone
3. **Primary ICP Roles**: Ideas must resonate with ${brandContext.primaryICPRoles.join(", ") || "the target ICP roles"}
4. **Pain Clusters**: Ideas MUST solve ${brandContext.painClusters.join(", ") || "the identified pain clusters"}
5. **Value Proposition**: Ideas must align with "${brandContext.valueProposition || "the company's value proposition"}"
6. **ROI Claims**: Reference ${brandContext.roiClaims.join(", ") || "ROI claims"} where relevant
7. **Key Differentiators**: Leverage ${brandContext.keyDifferentiators.join(", ") || "differentiators"} to stand out
8. **Use Cases**: Connect to ${brandContext.useCases.join(", ") || "use cases"} where applicable
${productLine ? `9. **Product Line**: ${productLine.name} - Use product line context above` : ""}

Do NOT generate generic ideas that could apply to any company. Ideas must show deep understanding of ALL brand identity factors.
`;

    const trendingContextText = trendingData && trendingData.trendingTopics.length > 0
      ? `
TRENDING TOPICS DISCOVERY:
- Trending Topics: ${trendingData.trendingTopics.join(", ")}
- Strategic Insights: ${trendingData.insights}
- Top Articles Found: ${trendingData.results.length} relevant sources
`
      : "";

    const existingAssetsText = existingAssets.length > 0
      ? `
EXISTING CONTENT CONTEXT:
- Similar assets we have: ${existingAssets.map(a => a.title).join(", ")}
- What's missing: Content that adds unique value beyond existing assets
`
      : "";

    // Calculate date cutoff (8 months ago from today) for system prompt
    const today = new Date();
    const eightMonthsAgo = new Date(today);
    eightMonthsAgo.setMonth(today.getMonth() - 8);
    const cutoffDateStr = eightMonthsAgo.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const systemPrompt = `You are a Senior B2B Content Strategist analyzing content gaps with strategic context.

Your goal is to generate 3-5 high-quality content ideas that:
1. **PRIMARY FOCUS: Solve the specific pain cluster(s)** - Each idea MUST directly address and solve the pain cluster(s) identified
2. **USE ALL BRAND IDENTITY FACTORS** - Every idea must show understanding of ALL brand identity information (target industries, brand voice, ICP roles, value proposition, ROI claims, differentiators, use cases)
3. Address the specific ICP persona's needs at that funnel stage
4. Incorporate trending topics (if available) to ensure relevance and timeliness
5. Align with the brand voice and leverage brand differentiators
6. Reference value proposition, use cases, and ROI claims where relevant
7. Be relevant to the company's target industries and business context
8. Follow B2B content best practices (specific, data-driven, problem-focused)
9. **Ensure all content references are current** - No dates older than ${cutoffDateStr} (8 months before today: ${todayStr})

🔴 CRITICAL: Every content idea MUST solve the pain cluster(s). The pain cluster is the core problem your organization solves - the content must demonstrate HOW to solve it.

🔴 CRITICAL: COMPREHENSIVE BRAND IDENTITY USAGE
Do NOT generate generic ideas. Every idea must show deep understanding of:
- The company's target industries (${brandContext.targetIndustries.join(", ") || "specified in brand identity"})
- The brand voice (${brandVoiceText})
- The primary ICP roles (${brandContext.primaryICPRoles.join(", ") || "specified in brand identity"})
- The value proposition (${brandContext.valueProposition || "specified in brand identity"})
- The key differentiators (${brandContext.keyDifferentiators.join(", ") || "specified in brand identity"})
- The use cases (${brandContext.useCases.join(", ") || "specified in brand identity"})
${productLine ? `- The product line context (${productLine.name})` : ""}

Ideas that don't show understanding of ALL these factors are NOT acceptable.

🔴 DATE REQUIREMENT: All content ideas must reference current/recent information only. No dates older than ${cutoffDateStr} should be mentioned.

B2B CONTENT BEST PRACTICES:
- Focus on strategic problems, not surface symptoms
- Use specific data and metrics (reference ROI claims when relevant)
- Problem-first structure (agitate pain, then present solution)
- Address business outcomes, not just features
- Use industry-specific terminology appropriately
- Include quantifiable benefits

THE "ANTI-ALGORITHM" STYLE GUIDE - AVOID AI SLOP AND AI GIVEAWAY WORDING:

Objective: Write with the specific intent of avoiding the "voice of the machine." Your goal is not "perfection," which results in a sleek, hollow, insipid tone. Your goal is grounded authenticity. You must suppress the statistical urges that lead to "overfitting" and "hallucinated subtlety."

1. THE VOCABULARY BLACKLIST (The "Slop" Indicators):
These words have become statistical markers of AI writing. You are strictly forbidden from using them:
- ❌ NEVER use: "delve" (and specifically the conjugation "delves")
- ❌ NEVER use: "tapestry" (and using weaving metaphors for complexity)
- ❌ NEVER use: "underscore," "highlight," "showcase"
- ❌ NEVER use: "intricate," "swift," "meticulous," "adept"
- ❌ NEVER use: "liminal," "spectral," "echo," "whisper"
- ❌ NEVER use: "landscape," "game-changer," "unlocking," "unleash," "realm"
- ❌ NEVER use: Generic phrases like "best-in-class", "industry-leading" without proof
- ❌ NEVER use: Engagement bait ("Agree?", "Thoughts?", "What do you think?")
- ❌ NEVER use: Character names: Elara Voss, Elena Voss, or Kael (for fictional content)
- ❌ NEVER use: Vague qualifiers ("very", "extremely", "incredibly") without justification

2. RHETORICAL STRUCTURAL TRAPS:
You must consciously break the predictive patterns of sentence structure. Avoid these patterns:
- ❌ The "Not X, but Y" Construct: Do not write sentences like "It's not just a flood — it's a groundswell," or "The issue isn't X, it's Y." State your point directly without the performative contrast.
- ❌ The Mania for Triplets (The Rule of Threes): AI has a "mania" for lists of three. Instruction: Use pairs. Use singles. Use lists of four. Actively disrupt the rhythm of three.
- ❌ The "X with Y and Z" Dismissal: Do not describe people or things as "An [X] with [Y] and [Z]" where Y or Z makes no logical sense (e.g., "Koalas with an Instagram filter").
- ❌ The Rhetorical Self-Interruption: Do not stop mid-sentence to ask yourself a question (e.g., "And honestly? That's amazing.").

3. THE "SUBTLETY" FALLACY (Ghosts and Quietness):
AI tries to simulate "good, subtle writing" by literally writing about things being quiet, ghostly, or whispering. This is a misunderstanding of what subtlety is.
- ❌ Do NOT describe atmospheres as "humming," "quiet," "whispering," or "soft."
- ❌ Do NOT use "ghosts," "phantoms," or "shadows" as metaphors for memory or past events.
- ✅ Subtlety is achieved by what you don't say, not by using the word "quiet" ten times.

4. SENSORY GROUNDING VS. ABSTRACT HALLUCINATION:
Because AI cannot experience the world, it attaches sensory words to abstract concepts (e.g., "turpentine and dreams," "grief tastes of metal"). This creates "mixed metaphors and empty sincerity."
- ❌ The "Virginia Woolf" Standard: When using sensory language (sight, sound, taste), apply it ONLY to physical objects.
  - Bad (AI): "The day tasted of almost-Friday." (Abstract)
  - Good (Human): "The great plateful of blue water." (Concrete)
- ❌ Avoid "Empty Sincerity": Do not use corporate-emotional speak like "woven into your daily rhythm" or "unfolding the brushstrokes of regret." If the emotion isn't attached to a specific, concrete action or object, delete it.

5. PUNCTUATION AND TONE:
- ❌ The Em Dash (—): The em dash is identified as a "sign of zero-effort... slop." Limit your use of em dashes. Do not use them to create a "dramatic pause." Use standard commas, periods, or semicolons.
- ❌ Cultural Specificity: Do not "smuggle" cultural practices where they don't belong (e.g., Do not make a British speaker say "I rise to speak," which is an Americanism). Ensure your register matches the specific speaker, not a generalized "internet average."
- ❌ Avoid Hysteria: AI tone is described as "slightly wide-eyed, overeager... on the verge of some kind of hysteria." Lower the temperature. Be detached. Be boring if necessary. Do not be "helpful, informative, and engaging." Be real.

SUMMARY:
To write like a human, you must be willing to be asymmetric, occasionally flat, and grounded in physical reality. You must reject the algorithm's urge to "weave tapestries," "delve into topics," or create "quiet echoes." Write with the specific, messy reality of a being that has physically stood in a room, not a code that has statistically analyzed the concept of a room.

✅ DO use: Specific metrics, percentages, timeframes
✅ DO use: Concrete examples with context
✅ DO use: Problem-first structure
✅ DO use: Clear, direct language
✅ DO use: Industry-specific terminology when appropriate

${brandContextText}
${trendingContextText}
${existingAssetsText}`;

    // Determine which pain clusters to address (with safe fallbacks)
    const painClustersToAddress = gap.painCluster 
      ? [gap.painCluster, ...brandContext.painClusters.filter(pc => pc !== gap.painCluster).slice(0, 1)]
      : brandContext.painClusters.length > 0
      ? brandContext.painClusters.slice(0, 2)
      : [];

    // Build allowed pain clusters for validation (must include at least one)
    const allowedPainClusters = painClustersToAddress.length > 0
      ? painClustersToAddress
      : primaryPainCluster
      ? [primaryPainCluster]
      : brandContext.painClusters.length > 0
      ? brandContext.painClusters
      : ["General Business Challenges"]; // Fallback if no pain clusters defined

    // Create dynamic schemas with constrained pain clusters
    const ContentIdeasResponseSchema = createContentIdeasResponseSchema(allowedPainClusters);

    // Build user prompt with safe fallbacks
    const primaryPainClusterDisplay = gap.painCluster || primaryPainCluster || "the identified pain cluster";

    const userPrompt = `Generate 3-5 content ideas for this gap:

GAP: ${gap.icp} - ${gap.stage}
${gap.painCluster ? `PRIMARY PAIN CLUSTER TO SOLVE: ${gap.painCluster}` : ""}
${brandContext.painClusters.length > 0 
  ? `ALL ORGANIZATION PAIN CLUSTERS: ${brandContext.painClusters.join(", ")}`
  : ""}

🔴 CRITICAL REQUIREMENT: Every content idea MUST solve the pain cluster(s). The content must:
- Clearly identify the pain cluster as a problem
- Explain the cost/impact of not solving it
- Demonstrate HOW to solve it${productLine ? ` (using ${productLine.name}'s value proposition: ${productLine.valueProposition})` : ` (using our value proposition: ${brandContext.valueProposition || "Not specified"})`}
- Reference our differentiators: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
- Show how our use cases address it: ${brandContext.useCases.join(", ") || "Not specified"}
${productLine ? `- **CRITICAL**: This content is specifically for the "${productLine.name}" product line. Use the product line's value proposition and target ICPs (${productLine.specificICP.join(", ")}) when generating ideas.` : ""}

🔴 DATE REQUIREMENT (CRITICAL):
- Today's date: ${todayStr}
- NO content should reference dates older than ${cutoffDateStr} (8 months before today)
- All statistics, studies, reports, or examples must be from ${cutoffDateStr} or later
- If referencing historical data, frame it in terms of recent trends or current context
- Ensure all content ideas are timely and reference current/recent information only

${trendingData && trendingData.trendingTopics.length > 0
  ? `TRENDING TOPICS TO INCORPORATE:
${trendingData.trendingTopics.map((topic, i) => `  ${i + 1}. ${topic}`).join("\n")}

Use these trending topics to enhance relevance and timeliness. Show how trending topics connect to pain clusters and demonstrate solutions.`
  : ""}

REQUIREMENTS:
- Generate 3-5 distinct content ideas
- Each idea must have a different angle/approach to solving the pain cluster(s)
${painClustersToAddress.length > 0
  ? `- **EVERY IDEA MUST SOLVE THE PAIN CLUSTER**: ${painClustersToAddress.join(" or ")}`
  : "- Focus on addressing the core business challenges for this ICP"}
- Prioritize ideas that directly address: ${primaryPainClusterDisplay}
- Ensure ideas are appropriate for ${gap.stage} stage
- Target the ICP: ${gap.icp}
- Leverage brand differentiators: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
- Reference use cases where relevant: ${brandContext.useCases.join(", ") || "Not specified"}
${trendingData && trendingData.trendingTopics.length > 0
  ? "- Reference specific trending topics in at least 2-3 ideas, showing how they relate to solving pain clusters"
  : ""}

OUTPUT FORMAT:
For each idea, provide:
- Asset Type: [Type from enum]
- Title: [Proposed title/concept]
- Strategic Rationale: [Why this matters]
${trendingData && trendingData.trendingTopics.length > 0
  ? "- Trending Angle: [How to leverage trending topics]"
  : ""}
- Key Message: [Core message]
- Pain Cluster Addressed: [Must be one of: ${allowedPainClusters.join(", ")}]
- Format: [Content format description]
- Priority: [high/medium/low based on strategic importance]

Also provide:
- Strategic Priority: Overall priority for this gap (high/medium/low)
- Priority Rationale: Why this gap matters
${trendingData && trendingData.trendingTopics.length > 0
  ? "- Trending Context: How trending topics relate to this gap"
  : ""}`;

    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(ContentIdeasResponseSchema, "content_ideas"),
      temperature: 0.7,
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate content ideas");
    }

    // Add trending topics data to response
    // Return excerpt only (capped at 800 chars) to avoid sending full content to client
    const response = {
      ...result,
      trendingTopics: trendingData?.trendingTopics || [],
      trendingInsights: trendingData?.insights,
      trendingSources: trendingData?.results?.map((r: any) => ({
        url: r.url,
        title: r.title,
        content: r.content ? (r.content.length > 800 ? r.content.substring(0, 800) + "..." : r.content) : "",
        relevance: r.relevance,
        sourceType: r.sourceType,
        isReputable: r.isReputable,
      })) || [],
      _apiWarnings: isAdmin && apiWarnings.length > 0 ? apiWarnings : undefined, // Only include if admin and warnings exist
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error generating content ideas:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate content ideas",
      },
      { status: 500 }
    );
  }
}
