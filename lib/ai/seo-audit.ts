import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// SEO Audit Output Schema - matches the specification exactly
const SeoAuditSchema = z.object({
  url: z.string(),
  page_title: z.string().nullable(),
  page_type_inferred: z.enum(["blog", "product", "landing", "docs", "other"]),
  primary_intent_guess: z.string(),
  scores: z.object({
    overall: z.number().min(0).max(100),
    extractability: z.number().min(0).max(100),
    structure: z.number().min(0).max(100),
    trust: z.number().min(0).max(100),
    internal_discovery: z.number().min(0).max(100),
  }),
  top_issues: z.array(
    z.object({
      issue: z.string(),
      evidence: z.string(),
      impact: z.enum(["high", "medium", "low"]),
    })
  ),
  recommendations: z.array(
    z.object({
      priority: z.enum(["P0", "P1", "P2"]),
      title: z.string(),
      rationale: z.string(),
      implementation_steps: z.array(z.string()),
      code_example: z.string().nullable(),
      placement_instructions: z.string().nullable(),
      references: z.array(
        z.object({
          type: z.enum(["heading", "quote", "selector", "url"]),
          value: z.string(),
        })
      ),
      expected_effort: z.enum(["small", "medium", "large"]),
      expected_impact: z.enum(["high", "medium", "low"]),
    })
  ),
  proposed_outline: z.array(
    z.object({
      level: z.enum(["H1", "H2", "H3"]),
      text: z.string(),
      notes: z.string().nullable(),
    })
  ),
  suggested_modules: z.array(
    z.object({
      module: z.enum([
        "ExecutiveSummary",
        "TOC",
        "FAQ",
        "Steps",
        "ComparisonTable",
        "ProofBlock",
        "Glossary",
        "CTA",
      ]),
      where: z.enum(["top", "mid", "bottom"]),
      what_to_include: z.array(z.string()),
    })
  ),
  schema_recommendations: z.array(
    z.object({
      schema_type: z.string(),
      action: z.enum(["add", "fix", "remove", "validate"]),
      notes: z.string(),
    })
  ),
  internal_linking_suggestions: z.array(
    z.object({
      anchor_text: z.string(),
      target_page_idea: z.string(),
      placement_hint: z.string(),
    })
  ),
  errors: z.array(
    z.object({
      stage: z.enum(["fetch", "jina", "parse", "analyze"]),
      message: z.string(),
    })
  ),
  brand_consistency: z.object({
    overall_score: z.number().min(0).max(100),
    platform_results: z.array(
      z.object({
        platform: z.enum(["chatgpt", "claude", "perplexity"]),
        brand_description: z.string(),
        accuracy_score: z.number().min(0).max(100),
        key_facts_present: z.array(z.string()),
        key_facts_missing: z.array(z.string()),
        misstatements: z.array(z.string()),
        tone_match: z.enum(["excellent", "good", "fair", "poor"]),
        recommendations: z.array(z.string()),
      })
    ),
    summary: z.object({
      average_accuracy: z.number(),
      common_misstatements: z.array(z.string()),
      critical_gaps: z.array(z.string()),
      top_recommendations: z.array(z.string()),
    }),
  }).nullable(),
  // Added when brand consistency is skipped (e.g., for third-party URLs)
  brand_consistency_skipped: z.object({
    reason: z.enum(["third_party_url", "no_brand_context", "error"]),
    message: z.string(),
  }).optional(),
});

export type SeoAuditResult = z.infer<typeof SeoAuditSchema>;

const SEO_AUDIT_SYSTEM_PROMPT = `You are an expert SEO and AI extraction specialist. Your job is to audit a webpage's structure and content organization for discoverability and extractability by modern search engines and AI answer systems.

**CRITICAL RULES:**
1. Make recommendations SPECIFIC - reference actual headings, quotes, or CSS selectors when possible
2. Provide "why it matters" in one sentence per recommendation
3. Provide "how to implement" in 1-3 bullets per recommendation
4. For technical recommendations (meta tags, schema markup, HTML elements, structured data, etc.), provide a code_example field with ready-to-copy/paste code
5. Code examples should be complete, valid, and directly implementable (e.g., full meta tag HTML, complete JSON-LD schema, etc.)
6. When providing code_example, ALWAYS provide placement_instructions with clear, step-by-step guidance for non-developers:
   - For WordPress: Explain how to access the page/post editor, find the "Code Editor" or "Custom HTML" option, or use theme customization/header/footer plugins
   - For Wix: Explain how to access SEO Tools, Custom Code, or the Page Settings where code can be added
   - Specify EXACT placement (e.g., "in the <head> section before </head>", "right after <body> tag", "before </body> tag")
   - Make instructions simple, numbered steps that non-technical users can follow
7. Output must be implementable tickets, not generic advice
8. Do NOT promise "ranking in AI Overviews" or guaranteed citations
9. Do NOT suggest generating large volumes of new pages

**DIAGNOSTICS TO COMPUTE:**
- Heading integrity: single H1, logical nesting, meaningful headings
- "Answer block" presence: does the page answer the likely primary query within first 150-250 words
- Content modularity: clear sections, lists/tables/Q&A where appropriate
- Evidence signals: citations, author info, dates, measurable proof points
- Internal linking quality: count, anchor relevance, depth, presence of related links
- Schema coverage: which types exist, validity (basic), mismatch risk
- Boilerplate ratio: main content vs repeated template noise (rough heuristic)
- Extraction hazards: broken numbering, duplicated headings, huge unchunked paragraphs, excessive CTA repetition

**SCORING (0-100):**
- extractability_score: How easily can AI systems extract and understand the main content?
- structure_score: How well-organized is the page structure (headings, sections, hierarchy)?
- trust_score: How trustworthy/authoritative does the content appear (citations, dates, author)?
- internal_discovery_score: How well does the page facilitate internal site navigation?

**PRIORITY LEVELS:**
- P0: Critical issues that significantly hurt extractability or structure (e.g., no H1, missing answer block)
- P1: Important improvements that would meaningfully enhance discoverability
- P2: Nice-to-have optimizations

**OUTPUT:**
Return ONLY a JSON object matching the requested schema. Be specific and actionable.

**IMPORTANT:**
- Set brand_consistency to null (this will be populated separately if brand analysis is requested).
- All other fields must be populated with actual audit results.`;

export interface SeoAuditContext {
  page_type?: "blog" | "product" | "landing" | "docs";
  target_keyword?: string;
  target_audience?: string;
  brand_voice?: string;
}

export interface PageAnalysis {
  jinaContent: string;
  html: string;
  domData: {
    title: string | null;
    metaDescription: string | null;
    canonical: string | null;
    robotsMeta: string | null;
    headings: Array<{ level: number; text: string }>;
    internalLinks: Array<{ href: string; anchorText: string }>;
    externalLinks: Array<{ href: string; anchorText: string }>;
    images: Array<{ src: string; alt: string | null }>;
    schemaJsonLd: Array<Record<string, any>>;
  };
}

/**
 * Generate SEO audit recommendations using AI
 */
export async function generateSeoAudit(
  url: string,
  analysis: PageAnalysis,
  context?: SeoAuditContext
): Promise<SeoAuditResult> {
  // Truncate content to control costs (max 100k chars for LLM)
  const maxContentLength = 100000;
  const truncatedJina = analysis.jinaContent.length > maxContentLength
    ? analysis.jinaContent.substring(0, maxContentLength) + "\n\n[Content truncated for analysis...]"
    : analysis.jinaContent;

  // Build context prompt
  let contextPrompt = "";
  if (context) {
    const contextParts: string[] = [];
    if (context.page_type) {
      contextParts.push(`Page Type: ${context.page_type}`);
    }
    if (context.target_keyword) {
      contextParts.push(`Target Keyword: ${context.target_keyword}`);
    }
    if (context.target_audience) {
      contextParts.push(`Target Audience: ${context.target_audience}`);
    }
    if (context.brand_voice) {
      contextParts.push(`Brand Voice: ${context.brand_voice}`);
    }
    if (contextParts.length > 0) {
      contextPrompt = `\n\nCONTEXT:\n${contextParts.join("\n")}`;
    }
  }

  // Build analysis summary for LLM
  const domAnalysis = `
DOM ANALYSIS:
- Title: ${analysis.domData.title || "Missing"}
- Meta Description: ${analysis.domData.metaDescription || "Missing"}
- Canonical: ${analysis.domData.canonical || "Missing"}
- Robots Meta: ${analysis.domData.robotsMeta || "Not set"}
- Headings: ${analysis.domData.headings.length} found (H1: ${analysis.domData.headings.filter(h => h.level === 1).length}, H2: ${analysis.domData.headings.filter(h => h.level === 2).length}, H3: ${analysis.domData.headings.filter(h => h.level === 3).length})
- Internal Links: ${analysis.domData.internalLinks.length}
- External Links: ${analysis.domData.externalLinks.length}
- Images: ${analysis.domData.images.length} (with alt: ${analysis.domData.images.filter(img => img.alt).length})
- Schema JSON-LD: ${analysis.domData.schemaJsonLd.length} blocks found

HEADINGS TREE:
${analysis.domData.headings.map(h => `${"  ".repeat(h.level - 1)}H${h.level}: ${h.text}`).join("\n")}
`;

  const userContent = `Audit this webpage for SEO structure and AI extractability:

URL: ${url}
${contextPrompt}

${domAnalysis}

MAIN CONTENT (from Jina Reader):
${truncatedJina}

Analyze this page and provide specific, actionable recommendations.`;

  try {
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: SEO_AUDIT_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: zodResponseFormat(SeoAuditSchema, "seo_audit"),
      temperature: 0.3, // Slightly higher than asset analysis for more creative recommendations
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate structured SEO audit");
    }

    // Ensure URL is set and brand_consistency defaults to null if not provided
    return {
      ...result,
      url,
      brand_consistency: result.brand_consistency ?? null,
    };
  } catch (error) {
    console.error("Error generating SEO audit:", error);
    throw error;
  }
}
