import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getStrategicKeywords } from "@/lib/keywords/dataforseo";
import { getCurrentUserRole } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ContentBriefSchema = z.object({
  strategicPositioning: z.object({
    whyThisMatters: z.string().describe("Why this content matters for this ICP at this stage"),
    painClusterAddress: z.string().describe("How it addresses the pain cluster"),
    trendingTopicsIntegration: z.string().nullable().describe("How trending topics enhance relevance"),
    differentiation: z.string().describe("How it differentiates from competitors"),
  }),
  contentStructure: z.object({
    recommendedSections: z.array(
      z.object({
        title: z.string(),
        keyMessages: z.array(z.string()),
        dataPoints: z.array(z.string()).nullable(),
        trendingTopicReferences: z.array(z.string()).nullable(),
      })
    ),
    totalEstimatedWords: z.number().describe("Estimated word count for this asset type"),
  }),
  toneAndStyle: z.object({
    brandVoiceGuidance: z.string(),
    icpSpecificTone: z.string(),
    whatToAvoid: z.array(z.string()),
  }),
  successMetrics: z.object({
    whatMakesThisSuccessful: z.string(),
    howToUseInSales: z.string(),
    engagementIndicators: z.array(z.string()),
  }),
  contentGapsToAddress: z.array(z.string()).describe("Topics to explore deeply, questions to answer"),
  seoStrategy: z.object({
    primaryKeyword: z.string().describe("The single most strategically valuable keyword for this content"),
    secondaryKeywords: z.array(z.string()).describe("2-3 supporting keywords that enhance SEO"),
    targetSearchIntent: z.string().describe("The search intent this content targets (informational, commercial, transactional)"),
    implementationNotes: z.string().describe("Specific guidance on WHERE and HOW to use these keywords (e.g., 'Use primary keyword in H2', 'Use in opening paragraph')"),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const { selectedIdea, gap, trendingTopics } = body;

    if (!selectedIdea || !gap) {
      return NextResponse.json(
        { error: "Selected idea and gap information are required" },
        { status: 400 }
      );
    }

    // Fetch brand context with product lines
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

    // Determine which ICPs to use - prefer icpTargets array, fallback to gap.icp
    const icpTargets = gap.icpTargets && gap.icpTargets.length > 0 ? gap.icpTargets : [gap.icp];
    const primaryICP = icpTargets[0] || gap.icp;
    const icpDisplayText = icpTargets.length > 1 
      ? `${icpTargets.join(", ")} (${icpTargets.length} ICPs)`
      : icpTargets[0];

    // Fetch product line if specified
    let productLine = null;
    if (gap.productLineId) {
      productLine = brandContext.productLines.find(pl => pl.id === gap.productLineId);
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
BRAND IDENTITY:
- Brand Voice: ${brandVoiceText}
- Primary ICP Roles: ${brandContext.primaryICPRoles.join(", ")}
- Pain Clusters: ${brandContext.painClusters.join(", ")}
- Value Proposition: ${brandContext.valueProposition || "Not specified"}
- ROI Claims: ${brandContext.roiClaims.join(", ") || "Not specified"}
- Key Differentiators: ${brandContext.keyDifferentiators.join(", ")}
- Use Cases: ${brandContext.useCases.join(", ")}
${productLineContext}
`;

    const trendingTopicsText = trendingTopics && trendingTopics.length > 0
      ? `
TRENDING TOPICS TO INTEGRATE:
${trendingTopics.map((topic: string, i: number) => `  ${i + 1}. ${topic}`).join("\n")}

Use these trending topics naturally within the content structure. Show how they connect to pain clusters and business outcomes.
`
      : "";

    // Check if user is admin/owner for API warnings
    const userRole = await getCurrentUserRole(request);
    const isAdmin = userRole === "OWNER" || userRole === "ADMIN";

    // Step A: Determine seed keyword from selected idea
    const seedKeyword = selectedIdea.title || selectedIdea.keyMessage || "";
    console.log(`[Content Brief] Seed keyword extracted: "${seedKeyword}" for funnel stage: ${gap.stage}`);
    
    // Step B: Fetch SEO data (Just-in-Time keyword research)
    const { keywords: keywordResults, warnings: keywordWarnings } = await getStrategicKeywords(seedKeyword, gap.stage);
    console.log(`[Content Brief] Keyword research returned ${keywordResults.length} keywords`);
    if (keywordResults.length > 0) {
      console.log(`[Content Brief] Keywords:`, keywordResults.map(k => `${k.keyword} (Vol: ${k.volume}, CPC: $${k.cpc.toFixed(2)})`).join(", "));
    }
    
    // Collect API warnings (only for admin display)
    const apiWarnings: Array<{ type: string; message: string; api: string }> = [];
    if (isAdmin && keywordWarnings.length > 0) {
      apiWarnings.push(...keywordWarnings);
    }
    
    // Step C: Format SEO data for prompt injection
    const seoDataText = keywordResults.length > 0
      ? `
*** STRATEGIC SEO DATA ***
We have researched the following real-world keywords for this topic:
${keywordResults.map((kw, i) => 
  `  ${i + 1}. "${kw.keyword}" - Volume: ${kw.volume.toLocaleString()}/month, CPC: $${kw.cpc.toFixed(2)}, Competition: ${kw.competition}`
).join("\n")}

INSTRUCTIONS:
1. Select the 1 most strategically valuable keyword from this list as the "Primary Keyword".
2. Select 2-3 "Secondary Keywords" that support the narrative and complement the primary keyword.
3. Determine the "Target Search Intent" based on the funnel stage (${gap.stage}):
   - TOFU_AWARENESS → Informational intent
   - MOFU_CONSIDERATION → Commercial investigation intent
   - BOFU_DECISION → Transactional/commercial intent
4. In the "Implementation Notes", explain WHERE and HOW to use these keywords:
   - Primary keyword placement (e.g., "Use in H1/H2", "Use in opening paragraph")
   - Secondary keywords placement (e.g., "Use in subheadings", "Use naturally throughout body")
   - Keyword density guidance (e.g., "Natural integration, avoid keyword stuffing")
5. DO NOT keyword stuff. Prioritize readability and user experience.
6. Ensure keywords align with the content's primary goal of solving pain clusters.
`
      : `
*** SEO STRATEGY NOTE ***
Keyword research data is not available at this time. Please provide strategic SEO guidance based on the content topic and funnel stage (${gap.stage}).
`;

    // Calculate date cutoff (8 months ago from today) for system prompt
    const today = new Date();
    const eightMonthsAgo = new Date(today);
    eightMonthsAgo.setMonth(today.getMonth() - 8);
    const cutoffDateStr = eightMonthsAgo.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const systemPrompt = `You are a Senior B2B Content Strategist creating a detailed content brief.

Your goal is to create a comprehensive content brief that:
1. **PRIMARY: Solves the pain cluster(s)** - The content must clearly solve the identified pain cluster(s)
2. Positions the content strategically for the ICP and funnel stage
3. Integrates trending topics naturally (if available) - showing how they relate to pain cluster solutions
4. Leverages brand identity (value proposition, differentiators, use cases) to solve pain clusters
5. Provides clear structure and guidance
6. Ensures brand voice consistency
7. Follows B2B content best practices
8. **Ensures all content references are current** - No dates older than ${cutoffDateStr} (8 months before today: ${todayStr})

🔴 CRITICAL: The content brief must demonstrate HOW the content solves the pain cluster(s) using the organization's value proposition, differentiators, and use cases.

🔴 DATE REQUIREMENT: All content brief recommendations must reference current/recent information only. No dates older than ${cutoffDateStr} should be mentioned.

B2B CONTENT BEST PRACTICES:
- Problem-first structure (agitate pain, then present solution)
- Use specific data and metrics (reference ROI claims)
- Address business outcomes, not just features
- Include quantifiable benefits
- Use industry-specific terminology appropriately

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
- ❌ Vague Qualifiers: Do not use vague qualifiers ("very", "extremely", "incredibly") without justification.

SUMMARY:
To write like a human, you must be willing to be asymmetric, occasionally flat, and grounded in physical reality. You must reject the algorithm's urge to "weave tapestries," "delve into topics," or create "quiet echoes." Write with the specific, messy reality of a being that has physically stood in a room, not a code that has statistically analyzed the concept of a room.

🔴 STRICT WRITING GUIDELINES (MANDATORY):

Follow these strict guidelines for all content:

1. **Tone & Style:**
   - Use concise, direct language. Favor clarity over flourish.
   - Avoid motivational filler, metaphors, and figurative language.
   - Prioritize action-oriented, cause-and-effect statements.
   - Maintain a professional, practical tone throughout. Avoid marketing hype.

2. **Structure:**
   - Begin each section with an immediately relevant statement. Skip thematic or philosophical intros.
   - Use short paragraphs (2–5 sentences).
   - Avoid bulleted lists unless absolutely necessary. Use structured prose.
   - Vary sentence structure to avoid repetition and maintain flow.

3. **Language Constraints:**
   - Do not use or imply metaphors, symbolism, or imagery.
   - **Prohibited words and phrases include:**
     * "Unlock," "empower," "transform," "journey," "navigate," "explore," "embrace"
     * "Cutting-edge," "dynamic," "realm," "landscape," "holistic," "game-changer," "future-ready"
     * Similar abstractions and marketing buzzwords
   - Avoid motivational phrases like "more than ever," "step into," or "a testament to."
   - Never use constructions like "not just X, but Y."
   - Avoid overused setups such as "In today's world…" or "It's essential to…"

4. **Content Approach:**
   - Stick to functional, factual, objective descriptions.
   - Focus on practical processes, decision points, risks, and outcomes.
   - If citing benefits or statistics, be specific and quantifiable.
   - All examples and scenarios should reflect realistic professional situations.

5. **Voice:**
   - Write as if explaining to an experienced peer—not selling to a prospect.
   - Keep the tone grounded, confident, and informed.
   - No fluff, no filler.

${brandContextText}

${seoDataText}`;

    const userPrompt = `Create a comprehensive content brief for this selected idea:

SELECTED IDEA:
- Title/Concept: ${selectedIdea.title}
- Asset Type: ${selectedIdea.assetType}
- ICP: ${icpDisplayText}${icpTargets.length > 1 ? ` (targeting ${icpTargets.length} ICP roles)` : ""}
- Funnel Stage: ${gap.stage}
- Pain Cluster: ${gap.painCluster || "General business challenges"}
- Key Message: ${selectedIdea.keyMessage}

${trendingTopicsText}

REQUIREMENTS:

🔴 CRITICAL: This content MUST solve the pain cluster(s). Every section must demonstrate HOW the content solves it.

🔴 DATE REQUIREMENT (CRITICAL):
- Today's date: ${todayStr}
- NO content should reference dates older than ${cutoffDateStr} (8 months before today)
- All statistics, studies, reports, or examples must be from ${cutoffDateStr} or later
- If referencing historical data, frame it in terms of recent trends or current context
- Ensure all content is timely and references current/recent information only

1. **Strategic Positioning**
   - Explain why this content matters for ${icpDisplayText} at ${gap.stage} stage${icpTargets.length > 1 ? ` (the content should resonate with all ${icpTargets.length} ICP roles)` : ""}
   - **Detail EXACTLY how it solves the pain cluster**: ${gap.painCluster || brandContext.painClusters[0] || "General business challenges"}
   - Show how the value proposition addresses this pain: ${productLine ? `${productLine.name}'s value proposition: ${productLine.valueProposition}` : brandContext.valueProposition || "Not specified"}
   - Explain how differentiators solve it: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
   - Reference relevant use cases: ${brandContext.useCases.join(", ") || "Not specified"}
   ${productLine ? `- **CRITICAL**: This content is specifically for the "${productLine.name}" product line. Use the product line's value proposition and target ICPs (${productLine.specificICP.join(", ")}) throughout the brief.` : ""}
   ${trendingTopics && trendingTopics.length > 0
     ? "- Show how trending topics enhance relevance and connect to pain cluster solutions"
     : ""}

2. **Content Structure** (for ${selectedIdea.assetType})
   - **MUST include a section that directly addresses the pain cluster**: ${gap.painCluster || brandContext.painClusters[0] || "Not specified"}
   ${selectedIdea.assetType === "Infographic"
     ? `- **For Infographic**: Provide visual structure with:
     * Layout sections (e.g., header, main content areas, footer)
     * Visual elements needed per section (charts, icons, diagrams)
     * Text content for each visual element (headlines, statistics, captions)
     * Data visualizations required (bar charts, pie charts, flow diagrams, timelines)
     * Color and design recommendations
     * Estimated dimensions and format`
     : selectedIdea.assetType === "Webinar_Recording"
     ? `- **For Webinar Recording**: Provide script structure with:
     * Opening hook and introduction
     * Main presentation sections (3-5 key sections)
     * Slide-by-slide outline with talking points
     * Interactive elements (polls, Q&A preparation)
     * Closing and call-to-action
     * Estimated duration (typically 30-60 minutes)
     * Supporting materials needed (handouts, follow-up content)`
     : `- Provide 3-5 recommended sections with:
     * Section title
     * Key messages per section (2-3 messages) - each should relate to solving the pain cluster
     * How this section solves the pain cluster (be specific)
     * Data points/statistics to include (reference ROI claims: ${brandContext.roiClaims.join(", ") || "Not specified"})
     ${trendingTopics && trendingTopics.length > 0
       ? "* Trending topic references per section (showing how they relate to pain cluster solutions)"
       : ""}
   - Estimate total word count based on asset type:
     * Whitepaper: 2000-4000 words
     * Case Study: 1000-2000 words
     * Blog Post: 800-1500 words
     * Technical Doc: Variable`}

3. **Tone & Style Guidelines**
   - Brand voice: ${brandVoiceText}
   - Specific tone requirements for ${icpDisplayText}${icpTargets.length > 1 ? ` (consider tone that appeals to all ${icpTargets.length} ICP roles)` : ""}
   - What to avoid (AI writing traps and generic marketing speak)

4. **Success Metrics**
   - What makes this content successful
   - How it should be used in sales/marketing
   - Engagement indicators to track

5. **Content Gaps to Address**
   - Topics to explore deeply
   - Questions this content should answer
   - Areas that need specific data/examples

6. **SEO Strategy**
   ${keywordResults.length > 0
     ? `- Based on the keyword research data provided above, select:
     * Primary Keyword (the single most valuable)
     * 2-3 Secondary Keywords (supporting keywords)
     * Target Search Intent (based on funnel stage)
     * Implementation Notes (WHERE and HOW to use keywords naturally)`
     : `- Provide strategic SEO guidance based on the content topic and funnel stage
     * Primary Keyword (strategically valuable keyword)
     * 2-3 Secondary Keywords (supporting keywords)
     * Target Search Intent (informational, commercial, or transactional based on ${gap.stage})
     * Implementation Notes (WHERE and HOW to use keywords naturally)`}

OUTPUT:
Provide a comprehensive brief matching the schema.`;

    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(ContentBriefSchema, "content_brief"),
      temperature: 0.5,
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate content brief");
    }

    // Include API warnings in response (only visible to admins)
    return NextResponse.json({
      ...result,
      _apiWarnings: isAdmin ? apiWarnings : undefined, // Undefined = not shown to non-admins
    });
  } catch (error) {
    console.error("Error generating content brief:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate content brief",
      },
      { status: 500 }
    );
  }
}
