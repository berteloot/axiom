import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runAdCopyAgent, getProjectRoot } from "@/lib/ad-copy/run-ad-copy-agent";
import { runSkillsEnhancedAdCopy } from "@/lib/ad-copy/skills-enhanced";
import {
  getPlatform,
  type PlatformKey,
} from "@/lib/ad-copy/platforms";
import {
  getGenerationPrompt,
  type CampaignBrief,
} from "@/lib/ad-copy/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_KEYS = ["google_ads_rsa", "meta_ads", "linkedin_ads", "x_ads"] as const;

const RequestSchema = z.object({
  platform: z.enum(PLATFORM_KEYS),
  brandName: z.string().min(1, "Brand / company name is required"),
  productDescription: z.string().min(1, "Product / service description is required"),
  targetAudience: z.string().min(1, "Target audience is required"),
  keywords: z.array(z.string()).min(1, "At least one keyword is required"),
  toneOfVoice: z.string().optional(),
  callToAction: z.string().optional(),
  additionalContext: z.string().optional(),
  campaignName: z.string().optional(),
});

function truncateField(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 3) + "...";
}

function parseAndTruncateCopy(
  raw: string,
  platformKey: PlatformKey
): Record<string, string[]> {
  const platform = getPlatform(platformKey);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const result: Record<string, string[]> = {};
  for (const [fieldKey, spec] of Object.entries(platform.fields)) {
    const rawVal = parsed[fieldKey];
    if (!rawVal) continue;
    const arr = Array.isArray(rawVal) ? rawVal : [rawVal];
    const strings = arr
      .filter((v): v is string => typeof v === "string")
      .map((s) => truncateField(s, spec.max_chars));
    result[fieldKey] = strings;
  }
  return result;
}

export type AgentProofStep = {
  agent: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  timestamp: string;
};

export type AgentProof = {
  backend: "skills-enhanced" | "agent" | "messages";
  steps: AgentProofStep[];
};

/**
 * Single-call Messages API (5-10x faster than writer→validator handoff).
 * Strict output format + client-side truncation for reliability.
 */
async function runMarketingAgentsViaMessagesApi(
  platformKey: PlatformKey,
  brief: CampaignBrief,
  apiKey: string
): Promise<{ copy: Record<string, string[]>; agentProof: AgentProof }> {
  const platform = getPlatform(platformKey);
  const prompt = getGenerationPrompt(platformKey, platform, brief);
  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `You are the ad-copy-writer agent, an expert direct-response copywriter for performance ads. Generate benefit-first, conversion-focused copy. CRITICAL: Follow ALL character limits strictly (count spaces). Return ONLY valid JSON in a code block, no other text. Every item must be within its character limit.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in ad-copy-writer response");
  }

  const raw = textBlock.text.trim();
  let copy: Record<string, string[]>;
  try {
    copy = parseAndTruncateCopy(raw, platformKey);
  } catch {
    throw new Error("Failed to parse ad copy JSON from response");
  }

  return {
    copy,
    agentProof: {
      backend: "messages",
      steps: [
        {
          agent: "ad-copy-writer (single-call)",
          model: response.model,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const {
      platform,
      brandName,
      productDescription,
      targetAudience,
      keywords,
      toneOfVoice,
      callToAction,
      additionalContext,
    } = parsed.data;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Ad copy generation is not configured (missing ANTHROPIC_API_KEY)" },
        { status: 503 }
      );
    }

    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
    });
    const brandVoice = brandContext?.brandVoice ?? [];
    const brandVoiceText =
      brandVoice.length > 0
        ? `Brand voice and tone: ${brandVoice.join(", ")}.`
        : "Use a professional, clear, and customer-centric tone.";

    const brief: CampaignBrief = {
      brandName,
      productDescription,
      targetAudience,
      keywords,
      toneOfVoice: toneOfVoice ?? undefined,
      callToAction: callToAction ?? undefined,
      additionalContext: additionalContext ?? undefined,
      brandVoiceText,
    };

    let copy: Record<string, string[]>;
    let agentProof: AgentProof;

    const skillId = process.env.AD_COPY_SKILL_ID;
    const useAgent = process.env.AD_COPY_USE_AGENT === "true";

    if (skillId) {
      try {
        const result = await runSkillsEnhancedAdCopy(platform, brief, apiKey, skillId);
        copy = result.copy;
        agentProof = result.agentProof;
      } catch (skillsErr) {
        const msg = skillsErr instanceof Error ? skillsErr.message : String(skillsErr);
        console.warn("[Ad Copy] Skills-enhanced unavailable, falling back:", msg);
        const fallback = await runMarketingAgentsViaMessagesApi(platform, brief, apiKey);
        copy = fallback.copy;
        agentProof = fallback.agentProof;
      }
    } else if (useAgent) {
      try {
        copy = await runAdCopyAgent(
          platform,
          brief,
          apiKey,
          getProjectRoot()
        );
        agentProof = {
          backend: "agent",
          steps: [
            {
              agent: "orchestrator",
              model: "claude-agent-sdk",
              timestamp: new Date().toISOString(),
            },
            {
              agent: "ad-copy-writer",
              model: "claude-agent-sdk",
              timestamp: new Date().toISOString(),
            },
            {
              agent: "copy-validator",
              model: "claude-agent-sdk",
              timestamp: new Date().toISOString(),
            },
          ],
        };
      } catch (agentErr) {
        const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);
        const isUnsupported =
          /spawn|ENOENT|timeout|abort|AbortError/i.test(msg) ||
          msg.includes("No such file");
        if (isUnsupported) {
          console.warn("[Ad Copy] Agent SDK unavailable, using Messages API fallback:", msg);
          const fallback = await runMarketingAgentsViaMessagesApi(platform, brief, apiKey);
          copy = fallback.copy;
          agentProof = fallback.agentProof;
        } else {
          throw agentErr;
        }
      }
    } else {
      const result = await runMarketingAgentsViaMessagesApi(platform, brief, apiKey);
      copy = result.copy;
      agentProof = result.agentProof;
    }

    return NextResponse.json({
      success: true,
      platform,
      copy,
      agentProof,
    });
  } catch (error) {
    console.error("Ad copy generate error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No account selected")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: "Failed to generate ad copy",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
