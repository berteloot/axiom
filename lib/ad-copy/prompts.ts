/**
 * Orchestrator and generation prompts for AdCopy Pro architecture.
 * One orchestrator delegates to subagents; channel-specific behavior via dynamic prompts.
 */

import type { PlatformConfig, PlatformKey } from "./platforms";

export type CampaignBrief = {
  brandName: string;
  productDescription: string;
  targetAudience: string;
  keywords: string[];
  toneOfVoice?: string;
  callToAction?: string;
  additionalContext?: string;
  brandVoiceText: string;
};

/** Orchestrator system prompt – delegates to ad-copy-writer and copy-validator */
export const ORCHESTRATOR_SYSTEM_PROMPT = `You are AdCopy Pro, a senior performance marketer. Your job is to analyze the campaign brief, delegate copy generation and validation to specialized subagents, and return the final validated copy as structured JSON.

WORKFLOW:
1. Use the ad-copy-writer agent (via Task) to generate the copy for the specified platform and fields.
2. Use the copy-validator agent (via Task) to validate character limits, brand tone, and quality.
3. If validation fails, ask the writer to regenerate and re-validate.
4. Return the final validated copy as a JSON code block only. No markdown, no explanation outside the block.`;

/** Ad-copy-writer subagent prompt */
export const AD_COPY_WRITER_PROMPT = `You are an expert direct-response copywriter for performance ads. Generate benefit-first, conversion-focused copy that respects strict character limits and platform rules. Use the validate_character_limits tool to check your output before returning. Match the brand voice and include keywords naturally.`;

/** Copy-validator subagent prompt */
export const COPY_VALIDATOR_PROMPT = `You are a QA specialist for ad copy. Check: (1) character limits for every field, (2) brand voice alignment, (3) no compliance red flags, (4) diversity and uniqueness across variations. Use validate_character_limits. Report issues and suggest fixes.`;

/** Build the user-facing generation prompt for a given platform and brief */
export function getGenerationPrompt(
  platformKey: PlatformKey,
  platform: PlatformConfig,
  brief: CampaignBrief
): string {
  const fieldRequirements = Object.entries(platform.fields)
    .map(([key, spec]) => `- ${spec.label}: ${spec.default_count} variations, max ${spec.max_chars} chars each`)
    .join("\n");

  const outputFields = Object.keys(platform.fields);
  const outputSchema = outputFields
    .map((f) => `  "${f}": ["string", ...]`)
    .join(",\n");

  const parts = [
    `Generate ad copy for: ${platform.name}`,
    "",
    "**BRIEF:**",
    `- Brand / company: ${brief.brandName}`,
    `- Product / service: ${brief.productDescription}`,
    `- Target audience: ${brief.targetAudience}`,
    `- Keywords: ${brief.keywords.join(", ")}`,
    `- Brand voice: ${brief.brandVoiceText}`,
  ];
  if (brief.toneOfVoice) parts.push(`- Tone of voice: ${brief.toneOfVoice}`);
  if (brief.callToAction) parts.push(`- Call to action: ${brief.callToAction}`);
  if (brief.additionalContext) parts.push(`- Additional context: ${brief.additionalContext}`);

  parts.push(
    "",
    "**REQUIREMENTS:**",
    fieldRequirements,
    "",
    "**CRITICAL RULES:**",
    "- Every item must be within its character limit (count spaces).",
    "- All variations must be unique; vary angles, value props, and CTAs.",
    "- Include primary keywords in at least 2–3 headlines/primary items.",
    "- No generic-only CTAs. Be specific to the product/offer.",
    "- Match brand voice and tone.",
    "",
    "**OUTPUT FORMAT (JSON only):**",
    "```json",
    "{",
    outputSchema,
    "}",
    "```"
  );

  return parts.join("\n");
}

/** Append workflow and platform limits for the orchestrator */
export function appendWorkflowAndLimits(
  prompt: string,
  platformKey: PlatformKey,
  limits: Record<string, number>
): string {
  return `${prompt}

WORKFLOW:
1. Use the ad-copy-writer agent to generate the copy.
2. Use the copy-validator agent to validate character limits and quality.
3. If validation fails, regenerate and re-validate.
4. Return the final validated JSON in a code block.

Platform character limits:
${JSON.stringify(limits, null, 2)}`;
}
