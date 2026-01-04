import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { FunnelStage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BodySchema = z.object({
  assetIds: z.array(z.string().min(1)).min(2).max(4),
});

// Schema for sequence email response
const EmailSchema = z.object({
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body text"),
});

const SequenceSchema = z.object({
  emails: z.array(EmailSchema).describe("Array of emails in sequence order (same length as assets)"),
});

// Funnel stage order for sorting (TOFU -> MOFU -> BOFU)
const STAGE_ORDER: Record<FunnelStage, number> = {
  TOFU_AWARENESS: 1,
  MOFU_CONSIDERATION: 2,
  BOFU_DECISION: 3,
  RETENTION: 4,
};

// Sort assets by funnel stage, then by quality score
function sortAssetsByStage(assets: any[]) {
  return [...assets].sort((a, b) => {
    const stageA = STAGE_ORDER[a.funnelStage as FunnelStage] || 999;
    const stageB = STAGE_ORDER[b.funnelStage as FunnelStage] || 999;
    
    if (stageA !== stageB) {
      return stageA - stageB;
    }
    
    // If same stage, sort by quality score (higher first)
    const scoreA = a.contentQualityScore || 0;
    const scoreB = b.contentQualityScore || 0;
    return scoreB - scoreA;
  });
}

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { assetIds } = parsed.data;

    // Fetch the selected assets with their metadata
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: assetIds },
        accountId,
      },
      select: {
        id: true,
        title: true,
        funnelStage: true,
        s3Url: true,
        atomicSnippets: true,
        contentQualityScore: true,
      },
    });

    if (assets.length !== assetIds.length) {
      return NextResponse.json(
        { error: "Some assets were not found" },
        { status: 404 }
      );
    }

    // Sort assets by funnel stage (TOFU -> MOFU -> BOFU)
    const sortedAssets = sortAssetsByStage(assets);

    // Fetch brand context for tone
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
    });

    const brandVoice = brandContext?.brandVoice || [];
    const brandVoiceText = brandVoice.length > 0 
      ? `Brand Voice: ${brandVoice.join(", ")}`
      : "Brand Voice: Professional, Customer-Centric";

    // Build the prompt for OpenAI
    const assetDescriptions = sortedAssets.map((asset, index) => {
      const snippets = asset.atomicSnippets ? 
        (Array.isArray(asset.atomicSnippets) ? asset.atomicSnippets : []) : [];
      
      const snippetText = snippets
        .slice(0, 3) // Use top 3 snippets
        .map((s: any) => `- ${s.content}`)
        .join("\n");

      const stageLabel = String(asset.funnelStage).split("_").join(" ");
      return `**Asset ${index + 1} (${stageLabel}):** ${asset.title}
${snippetText ? `Key Points:\n${snippetText}` : ""}`;
    }).join("\n\n");

    const emailCount = sortedAssets.length;

    const systemPrompt = `You are an expert B2B marketing email copywriter.
Your task is to create a ${emailCount}-email nurture sequence that tells a cohesive story across the provided assets.

${brandVoiceText}

Rules:
- Use ONLY the provided asset titles and atomic snippets as proof points. Do not invent statistics, quotes, customers, or outcomes.
- Each email should build on the previous one and naturally bridge to the next asset.
- Keep the tone professional and personal (not generic).
- Include one clear CTA per email (reply, read, watch, or ask a question).`;

    const emailRequirements = sortedAssets.map((asset, index) => {
      if (index === 0) {
        return `- **Email ${index + 1}:** Introduce ${asset.title}. Focus on the problem it addresses. Make it compelling and relevant.`;
      } else {
        return `- **Email ${index + 1}:** Acknowledge they received the previous asset. Bridge to ${asset.title} by building on what they learned. Say something like "Now that you understand [previous concept], here's the ${index === emailCount - 1 && asset.funnelStage === 'BOFU_DECISION' ? 'proof/solution' : 'next step'}..." or similar bridging language.`;
      }
    }).join("\n");

    const userPrompt = `Create a ${emailCount}-email nurture sequence using these ${emailCount} assets:

${assetDescriptions}

**Requirements:**
${emailRequirements}

**Constraints:**
- Use the atomic snippets as key proof points in the copy
- Each email should be 120-180 words
- Subject lines should be compelling and action-oriented
- Tone: ${brandVoiceText}
- Make it feel personal, not generic
- Generate exactly ${emailCount} emails, one for each asset`;

    // Call OpenAI
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(SequenceSchema, "sequence"),
      temperature: 0.35,
      max_tokens: 1200,
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate sequence");
    }

    if (!Array.isArray(result.emails) || result.emails.length !== emailCount) {
      throw new Error(`AI returned ${result.emails?.length ?? 0} emails, expected ${emailCount}`);
    }

    return NextResponse.json({
      success: true,
      sequence: {
        assets: sortedAssets.map(asset => ({
          id: asset.id,
          title: asset.title,
          funnelStage: asset.funnelStage,
          s3Url: asset.s3Url,
          atomicSnippets: Array.isArray(asset.atomicSnippets) ? asset.atomicSnippets.slice(0, 5) : [],
        })),
        emails: result.emails,
      },
    });
  } catch (error) {
    console.error("Error generating sequence:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to generate sequence", details: process.env.NODE_ENV === "development" ? errorMessage : undefined },
      { status: 500 }
    );
  }
}
