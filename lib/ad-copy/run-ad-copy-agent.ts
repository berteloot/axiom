/**
 * Run the Claude Agent SDK for ad copy generation.
 * AdCopy Pro architecture: orchestrator + subagents (ad-copy-writer, copy-validator) + MCP tools.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import {
  getPlatform,
  getPlatformLimits,
  type PlatformKey,
  type PlatformConfig,
} from "./platforms";
import {
  getGenerationPrompt,
  appendWorkflowAndLimits,
  ORCHESTRATOR_SYSTEM_PROMPT,
  AD_COPY_WRITER_PROMPT,
  COPY_VALIDATOR_PROMPT,
  type CampaignBrief,
} from "./prompts";
import { createAdToolsMcpServer } from "./mcp-tools";

const AGENT_TIMEOUT_MS = 180_000; // 3 minutes for full orchestration

export type AdCopyAgentInput = CampaignBrief;

export type AdCopyAgentResult = Record<string, string[]>;

/** Truncate a string to maxLen, adding ... if needed */
function truncateField(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 3) + "...";
}

/** Parse and truncate copy from agent result; shape varies by platform */
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

export async function runAdCopyAgent(
  platformKey: PlatformKey,
  input: AdCopyAgentInput,
  apiKey: string,
  projectRoot: string
): Promise<AdCopyAgentResult> {
  const platform = getPlatform(platformKey);
  const limits = getPlatformLimits(platformKey);

  const basePrompt = getGenerationPrompt(platformKey, platform, input);
  const fullPrompt = appendWorkflowAndLimits(basePrompt, platformKey, limits);

  const adToolsServer = createAdToolsMcpServer();

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AGENT_TIMEOUT_MS);

  const q = query({
    prompt: fullPrompt,
    options: {
      cwd: projectRoot,
      settingSources: ["project"],
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      tools: ["Read", "Glob", "Task"],
      mcpServers: {
        "ad-tools": adToolsServer,
      },
      allowedTools: [
        "Task",
        "Read",
        "Glob",
        "mcp__ad-tools__validate_character_limits",
        "mcp__ad-tools__export_google_ads_csv",
        "mcp__ad-tools__export_meta_ads_csv",
      ],
      agents: {
        "ad-copy-writer": {
          description:
            "Use for all copy generation tasks including headlines, descriptions, primary text, and tweet copy across all ad platforms.",
          prompt: AD_COPY_WRITER_PROMPT,
          tools: ["mcp__ad-tools__validate_character_limits"],
        },
        "copy-validator": {
          description:
            "Use to validate character limits, brand tone, compliance, and quality of generated ad copy.",
          prompt: COPY_VALIDATOR_PROMPT,
          tools: ["mcp__ad-tools__validate_character_limits"],
        },
      },
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: apiKey,
      },
      abortController,
    },
  });

  try {
    for await (const message of q) {
      if (message.type === "result") {
        if (
          "subtype" in message &&
          message.subtype === "success" &&
          "result" in message
        ) {
          const raw = (message as { result: string }).result.trim();
          return parseAndTruncateCopy(raw, platform);
        }
        const errMsg =
          (message as { errors?: string[] }).errors?.join("; ") ?? "Agent error";
        throw new Error(errMsg);
      }
    }
    throw new Error("Agent finished without a result");
  } finally {
    clearTimeout(timeoutId);
    q.close();
  }
}

export function getProjectRoot(): string {
  return path.resolve(process.cwd());
}
