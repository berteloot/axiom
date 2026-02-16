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
  getWriterPromptForPlatform,
  COPY_VALIDATOR_PROMPT,
  type CampaignBrief,
} from "./prompts";
import { createAdToolsMcpServer } from "./mcp-tools";
import { parseAndTruncateCopy } from "./shared-utils";

const AGENT_TIMEOUT_MS = 180_000; // 3 minutes for full orchestration

export type AdCopyAgentInput = CampaignBrief;

export type AdCopyAgentResult = Record<string, string[]>;

function isSuccessResultMessage(
  msg: unknown
): msg is { type: "result"; subtype: "success"; result: string } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as { type: string }).type === "result" &&
    "subtype" in msg &&
    (msg as { subtype: string }).subtype === "success" &&
    "result" in msg &&
    typeof (msg as { result: unknown }).result === "string"
  );
}

function isErrorResultMessage(
  msg: unknown
): msg is { type: "result"; errors?: string[] } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as { type: string }).type === "result"
  );
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
        "mcp__ad-tools__export_linkedin_ads_csv",
        "mcp__ad-tools__export_x_ads_csv",
      ],
      agents: {
        "ad-copy-writer": {
          description:
            "Use for all copy generation tasks including headlines, descriptions, primary text, and tweet copy across all ad platforms.",
          prompt: getWriterPromptForPlatform(platformKey),
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
        if (isSuccessResultMessage(message)) {
          const raw = message.result.trim();
          return parseAndTruncateCopy(raw, platform);
        }
        if (isErrorResultMessage(message)) {
          const errMsg = message.errors?.join("; ") ?? "Agent error";
          throw new Error(errMsg);
        }
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
