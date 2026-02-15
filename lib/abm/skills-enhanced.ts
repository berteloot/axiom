/**
 * ABM generation using Claude Messages API + Agent Skills + Code Execution.
 * Uses beta.messages.create with container.skills for optimal marketing/sales behavior.
 *
 * Requires: ABM_SKILL_ID (custom skill uploaded via /v1/skills)
 * Beta headers: code-execution-2025-08-25, skills-2025-10-02
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ABMBrief } from "./prompts";
import { getABMPrompt } from "./prompts";

const BETA_BRANDS = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
] as const;

export type ABMResult = {
  accountBrief: {
    companyOverview: string;
    painPoints: string[];
    buyingSignals: string[];
    keyPersonas: string[];
  };
  emailOutreach: {
    subject: string;
    body: string;
  };
  linkedInOutreach: {
    connectionRequest: string;
    followUpMessage: string;
  };
};

export type SkillsEnhancedABMResult = {
  result: ABMResult;
  agentProof: {
    backend: "skills-enhanced" | "messages";
    steps: Array<{
      agent: string;
      model: string;
      inputTokens?: number;
      outputTokens?: number;
      timestamp: string;
    }>;
  };
};

function parseABMResponse(raw: string): ABMResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const accountBrief = parsed.accountBrief as Record<string, unknown> | undefined;
  const emailOutreach = parsed.emailOutreach as Record<string, unknown> | undefined;
  const linkedInOutreach = parsed.linkedInOutreach as Record<string, unknown> | undefined;

  if (!accountBrief || !emailOutreach || !linkedInOutreach) {
    throw new Error("Invalid ABM response structure: missing accountBrief, emailOutreach, or linkedInOutreach");
  }

  return {
    accountBrief: {
      companyOverview: String(accountBrief.companyOverview ?? ""),
      painPoints: Array.isArray(accountBrief.painPoints) ? accountBrief.painPoints.map(String) : [],
      buyingSignals: Array.isArray(accountBrief.buyingSignals) ? accountBrief.buyingSignals.map(String) : [],
      keyPersonas: Array.isArray(accountBrief.keyPersonas) ? accountBrief.keyPersonas.map(String) : [],
    },
    emailOutreach: {
      subject: String(emailOutreach.subject ?? ""),
      body: String(emailOutreach.body ?? ""),
    },
    linkedInOutreach: {
      connectionRequest: String(linkedInOutreach.connectionRequest ?? ""),
      followUpMessage: String(linkedInOutreach.followUpMessage ?? ""),
    },
  };
}

/**
 * Fallback: plain Messages API when Skills are not available.
 */
export async function runABMViaMessagesApi(
  brief: ABMBrief,
  apiKey: string
): Promise<SkillsEnhancedABMResult> {
  const prompt = getABMPrompt(brief);
  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `You are an ABM (Account-Based Marketing) and B2B sales expert. Generate research-backed account briefs and personalized outreach. Follow best practices: value-first, concise, personalized. Return ONLY valid JSON in a code block with accountBrief, emailOutreach, linkedInOutreach.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in ABM response");
  }

  const result = parseABMResponse(textBlock.text.trim());

  return {
    result,
    agentProof: {
      backend: "messages",
      steps: [
        {
          agent: "ABM Pro (Messages API)",
          model: response.model,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}

export async function runSkillsEnhancedABM(
  brief: ABMBrief,
  apiKey: string,
  skillId: string
): Promise<SkillsEnhancedABMResult> {
  const prompt = getABMPrompt(brief);
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.beta.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
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
    system: `You are an ABM (Account-Based Marketing) and B2B sales expert. Generate research-backed account briefs and personalized outreach. Follow the Skill's guidelines strictly. Return ONLY valid JSON in a code block, no other text.`,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in skills-enhanced ABM response");
  }

  const result = parseABMResponse(textBlock.text.trim());

  return {
    result,
    agentProof: {
      backend: "skills-enhanced",
      steps: [
        {
          agent: "ABM Pro (Skills + Code Exec)",
          model: response.model,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}
