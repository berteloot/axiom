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

const LinkedInPostSchema = z.object({
  content: z.string().describe("The full LinkedIn post content (should be 500-1000 characters for optimal B2B engagement, max 3000)"),
  hashtags: z.array(z.string()).max(5).describe("3-5 relevant hashtags (without the # symbol)"),
  hook: z.string().describe("The attention-grabbing first line (counter-intuitive statement or hard stat, NOT engagement bait)"),
  cta: z.string().describe("The call-to-action at the end (must reference 'Link in comments' or 'See link below', never include URL)"),
  characterCount: z.number().describe("Character count of the content"),
  estimatedEngagement: z.enum(["high", "medium", "low"]).describe("Estimated engagement level based on authority and value, not virality"),
  reasoning: z.string().describe("Brief explanation of why this post should perform well (focus on authority, depth, and value)"),
});

const LinkedInPostsSchema = z.object({
  posts: z.array(LinkedInPostSchema).length(3).describe("Three variations of LinkedIn posts with different hooks/angles"),
});

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const { assetId } = body;

    if (!assetId) {
      return NextResponse.json(
        { error: "Asset ID is required" },
        { status: 400 }
      );
    }

    // Fetch the asset
    const asset = await prisma.asset.findUnique({
      where: {
        id: assetId,
        accountId,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    // Fetch brand context for tone
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
    });

    const brandVoice = brandContext?.brandVoice || [];
    const brandVoiceText = brandVoice.length > 0 
      ? `Brand Voice: ${brandVoice.join(", ")}`
      : "Brand Voice: Professional, Customer-Centric";

    // Extract atomic snippets
    const snippets = asset.atomicSnippets ? 
      (Array.isArray(asset.atomicSnippets) ? asset.atomicSnippets : []) : [];
    
    const snippetText = snippets
      .slice(0, 5) // Use top 5 snippets
      .map((s: any) => {
        const typeLabel = s.type?.replace("_", " ") || "Point";
        return `- [${typeLabel}] ${s.content}`;
      })
      .join("\n");

    // Build context for the AI
    const assetContext = `
**Asset:** ${asset.title}
**Funnel Stage:** ${asset.funnelStage.replace("_", " - ")}
**Target Audience:** ${asset.icpTargets.join(", ")}
**Pain Points:** ${asset.painClusters.join(", ")}
**Outreach Tip:** ${asset.outreachTip}

${snippetText ? `**Key Insights:**\n${snippetText}` : ""}
`;

    const systemPrompt = `You are a B2B Ghostwriter for a C-Level Executive.
Your goal is to write high-status, insightful LinkedIn posts that drive clicks to a specific asset.

TONE GUIDELINES:
- **Authority over Virality:** Do not write "engagement bait" (e.g., "Agree? 👇"). Write to educate peers.
- **Smart Brevity:** Use short sentences. Punchy. Direct.
- **No Fluff:** If a sentence doesn't add value, delete it.
- **Formatting:** Use line breaks frequently to make the text scannable. Use bullet points for lists.
- **Emoji Use:** Minimal. Use 1 or 2 max. Do not use the 🚀 or 🧵 emojis.

${brandVoiceText}

⛔ NEGATIVE CONSTRAINTS (INSTANT FAIL IF USED):
- NEVER use these words: "Delve", "Tapestry", "Landscape", "Game-changer", "Unlocking", "Unleash", "Realm", "In today's fast-paced world".
- NEVER start with "I'm thrilled to announce..."
- NEVER use the phrase "It's not X, but Y." (The rhetorical trap).
- NEVER use engagement farming phrases like "Agree?", "Thoughts?", "What do you think?", "Drop a comment below", "Double tap if...".

LENGTH STRATEGY:
- Aim for 500-1000 characters (allows for depth). 
- If the user requests "Short", keep it under 300.
- But prioritize *value* over brevity.

LINK STRATEGY:
- LinkedIn penalizes links in the post body.
- The CTA should direct the user to "Link in the comments" or "See the link below" or "DM me for the link".
- Never put a URL directly in the post body.

YOUR WRITING FORMULA:
1. **The Hook:** A counter-intuitive statement or a hard stat.
2. **The Problem:** Agitate the specific Pain Cluster.
3. **The Insight:** Reveal a specific "Atomic Snippet" from the asset.
4. **The CTA:** Soft sell the asset as the solution.

**Engagement Levels:**
- **High**: Has strong hook, specific numbers/stats, clear value proposition, optimal length (500-1000 chars), no engagement bait
- **Medium**: Good structure but missing some depth or specific insights
- **Low**: Generic content, weak hook, no clear value proposition, uses blacklisted words`;

    const userPrompt = `Create 3 LinkedIn post variations for this asset.

=== STRATEGIC CONTEXT ===
BRAND VOICE: "${brandVoiceText}"
TARGET ICP: ${asset.icpTargets.join(", ")} (Speak directly to these roles)
PAIN CLUSTERS: ${asset.painClusters.join(", ")} (Agitate these specific problems)
ATOMIC SNIPPETS: 
${snippetText || "No snippets available"}

=== ASSET DETAILS ===
TITLE: "${asset.title}"
FUNNEL STAGE: "${asset.funnelStage.replace("_", " - ")}"
OUTREACH TIP: "${asset.outreachTip}"

=== INSTRUCTIONS ===
Generate 3 variations following these specific angles:

1. THE "DATA-BACKED" POST
   - Hook: Start immediately with the strongest ROI_STAT snippet.
   - Body: Explain why this number matters to the ICP.
   - Tone: Analytical, objective.
   - Length: 500-1000 characters

2. THE "VILLAIN" POST
   - Hook: Call out a specific bad habit or "Pain Cluster" (e.g., "Stop ignoring ${asset.painClusters[0] || "this problem"}").
   - Body: Explain the cost of inaction. Use the "Fear of Missing Out" (FOMO) or "Fear of Messing Up" (FOMU).
   - Tone: Direct, slightly provocative.
   - Length: 500-1000 characters

3. THE "STORYTELLING" POST
   - Hook: A short, punchy narrative opener (e.g., "We made a mistake.", "The ${asset.icpTargets[0] || "executive"} asked a hard question.").
   - Body: Use a CUSTOMER_QUOTE or VALUE_PROP snippet to tell a micro-story.
   - Tone: Conversational, authentic.
   - Length: 500-1000 characters

**Requirements:**
- Each post must be 500-1000 characters (depth over brevity)
- Each must have a DIFFERENT hook/angle as specified above
- Include specific numbers/stats from the atomic snippets when available
- Target the ICP audience: ${asset.icpTargets.join(", ")}
- Address the pain points: ${asset.painClusters.join(", ")}
- Match the brand voice: ${brandVoiceText}
- Include 3-5 relevant hashtags per post (without # symbol)
- CTA must reference "Link in comments" or "See link below" - NEVER put URL in body
- Ensure strict adherence to the blacklist. No "Delving", no "Tapestry", no engagement bait.`;

    // Call OpenAI
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(LinkedInPostsSchema, "linkedin_posts"),
      temperature: 0.8, // Higher temperature for more creative variations
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate LinkedIn posts");
    }

    return NextResponse.json({
      success: true,
      posts: result.posts,
    });
  } catch (error) {
    console.error("Error generating LinkedIn post:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to generate LinkedIn post", details: process.env.NODE_ENV === "development" ? errorMessage : undefined },
      { status: 500 }
    );
  }
}
