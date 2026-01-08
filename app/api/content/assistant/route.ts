import { NextRequest, NextResponse } from "next/server";
import { requireAccountId } from "@/lib/account-utils";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AssistantResponseSchema = z.object({
  answer: z.string().describe("Comprehensive, strategic answer to the user's question"),
  recommendations: z.array(z.string()).optional().describe("Actionable recommendations if applicable"),
  sources: z.array(z.string()).optional().describe("Relevant sources or assets referenced"),
});

/**
 * Calculates strategic matrix data (gaps, coverage) from assets
 */
function calculateStrategicMatrix(assets: any[], icps: string[], painClusters: string[]) {
  const stages = ["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"];
  
  // Build ICP matrix
  const icpMatrix: Record<string, Record<string, number>> = {};
  icps.forEach(icp => {
    icpMatrix[icp] = {};
    stages.forEach(stage => {
      icpMatrix[icp][stage] = assets.filter(a => {
        const icpTargets = Array.isArray(a.icpTargets) ? a.icpTargets : [];
        return icpTargets.includes(icp) && a.funnelStage === stage;
      }).length;
    });
  });
  
  // Build pain cluster matrix
  const painMatrix: Record<string, Record<string, number>> = {};
  painClusters.forEach(pc => {
    painMatrix[pc] = {};
    stages.forEach(stage => {
      painMatrix[pc][stage] = assets.filter(a => {
        const painClusters = Array.isArray(a.painClusters) ? a.painClusters : [];
        return painClusters.includes(pc) && a.funnelStage === stage;
      }).length;
    });
  });
  
  // Find gaps (empty cells)
  const gaps: Array<{ type: "icp" | "pain"; key: string; stage: string }> = [];
  
  Object.entries(icpMatrix).forEach(([icp, stages]) => {
    Object.entries(stages).forEach(([stage, count]) => {
      if (count === 0) {
        gaps.push({ type: "icp", key: icp, stage });
      }
    });
  });
  
  Object.entries(painMatrix).forEach(([pc, stages]) => {
    Object.entries(stages).forEach(([stage, count]) => {
      if (count === 0) {
        gaps.push({ type: "pain", key: pc, stage });
      }
    });
  });
  
  return { icpMatrix, painMatrix, gaps };
}

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const { question, conversationHistory, gapContext } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    // Fetch ALL context data
    const [brandContext, assets, productLines] = await Promise.all([
      prisma.brandContext.findUnique({
        where: { accountId },
      }),
      prisma.asset.findMany({
        where: { accountId },
        include: {
          productLines: {
            include: {
              productLine: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  valueProposition: true,
                  specificICP: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.productLine.findMany({
        where: { accountId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Transform assets - handle both direct productLines and nested structure
    const transformedAssets = assets.map(asset => {
      let productLines = [];
      if (asset.productLines && Array.isArray(asset.productLines)) {
        productLines = asset.productLines.map((ap: any) => {
          // Handle both nested structure (ap.productLine) and direct structure
          return ap.productLine || ap;
        });
      }
      
      return {
        ...asset,
        productLines,
        icpTargets: Array.isArray(asset.icpTargets) ? asset.icpTargets : [],
        painClusters: Array.isArray(asset.painClusters) ? asset.painClusters : [],
      };
    });

    // Calculate strategic matrix
    const icps = brandContext?.primaryICPRoles || [];
    const painClusters = brandContext?.painClusters || [];
    const matrixData = calculateStrategicMatrix(transformedAssets, icps, painClusters);

    // Calculate coverage score
    const totalCells = (icps.length + painClusters.length) * 4; // 4 stages
    const filledCells = totalCells - matrixData.gaps.length;
    const coverageScore = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

    // Build gap-specific context if provided
    const gapContextString = gapContext ? `
CURRENT CONTENT CREATION CONTEXT (ACTIVE GAP):
- Target ICP: ${gapContext.icp}${gapContext.icpTargets && gapContext.icpTargets.length > 0 ? ` (also targeting: ${gapContext.icpTargets.join(", ")})` : ""}
- Funnel Stage: ${gapContext.stage}
- Pain Cluster: ${gapContext.painCluster || "Not specified"}
${gapContext.productLineName ? `- Product Line: ${gapContext.productLineName}` : ""}

This question is being asked while creating content for this specific gap. Your answer should be highly relevant to this context.
` : "";

    // Build comprehensive context string
    const contextString = `
COMPLETE BRAND IDENTITY:
- Brand Voice: ${brandContext?.brandVoice || "Not set"}
- Primary ICP Roles: ${icps.join(", ") || "Not set"}
- Target Industries: ${brandContext?.targetIndustries?.join(", ") || "Not set"}
- Value Proposition: ${brandContext?.valueProposition || "Not set"}
- ROI Claims: ${brandContext?.roiClaims?.join(", ") || "Not set"}
- Key Differentiators: ${brandContext?.keyDifferentiators?.join(", ") || "Not set"}
- Use Cases: ${brandContext?.useCases?.join(", ") || "Not set"}
- Pain Clusters: ${painClusters.join(", ") || "Not set"}
- Competitors: ${brandContext?.competitors?.join(", ") || "Not set"}

ASSET LIBRARY STATUS:
- Total Assets: ${transformedAssets.length}
- Coverage Score: ${coverageScore}%
- Assets by Stage:
  * TOFU: ${transformedAssets.filter(a => a.funnelStage === "TOFU_AWARENESS").length}
  * MOFU: ${transformedAssets.filter(a => a.funnelStage === "MOFU_CONSIDERATION").length}
  * BOFU: ${transformedAssets.filter(a => a.funnelStage === "BOFU_DECISION").length}
  * RETENTION: ${transformedAssets.filter(a => a.funnelStage === "RETENTION").length}

CRITICAL GAPS (Empty Cells):
${matrixData.gaps.slice(0, 20).map(g => 
  `- ${g.type === "icp" ? `ICP: ${g.key}` : `Pain Cluster: ${g.key}`} - ${g.stage}`
).join("\n")}
${matrixData.gaps.length > 20 ? `... and ${matrixData.gaps.length - 20} more gaps` : ""}

RECENT ASSETS (Last 10):
${transformedAssets.slice(0, 10).map(a => 
  `- "${a.title}" (${a.funnelStage}, ICPs: ${a.icpTargets?.join(", ") || "None"}, Pain Clusters: ${a.painClusters?.join(", ") || "None"})`
).join("\n")}

PRODUCT LINES:
${productLines.map(pl => 
  `- ${pl.name}: ${pl.description || "No description"} (Value Prop: ${pl.valueProposition || "Not set"})`
).join("\n") || "No product lines defined"}

STRATEGIC MATRIX SUMMARY:
- ICP Coverage: ${icps.length} ICPs × 4 stages = ${icps.length * 4} cells
- Pain Cluster Coverage: ${painClusters.length} pain clusters × 4 stages = ${painClusters.length * 4} cells
- Total Gaps: ${matrixData.gaps.length}
- Most Gaps in: ${matrixData.gaps.length > 0 ? 
  Object.entries(
    matrixData.gaps.reduce((acc, g) => {
      const key = g.type === "icp" ? `ICP:${g.key}` : `Pain:${g.key}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A" : "N/A"}
`;

    // Build system prompt
    const systemPrompt = `You are a Senior B2B Content Strategy Advisor with deep expertise in:
- Strategic content planning and gap analysis
- ICP targeting and funnel stage optimization
- Pain cluster-based content strategy
- Content quality assessment and improvement
- Competitive positioning through content

You have COMPLETE visibility into the user's:
1. Brand identity (voice, ICPs, industries, value props, pain clusters, differentiators)
2. Current asset library (all assets, their stages, ICPs, pain clusters)
3. Strategic gaps (empty cells in the matrix)
4. Product lines and their positioning
5. Coverage scores and distribution

Your role is to provide:
- Strategic, actionable answers to questions
- Context-aware recommendations based on their actual data
- Specific guidance on what content to create next
- Analysis of their current content strategy
- Suggestions for improving coverage and quality

CRITICAL: Always reference specific data from their context. For example:
- "You have 0 TOFU assets for CFO in Brownfield Migration Challenges"
- "Your coverage score is 50%, with 8 critical gaps"
- "You have 14 MOFU assets but 0 TOFU assets"

Be specific, actionable, and reference their actual brand identity, assets, and gaps.`;

    // Build user prompt with context
    const userPrompt = `${gapContextString}${contextString}

USER QUESTION:
${question}

${conversationHistory && conversationHistory.length > 0 ? `
CONVERSATION HISTORY:
${conversationHistory.map((msg: any) => 
  `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
).join("\n\n")}
` : ""}

Please provide a comprehensive, strategic answer that:
1. Directly addresses the question
2. References specific data from their context (assets, gaps, brand identity)
3. Provides actionable recommendations
4. Is formatted clearly with sections if needed
5. Suggests next steps when relevant`;

    // Call OpenAI
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(AssistantResponseSchema, "assistant_response"),
      temperature: 0.7,
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("Failed to generate assistant response");
    }

    return NextResponse.json({
      answer: result.answer,
      recommendations: result.recommendations || [],
      sources: result.sources || [],
    });
  } catch (error) {
    console.error("Error in content assistant:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("Full error details:", {
      message: errorMessage,
      stack: errorStack,
      error: error,
    });
    
    return NextResponse.json(
      { 
        error: errorMessage,
        answer: `I apologize, but I encountered an error processing your question: ${errorMessage}. Please try again or contact support if the issue persists.`,
        recommendations: [],
        sources: [],
      },
      { status: 500 }
    );
  }
}
