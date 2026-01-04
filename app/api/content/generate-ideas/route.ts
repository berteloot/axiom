import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId, getUserId } from "@/lib/account-utils";
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
    });

    if (!brandContext) {
      return NextResponse.json(
        { error: "Brand context not found. Please set up your brand identity first." },
        { status: 404 }
      );
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

    // Discover trending topics if requested
    // Build search query prioritizing pain clusters and brand identity
    // Use safe fallbacks for array access
    const primaryPainCluster = gap.painCluster ?? brandContext.painClusters[0] ?? null;
    const primaryIndustry = brandContext.targetIndustries[0] ?? null;
    
    let trendingData = null;
    if (includeTrendingTopics) {
      try {
        // Build search query with safe fallbacks
        const searchQuery = primaryPainCluster
          ? `${primaryPainCluster} solutions ${gap.icp}`
          : primaryIndustry
          ? `${gap.icp} ${primaryIndustry} ${gap.stage}`
          : `${gap.icp} ${gap.stage}`;

        // Only search if we have meaningful context
        if (primaryPainCluster || primaryIndustry) {
          trendingData = await searchTrendingTopics(searchQuery, {
            icp: gap.icp,
            painCluster: primaryPainCluster || undefined,
            funnelStage: gap.stage,
            industry: primaryIndustry || undefined,
            valueProposition: brandContext.valueProposition || undefined,
            keyDifferentiators: brandContext.keyDifferentiators,
            useCases: brandContext.useCases,
            painClusters: brandContext.painClusters, // All pain clusters for context
            competitors: brandContext.competitors, // Exclude competitor blogs
          });
        }
      } catch (error) {
        console.error("Error discovering trending topics:", error);
        // Continue without trending topics
      }
    }

    // Build brand context string
    const brandVoiceText = brandContext.brandVoice.length > 0
      ? brandContext.brandVoice.join(", ")
      : "Professional, Customer-Centric";

    const brandContextText = `
BRAND IDENTITY:
- Brand Voice: ${brandVoiceText}
- Primary ICP Roles: ${brandContext.primaryICPRoles.join(", ")}
- Pain Clusters: ${brandContext.painClusters.join(", ")}
- Value Proposition: ${brandContext.valueProposition || "Not specified"}
- ROI Claims: ${brandContext.roiClaims.join(", ") || "Not specified"}
- Key Differentiators: ${brandContext.keyDifferentiators.join(", ")}
- Use Cases: ${brandContext.useCases.join(", ")}
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

    const systemPrompt = `You are a Senior B2B Content Strategist analyzing content gaps with strategic context.

Your goal is to generate 3-5 high-quality content ideas that:
1. **PRIMARY FOCUS: Solve the specific pain cluster(s)** - Each idea MUST directly address and solve the pain cluster(s) identified
2. Address the specific ICP persona's needs at that funnel stage
3. Incorporate trending topics (if available) to ensure relevance and timeliness
4. Align with the brand voice and leverage brand differentiators
5. Reference value proposition and use cases where relevant
6. Follow B2B content best practices (specific, data-driven, problem-focused)

🔴 CRITICAL: Every content idea MUST solve the pain cluster(s). The pain cluster is the core problem your organization solves - the content must demonstrate HOW to solve it.

B2B CONTENT BEST PRACTICES:
- Focus on strategic problems, not surface symptoms
- Use specific data and metrics (reference ROI claims when relevant)
- Problem-first structure (agitate pain, then present solution)
- Address business outcomes, not just features
- Use industry-specific terminology appropriately
- Include quantifiable benefits

AVOID AI WRITING TRAPS:
❌ NEVER use: "delve", "tapestry", "landscape", "game-changer", "unlocking", "unleash", "realm"
❌ NEVER use: Generic phrases like "best-in-class", "industry-leading" without proof
❌ NEVER use: Engagement bait ("Agree?", "Thoughts?", "What do you think?")
❌ NEVER use: Vague qualifiers ("very", "extremely", "incredibly") without justification

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
- Demonstrate HOW to solve it (using our value proposition: ${brandContext.valueProposition || "Not specified"})
- Reference our differentiators: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
- Show how our use cases address it: ${brandContext.useCases.join(", ") || "Not specified"}

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
