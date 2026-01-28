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

    // Extract URLs for each asset first (needed for prompt)
    const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
    const assetsWithUrlsForPrompt = await Promise.all(
      sortedAssets.map(async (asset) => {
        let assetUrl: string | null = null;
        
        // Try to extract sourceUrl from atomicSnippets (for imported content)
        const snippets = asset.atomicSnippets;
        if (snippets) {
          if (typeof snippets === 'object' && !Array.isArray(snippets) && (snippets as any).sourceUrl) {
            assetUrl = (snippets as any).sourceUrl;
          } else if (Array.isArray(snippets) && snippets.length > 0) {
            const firstItem = snippets[0];
            if (typeof firstItem === 'object' && (firstItem as any).sourceUrl) {
              assetUrl = (firstItem as any).sourceUrl;
            }
          }
        }
        
        // If no sourceUrl found, generate presigned S3 URL
        if (!assetUrl) {
          try {
            const s3Key = extractKeyFromS3Url(asset.s3Url);
            if (s3Key) {
              assetUrl = await getPresignedDownloadUrl(s3Key, SEVEN_DAYS_IN_SECONDS);
            } else {
              assetUrl = asset.s3Url;
            }
          } catch (error) {
            assetUrl = asset.s3Url;
          }
        }
        
        return { ...asset, resolvedUrl: assetUrl };
      })
    );

    const emailCount = sortedAssets.length;

    // Format funnel stage for display
    const formatStage = (stage: string) => {
      if (stage === 'TOFU_AWARENESS') return 'TOFU - AWARENESS';
      if (stage === 'MOFU_CONSIDERATION') return 'MOFU - CONSIDERATION';
      if (stage === 'BOFU_DECISION') return 'BOFU - DECISION';
      if (stage === 'RETENTION') return 'RETENTION';
      return stage.replace('_', ' - ');
    };

    // Build asset descriptions with URLs
    const assetDescriptions = assetsWithUrlsForPrompt.map((asset, index) => {
      const snippets = asset.atomicSnippets ? 
        (Array.isArray(asset.atomicSnippets) ? asset.atomicSnippets : []) : [];
      
      const snippetText = snippets
        .slice(0, 3)
        .map((s: any) => `- ${s.content || s}`)
        .join("\n");

      return `**Asset ${index + 1} (${formatStage(asset.funnelStage)}):** ${asset.title}
Link: ${asset.resolvedUrl}
Key Points (atomic snippets):
${snippetText || "- No snippets available"}`;
    }).join("\n\n");

    const systemPrompt = `You are an expert B2B email marketing specialist. Your job is to write emails that sound like they come from a helpful colleague sharing useful resources—not from a marketing department.

${brandVoiceText}

CRITICAL RULES - READ CAREFULLY:

LENGTH & STRUCTURE:
- Maximum 120 words per email (count carefully)
- 3-4 short paragraphs maximum
- Each paragraph: 1-3 sentences only
- First paragraph (2 sentences max): Hook with a specific problem or situation
- Middle paragraph(s): What's in the resource, using atomic snippets as proof
- Final paragraph (1-2 sentences): Simple CTA

FORBIDDEN WORDS & PHRASES - NEVER USE:
Words: unlock, optimize, leverage, transform, harness, elevate, seamless, cutting-edge, game-changing, revolutionary, empower, robust, synergy, breakthrough, discover, explore, enhance, drive, enable, deliver, maximize, streamline

Phrases: "in today's [anything]", "don't miss out", "take the next step", "this is your opportunity", "I hope you found", "thank you for engaging", "now that you", "it's time to", "dear [name]"

REQUIRED LANGUAGE STYLE:
- Write in first person when relevant ("we've seen", "I noticed")
- Use contractions: you'll, we've, it's, that's, here's
- Be specific, never vague ("cut forecast time" not "improve efficiency")
- Use casual connectors: "since", "worth noting", "pairs well with"
- Start emails naturally: "Hi [Name]," (never "Dear" or "Hello there")
- End simply: "Best," or "[Your Name]" (never "Best regards," or "Sincerely,")

SUBJECT LINES:
- 6-8 words maximum
- State a benefit or outcome, not a topic
- Use concrete language, avoid abstractions
- NO colons, NO "how to", NO questions
- Examples of GOOD subjects: "Why SAP shops are adding AI now" / "AI agents that handle IBP forecasts"
- Examples of BAD subjects: "Unlock AI Value" / "How to: Enhance Your Forecasts" / "Ready to Transform?"

CONTENT REQUIREMENTS:
- Lead with a SPECIFIC problem readers recognize (not "many companies struggle")
- Use ONLY the atomic snippets provided—never invent stats, quotes, or outcomes
- State what's IN the resource clearly ("covers X, Y, and Z" or "shows how [specific thing]")
- Connect emails naturally without templates ("Following up on..." is OK sparingly)
- Make the resource sound useful, not amazing ("worth a look" not "game-changing guide")

CALL-TO-ACTION RULES:
- Keep CTAs conversational and low-pressure
- Good CTAs: "Here's the link" / "Take a look" / "Worth reading if [condition]"
- Bad CTAs: "Download now" / "Don't miss this" / "Click here to unlock"
- Always place the link on its own line in plain text format

WHAT TO ABSOLUTELY AVOID:
- Exclamation points anywhere
- More than one question per email
- Enthusiastic/salesy tone
- Vague benefits ("better insights", "improved outcomes")
- Passive voice ("can be achieved", "is enhanced by")
- Repeating the same transition phrases
- Making claims beyond what atomic snippets support

QUALITY CHECKLIST BEFORE OUTPUT:
□ No forbidden words or phrases used
□ Under 120 words each
□ Subject line is benefit-focused and under 8 words
□ Opens with specific problem, not generic statement
□ Uses actual atomic snippets, not invented content
□ CTA is simple and conversational
□ Sounds like a colleague, not marketing
□ Link included in plain text format`;

    // Build per-email instructions based on funnel stages
    const emailInstructions = assetsWithUrlsForPrompt.map((asset, index) => {
      const stage = asset.funnelStage;
      const isFirst = index === 0;
      const isLast = index === emailCount - 1;
      const isBOFU = stage === 'BOFU_DECISION';
      
      if (isFirst) {
        return `Email ${index + 1} (${formatStage(stage)}):
- Open with a specific problem the reader faces (be concrete, not generic)
- Position "${asset.title}" as addressing that problem
- State clearly what's inside using 1-2 atomic snippets as proof
- Keep it under 120 words
- Subject line: Focus on the problem or benefit, NOT the topic
- Include link: ${asset.resolvedUrl}`;
      } else if (isBOFU || isLast) {
        const prevTitles = assetsWithUrlsForPrompt.slice(0, index).map(a => a.title).join(', ');
        return `Email ${index + 1} (${formatStage(stage)}):
- Acknowledge the journey briefly ("You've seen ${prevTitles}...")
- Position "${asset.title}" as real-world proof/example
- Focus on tangible outcomes from atomic snippets
- Keep it results-focused, not hype-focused
- Include link: ${asset.resolvedUrl}`;
      } else {
        const prevAsset = assetsWithUrlsForPrompt[index - 1];
        return `Email ${index + 1} (${formatStage(stage)}):
- Reference Email ${index} casually (e.g., "Since you looked at ${prevAsset.title}...")
- Position "${asset.title}" as going deeper or addressing related challenge
- Use atomic snippets to show specific value
- Keep connection natural, not formulaic
- Include link: ${asset.resolvedUrl}`;
      }
    }).join("\n\n");

    const userPrompt = `Create a ${emailCount}-email nurture sequence using these assets in order:

${assetDescriptions}

---

INSTRUCTIONS FOR EACH EMAIL:

${emailInstructions}

---

CRITICAL REMINDERS:
- Use ONLY the atomic snippets provided—do not invent statistics, outcomes, or customer names
- Keep each email under 120 words (count carefully)
- Include the exact link provided for each email in plain text format
- Write like a helpful colleague, not a marketer
- No forbidden words or phrases
- Subject lines must be benefit-focused and under 8 words

Generate exactly ${emailCount} emails now.`;

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

    // Use the already-resolved URLs from prompt preparation
    const assetsForResponse = assetsWithUrlsForPrompt.map((asset) => ({
      id: asset.id,
      title: asset.title,
      funnelStage: asset.funnelStage,
      s3Url: asset.resolvedUrl,
      atomicSnippets: Array.isArray(asset.atomicSnippets) ? asset.atomicSnippets.slice(0, 5) : [],
    }));

    return NextResponse.json({
      success: true,
      sequence: {
        assets: assetsForResponse,
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
