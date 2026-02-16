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
}

function scoreToPriority(score: number): PriorityTier {
  if (score >= 8) return "P1-HOT";
  if (score >= 6) return "P2-WARM";
  if (score >= 4) return "P3-NURTURE";
  return "P4-LOW";
}

function buildPrompts(input: ResearchAgentInput) {
  const { company, companyDomain, industry, researchPrompt } = input;
  const systemPrompt = `You are a sales intelligence research agent. Your job is to research companies and identify buying signals relevant to a specific sales opportunity.

RESEARCH FOCUS (user-defined): ${researchPrompt}
${industry ? `INDUSTRY CONTEXT: ${industry}` : ""}

For the company "${company}"${companyDomain ? ` (website: ${companyDomain})` : ""}, research the following signal categories using web search:

1. **Website**: Visit the company's corporate site. Look for mentions of the research focus on About, News, Careers, or product pages.
2. **Job postings**: Search for "[company] jobs" and "[company] careers" related to the research focus. Check Indeed, LinkedIn Jobs, Glassdoor for relevant roles.
3. **Press/news**: Search for "[company]" + keywords from the research focus. Check PR Newswire, company newsrooms, trade publications.
4. **Forums/communities**: Search site:reddit.com "[company]" and the research focus. Check Glassdoor reviews, Spiceworks, tech communities for employee mentions.
5. **Partner/vendor**: Search for case studies, success stories, or partner pages mentioning the company and the research focus.

For each category, rate as STRONG, MODERATE, WEAK, or NONE. Provide key evidence and source URLs.

Return a JSON object in a code block with this exact structure:
\`\`\`json
{
  "company": "${company}",
  "industry": "${industry || ""}",
  "revenue": "",
  "employees": "",
  "currentSystem": "",
  "overallScore": 7,
  "salesOpportunity": "Brief summary",
  "keyEvidence": "Top 1-2 evidence points",
  "keyDecisionMakers": [{"name": "Name", "title": "Title"}],
  "signals": [
    {
      "category": "website",
      "strength": "STRONG",
      "keyEvidence": "What you found",
      "sourceUrls": ["url1", "url2"],
      "actionableInsight": "What it means",
      "recommendedNextStep": "Suggested action"
    }
  ]
}
\`\`\`

Include all 5 signal categories. Use web search to gather real evidence. Be specific and cite URLs.`;

  const userPrompt = `Research "${company}" for buying signals related to: ${researchPrompt}.

Use web search to check:
- Company website (${companyDomain || "find it"}) for relevant mentions
- Job boards: "[company] jobs" + research keywords
- Press: "[company]" + research keywords
- Forums: site:reddit.com "[company]" + research keywords
- Partner/vendor case studies mentioning the company

Return ONLY valid JSON in a code block.`;

  return { systemPrompt, userPrompt };
}

function parseResponse(
  textOutput: string,
  input: ResearchAgentInput
): CompanyResearch {
  const { company, industry } = input;
  const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : textOutput;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse research JSON from Claude response");
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
  max_uses: 5,
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
    model: process.env.CLAUDE_SIGNAL_RESEARCH_MODEL || "claude-sonnet-4-20250514",
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
    model: process.env.CLAUDE_SIGNAL_RESEARCH_MODEL || "claude-sonnet-4-20250514",
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
