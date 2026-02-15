/**
 * Ad copy generation using Claude Messages API + Agent Skills + Code Execution.
 * Uses beta.messages.create with container.skills and code_execution tool for
 * specialized ad copy generation (5-10x faster than two-agent handoff).
 *
 * Requires: AD_COPY_SKILL_ID (custom skill uploaded via /v1/skills)
 * Beta headers: code-execution-2025-08-25, skills-2025-10-02
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  getPlatform,
  type PlatformKey,
  type PlatformConfig,
} from "./platforms";
import {
  getGenerationPrompt,
  type CampaignBrief,
} from "./prompts";

const BETA_BRANDS = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
] as const;

export type SkillsEnhancedResult = {
  copy: Record<string, string[]>;
  agentProof: {
    backend: "skills-enhanced";
    steps: Array<{
      agent: string;
      model: string;
      inputTokens?: number;
      outputTokens?: number;
      timestamp: string;
    }>;
  };
};

function truncateField(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 3) + "...";
}

function parseAndTruncateCopy(
  raw: string,
  platform: PlatformConfig
): Record<string, string[]> {
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

/**
 * Generate ad copy using beta Messages API with Agent Skills + Code Execution.
 * Single-call generation for 5-10x faster output.
 */
export async function runSkillsEnhancedAdCopy(
  platformKey: PlatformKey,
  brief: CampaignBrief,
  apiKey: string,
  skillId: string
): Promise<SkillsEnhancedResult> {
  const platform = getPlatform(platformKey);
  const prompt = getGenerationPrompt(platformKey, platform, brief);

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.beta.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    betas: [...BETA_BRANDS],
    container: {
      skills: [
        {
          type: "custom" as const,
          skill_id: skillId,
          version: "latest",
        },
      ],
    },
    tools: [
      {
        type: "code_execution_20250825" as const,
        name: "code_execution",
      },
    ],
    system: `You are the ad-copy-writer agent. Generate benefit-first, conversion-focused ad copy. Follow the Skill's platform rules and character limits strictly. Return ONLY valid JSON in a code block, nothing else.`,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in skills-enhanced response");
  }

  let copy: Record<string, string[]>;
  try {
    copy = parseAndTruncateCopy(textBlock.text.trim(), platform);
  } catch {
    throw new Error("Failed to parse ad copy JSON from response");
  }

  return {
    copy,
    agentProof: {
      backend: "skills-enhanced",
      steps: [
        {
          agent: "ad-copy-writer (Skills + Code Exec)",
          model: response.model,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}
