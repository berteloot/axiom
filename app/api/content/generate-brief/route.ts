import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

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

    const trendingTopicsText = trendingTopics && trendingTopics.length > 0
      ? `
TRENDING TOPICS TO INTEGRATE:
${trendingTopics.map((topic: string, i: number) => `  ${i + 1}. ${topic}`).join("\n")}

Use these trending topics naturally within the content structure. Show how they connect to pain clusters and business outcomes.
`
      : "";

    const systemPrompt = `You are a Senior B2B Content Strategist creating a detailed content brief.

Your goal is to create a comprehensive content brief that:
1. **PRIMARY: Solves the pain cluster(s)** - The content must clearly solve the identified pain cluster(s)
2. Positions the content strategically for the ICP and funnel stage
3. Integrates trending topics naturally (if available) - showing how they relate to pain cluster solutions
4. Leverages brand identity (value proposition, differentiators, use cases) to solve pain clusters
5. Provides clear structure and guidance
6. Ensures brand voice consistency
7. Follows B2B content best practices

🔴 CRITICAL: The content brief must demonstrate HOW the content solves the pain cluster(s) using the organization's value proposition, differentiators, and use cases.

B2B CONTENT BEST PRACTICES:
- Problem-first structure (agitate pain, then present solution)
- Use specific data and metrics (reference ROI claims)
- Address business outcomes, not just features
- Include quantifiable benefits
- Use industry-specific terminology appropriately

AVOID AI WRITING TRAPS:
❌ NEVER use: "delve", "tapestry", "landscape", "game-changer", "unlocking", "unleash", "realm"
❌ NEVER use: Generic phrases like "best-in-class", "industry-leading" without proof
❌ NEVER use: Engagement bait ("Agree?", "Thoughts?", "What do you think?")
❌ NEVER use: Vague qualifiers without justification

${brandContextText}`;

    const userPrompt = `Create a comprehensive content brief for this selected idea:

SELECTED IDEA:
- Title/Concept: ${selectedIdea.title}
- Asset Type: ${selectedIdea.assetType}
- ICP: ${gap.icp}
- Funnel Stage: ${gap.stage}
- Pain Cluster: ${gap.painCluster || "General business challenges"}
- Key Message: ${selectedIdea.keyMessage}

${trendingTopicsText}

REQUIREMENTS:

🔴 CRITICAL: This content MUST solve the pain cluster(s). Every section must demonstrate HOW the content solves it.

1. **Strategic Positioning**
   - Explain why this content matters for ${gap.icp} at ${gap.stage} stage
   - **Detail EXACTLY how it solves the pain cluster**: ${gap.painCluster || brandContext.painClusters[0] || "General business challenges"}
   - Show how the value proposition addresses this pain: ${brandContext.valueProposition || "Not specified"}
   - Explain how differentiators solve it: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
   - Reference relevant use cases: ${brandContext.useCases.join(", ") || "Not specified"}
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
   - Specific tone requirements for ${gap.icp}
   - What to avoid (AI writing traps and generic marketing speak)

4. **Success Metrics**
   - What makes this content successful
   - How it should be used in sales/marketing
   - Engagement indicators to track

5. **Content Gaps to Address**
   - Topics to explore deeply
   - Questions this content should answer
   - Areas that need specific data/examples

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

    return NextResponse.json(result);
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
