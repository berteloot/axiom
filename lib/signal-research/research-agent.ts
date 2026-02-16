/**
 * Research agent: uses Claude Messages API with web_search to gather signals from
 * websites, forums (Reddit), job postings, press, and partner sites.
 * When SIGNAL_RESEARCH_SKILL_ID is set: beta API with Skills + web_search.
 * Otherwise: plain Messages API with web_search.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  CompanyResearch,
  ResearchSignal,
  SignalStrength,
  ActionPlanItem,
  PriorityTier,
} from "./types";

const BETA_BRANDS = ["skills-2025-10-02"] as const;

export interface ResearchAgentInput {
  company: string;
  companyDomain?: string;
  industry?: string;
  researchPrompt: string;
  keyContacts?: string;
  targetRole?: string;
}

function scoreToPriority(score: number): PriorityTier {
  if (score >= 8) return "P1-HOT";
  if (score >= 6) return "P2-WARM";
  if (score >= 4) return "P3-NURTURE";
  return "P4-LOW";
}

function buildPrompts(input: ResearchAgentInput) {
  const { company, companyDomain, industry, researchPrompt, keyContacts, targetRole } = input;
  const contactContext = [
    keyContacts ? `Known contacts at this company: ${keyContacts}. Use them in keyDecisionMakers and tailor the sales opportunity.` : "",
    targetRole ? `Target persona/role to pursue: ${targetRole}.` : "",
  ].filter(Boolean).join(" ");
  const systemPrompt = `Research "${company}"${companyDomain ? ` (${companyDomain})` : ""} for buying signals. Focus: ${researchPrompt}.${industry ? ` Industry: ${industry}.` : ""}${contactContext ? ` ${contactContext}` : ""}

Signal categories: website, job_postings, press_news, forums_communities, partner_vendor. Use web search (site:reddit.com, job boards, press). Rate each STRONG/MODERATE/WEAK/NONE. Return JSON in code block:
{"company":"${company}","industry":"","revenue":"","employees":"","currentSystem":"","overallScore":7,"salesOpportunity":"","keyEvidence":"","keyDecisionMakers":[],"signals":[{"category":"website","strength":"STRONG","keyEvidence":"","sourceUrls":[],"actionableInsight":"","recommendedNextStep":""}]}
Include all 5 signal categories. Cite URLs.`;

  const userPrompt = `Research "${company}" for: ${researchPrompt}. Use web search (site:reddit.com, job boards, press). Return JSON only.`;

  return { systemPrompt, userPrompt };
}

function parseResponse(
  textOutput: string,
  input: ResearchAgentInput
): CompanyResearch {
  const { company, industry } = input;
  const jsonMatch =
    textOutput.match(/```json?\s*([\s\S]*?)```/) ||
    textOutput.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : textOutput;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return {
      company,
      industry,
      overallScore: 0,
      salesOpportunity: "Response truncated – model output was cut off before completing JSON",
      keyEvidence: "Failed to parse research JSON (truncated_response)",
      signals: [],
    };
  }

  const signals = (parsed.signals as Record<string, unknown>[] ?? []).map((s) => ({
    category: String(s.category ?? ""),
    strength: (s.strength ?? "NONE") as SignalStrength,
    keyEvidence: String(s.keyEvidence ?? ""),
    sourceUrls: Array.isArray(s.sourceUrls) ? s.sourceUrls.map(String) : [],
    actionableInsight: s.actionableInsight ? String(s.actionableInsight) : undefined,
    recommendedNextStep: s.recommendedNextStep ? String(s.recommendedNextStep) : undefined,
  })) as ResearchSignal[];

  const keyDecisionMakers = Array.isArray(parsed.keyDecisionMakers)
    ? (parsed.keyDecisionMakers as Array<{ name?: string; title?: string }>).map((m) => ({
        name: String(m.name ?? ""),
        title: String(m.title ?? ""),
      }))
    : undefined;

  return {
    company: String(parsed.company ?? company),
    industry: parsed.industry ? String(parsed.industry) : industry,
    revenue: parsed.revenue ? String(parsed.revenue) : undefined,
    employees: parsed.employees ? String(parsed.employees) : undefined,
    currentSystem: parsed.currentSystem ? String(parsed.currentSystem) : undefined,
    overallScore: Number(parsed.overallScore) || 5,
    salesOpportunity: parsed.salesOpportunity ? String(parsed.salesOpportunity) : undefined,
    keyEvidence: parsed.keyEvidence ? String(parsed.keyEvidence) : undefined,
    keyDecisionMakers: keyDecisionMakers?.length ? keyDecisionMakers : undefined,
    signals,
  };
}

function extractTextFromResponse(content: Array<{ type: string; text?: string }>): string {
  let text = "";
  for (const block of content) {
    if (block.type === "text" && block.text) {
      text += block.text;
    }
  }
  return text;
}

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 3,
};

/**
 * Fallback: plain Messages API with web_search when Skills are not configured.
 */
async function runResearchViaMessagesApi(
  input: ResearchAgentInput,
  apiKey: string
): Promise<CompanyResearch> {
  const anthropic = new Anthropic({ apiKey });
  const { systemPrompt, userPrompt } = buildPrompts(input);

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_SIGNAL_RESEARCH_MODEL || "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tools: [WEB_SEARCH_TOOL],
    tool_choice: { type: "auto" as const },
  });

  const textOutput = extractTextFromResponse(response.content);
  return parseResponse(textOutput, input);
}

/**
 * Skills-enhanced: beta Messages API with container.skills + web_search.
 */
async function runSkillsEnhancedResearch(
  input: ResearchAgentInput,
  apiKey: string,
  skillId: string
): Promise<CompanyResearch> {
  const anthropic = new Anthropic({ apiKey });
  const { systemPrompt, userPrompt } = buildPrompts(input);

  const response = await anthropic.beta.messages.create({
    model: process.env.CLAUDE_SIGNAL_RESEARCH_MODEL || "claude-haiku-4-5-20251001",
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
    tools: [WEB_SEARCH_TOOL],
    tool_choice: { type: "auto" as const },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textOutput = extractTextFromResponse(response.content);
  return parseResponse(textOutput, input);
}

export async function runResearchForCompany(
  input: ResearchAgentInput
): Promise<CompanyResearch> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Signal research requires ANTHROPIC_API_KEY");
  }

  const skillId = process.env.SIGNAL_RESEARCH_SKILL_ID;
  if (skillId) {
    return runSkillsEnhancedResearch(input, apiKey, skillId);
  }
  return runResearchViaMessagesApi(input, apiKey);
}

export function buildActionPlan(companies: CompanyResearch[]): ActionPlanItem[] {
  const sorted = [...companies].sort((a, b) => b.overallScore - a.overallScore);
  return sorted.map((c) => ({
    priority: scoreToPriority(c.overallScore),
    company: c.company,
    action: c.salesOpportunity
      ? `Pursue: ${c.salesOpportunity}`
      : `Research signals suggest score ${c.overallScore}/10. Review signal detail.`,
    keyContact: c.keyDecisionMakers?.[0]
      ? `${c.keyDecisionMakers[0].name} (${c.keyDecisionMakers[0].title})`
      : undefined,
    timing: "ASAP",
    rationale: c.keyEvidence || `Overall score ${c.overallScore}/10 based on signal analysis.`,
  }));
}
