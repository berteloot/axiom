import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import { getPresignedDownloadUrl, extractKeyFromS3Url } from "@/lib/s3";
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
  assetIds: z.array(z.string().min(1)).min(2).max(5),
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

    const systemPrompt = `You are an expert B2B email marketing specialist. Write emails like a helpful colleague, not a marketer.

${brandVoiceText}

LENGTH & STRUCTURE:
- Maximum 120 words per email
- 3-4 short paragraphs, each 1-3 sentences max
- Get to the point in the first 2 sentences

TONE & LANGUAGE:
- Conversational, plain language
- Use contractions naturally (you'll, we've, it's)
- Replace vague claims with specific, concrete benefits
- NEVER use these words: "unlock", "optimize", "leverage", "transform", "harness", "elevate", "seamless", "cutting-edge", "game-changing", "revolutionary", "empower", "robust", "synergy", "breakthrough", "discover", "explore"
- NEVER use phrases like: "in today's rapidly evolving", "don't miss out", "take the next step", "this is your opportunity"

SUBJECT LINES:
- Specific and benefit-focused
- No hype or urgency tactics
- No colons unless absolutely necessary
- Focus on "what's in it for them"

CONTENT RULES:
- Use ONLY the provided asset titles and atomic snippets as proof points
- Do NOT invent statistics, quotes, customers, or outcomes
- Lead with a problem or specific situation they recognize
- Be direct about what the resource contains
- Use "real", "actual", "specific" to add credibility
- Reference concrete outcomes, not abstract benefits
- Connect each email to the previous one naturally
- Make CTAs simple and clear (e.g., "Here's the link", "Take a look", "Let me know what you think")

WHAT TO AVOID:
- Exclamation points
- Multiple questions in one email
- Overenthusiastic language
- Claims without specifics
- Passive voice
- Corporate buzzwords
- Salesy pressure tactics`;

    const emailRequirements = sortedAssets.map((asset, index) => {
      const stage = asset.funnelStage;
      if (index === 0) {
        return `- **Email ${index + 1} (${stage}):** Introduce a relevant problem they recognize, then position "${asset.title}" as helpful. Be direct about what it contains.`;
      } else if (stage === 'BOFU_DECISION') {
        return `- **Email ${index + 1} (${stage}):** Reference the previous email briefly, then show real-world proof through "${asset.title}". Focus on concrete results.`;
      } else {
        return `- **Email ${index + 1} (${stage}):** Reference the previous email briefly, then go deeper on a specific application with "${asset.title}". Build on what they've already seen.`;
      }
    }).join("\n");

    const userPrompt = `Create a ${emailCount}-email nurture sequence using these assets:

${assetDescriptions}

**Email Flow:**
${emailRequirements}

**Remember:**
- Maximum 120 words per email
- Use the atomic snippets as specific proof points
- No marketing jargon or hype
- Write like you're helping a colleague
- Generate exactly ${emailCount} emails, one for each asset`;

    // Call OpenAI (increased max_tokens for up to 5 emails)
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(SequenceSchema, "sequence"),
      temperature: 0.35,
      max_tokens: 2000,
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate sequence");
    }

    if (!Array.isArray(result.emails) || result.emails.length !== emailCount) {
      throw new Error(`AI returned ${result.emails?.length ?? 0} emails, expected ${emailCount}`);
    }

    // Generate presigned URLs for each asset (valid for 7 days)
    const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
    const assetsWithPresignedUrls = await Promise.all(
      sortedAssets.map(async (asset) => {
        let publicUrl = asset.s3Url;
        
        try {
          const s3Key = extractKeyFromS3Url(asset.s3Url);
          if (s3Key) {
            publicUrl = await getPresignedDownloadUrl(s3Key, SEVEN_DAYS_IN_SECONDS);
          }
        } catch (error) {
          console.error(`Failed to generate presigned URL for asset ${asset.id}:`, error);
          // Fall back to original URL if presigning fails
        }
        
        return {
          id: asset.id,
          title: asset.title,
          funnelStage: asset.funnelStage,
          s3Url: publicUrl,
          atomicSnippets: Array.isArray(asset.atomicSnippets) ? asset.atomicSnippets.slice(0, 5) : [],
        };
      })
    );

    return NextResponse.json({
      success: true,
      sequence: {
        assets: assetsWithPresignedUrls,
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
