import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Score with confidence level
const ScoreWithConfidence = z.object({
  score: z.number().min(0).max(100),
  confidence: z.enum(["high", "medium", "low"]),
});

// Answer Block Analysis - evaluates if the page provides a concise answer early
const AnswerBlockAnalysis = z.object({
  has_answer_block: z.boolean(),
  answer_block_word_count: z.number(), // Words in the first answer block (target: 150-250)
  primary_query_addressed: z.boolean(), // Does the intro directly address the primary query?
  answer_quality: z.enum(["excellent", "good", "needs_improvement", "missing"]),
  current_intro_summary: z.string(), // Brief summary of what the current intro covers
  suggested_answer_block: z.string().nullable(), // AI-generated concise answer if missing/weak
  placement_recommendation: z.string(), // Where to place the answer block
  rationale: z.string(), // Why this matters for AI extractability
});

// SEO Audit Output Schema - enhanced with evidence grounding
const SeoAuditSchema = z.object({
  url: z.string(),
  page_title: z.string().nullable(),
  page_type_inferred: z.enum(["blog", "product", "landing", "docs", "other"]),
  primary_intent: z.object({
    guess: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
    reasoning: z.string(), // Why this intent was inferred
  }),
  // Data quality transparency - tells consumers how much to trust the audit
  data_quality: z.object({
    html_available: z.boolean(),
    jina_content_length: z.number(),
    dom_parse_success: z.boolean(),
    content_truncated: z.boolean(),
    limitations: z.array(z.string()), // e.g., ["HTML fetch failed", "Content truncated at 100k chars"]
  }),
  scores: z.object({
    overall: z.number().min(0).max(100),
    extractability: ScoreWithConfidence,
    structure: ScoreWithConfidence,
    trust: ScoreWithConfidence,
    internal_discovery: ScoreWithConfidence,
    answer_block: ScoreWithConfidence, // New: How well the page provides immediate value
  }),
  // Answer Block Analysis - critical for AI extractability
  answer_block_analysis: AnswerBlockAnalysis,
  top_issues: z.array(
    z.object({
      issue: z.string(),
      evidence: z.string(), // MUST quote verbatim from input or state "Cannot verify"
      impact: z.enum(["high", "medium", "low"]),
      observation_type: z.enum(["observed", "inferred", "cannot_determine"]),
    })
  ),
  recommendations: z.array(
    z.object({
      observation_type: z.enum(["observed", "inferred", "cannot_determine"]),
      priority: z.enum(["P0", "P1", "P2"]),
      title: z.string(),
      rationale: z.string(),
      implementation_steps: z.array(z.string()),
      code_example: z.string().nullable(),
      placement_instructions: z.string().nullable(),
      references: z.array(
        z.object({
          type: z.enum(["heading", "quote", "selector", "url", "count"]),
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
      rationale: z.string(), // Why this heading is needed based on current structure
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
      rationale: z.string(), // Why this module is recommended based on observed gaps
    })
  ),
  schema_recommendations: z.array(
    z.object({
      schema_type: z.string(),
      action: z.enum(["add", "fix", "remove", "validate"]),
      notes: z.string(),
      observation_type: z.enum(["observed", "inferred", "cannot_determine"]),
      // Enhanced fields for actionable structured data recommendations
      code_example: z.string().nullable(), // JSON-LD schema markup (required for add/fix/validate, nullable for remove)
      implementation_steps: z.array(z.string()).min(1), // Always required, at least 1 step
      placement_instructions: z.string().nullable(), // Where to place the schema
      rationale: z.string(), // Why this schema helps with rich results and LLM processing
      rich_results_benefit: z.string().nullable(), // Specific rich result type (only if currently eligible)
      llm_benefit: z.string().nullable(), // How this helps LLMs understand content structure
      required_properties: z.array(z.string()), // Required properties for eligibility
      recommended_properties: z.array(z.string()), // Recommended properties for completeness
      testing_steps: z.array(z.string()), // Steps to test (Rich Results Test, Search Console)
      eligibility_note: z.string().nullable(), // Explicit "not guaranteed" + feature availability constraints
    })
    .refine(
      (data) => {
        // For add/fix/validate actions, code_example must be non-empty
        if (["add", "fix", "validate"].includes(data.action)) {
          return data.code_example !== null && data.code_example.trim().length > 0;
        }
        // For remove action, code_example can be null
        return true;
      },
      {
        message: "code_example is required for add, fix, and validate actions",
        path: ["code_example"],
      }
    )
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
  ).default([]),
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
  }).nullable(),
});

// Extended schema with search queries (added by service after AI response)
const SeoAuditResultSchema = SeoAuditSchema.extend({
  search_queries: z.array(
    z.object({
      query: z.string(),
      searchVolume: z.number(),
      cpc: z.number(),
      competition: z.string(),
      isQuestion: z.boolean(),
    })
  ).nullable(),
});

export type SeoAuditResult = z.infer<typeof SeoAuditResultSchema>;

const SEO_AUDIT_SYSTEM_PROMPT = `You are an expert SEO and AI extraction specialist. Your job is to audit a webpage's structure and content organization for discoverability and extractability by modern search engines and AI answer systems.

**EVIDENCE-GROUNDING RULES (CRITICAL - FOLLOW EXACTLY):**
1. Every issue in top_issues MUST have an evidence field that quotes VERBATIM text from the input (DOM ANALYSIS or MAIN CONTENT).
2. If evidence is not directly visible in the input, set evidence to: "Cannot verify from provided data - requires manual inspection."
3. For recommendations and issues, set observation_type correctly:
   - "observed" → You MUST cite a specific heading, quote, link count, or selector that EXISTS in the input
   - "inferred" → State the inference chain (e.g., "Page discusses pricing but has no FAQ schema for common questions")
   - "cannot_determine" → Data is missing or insufficient (e.g., HTML fetch failed)
4. NEVER fabricate heading text, link counts, schema types, or any data not explicitly listed in DOM ANALYSIS.
5. When referencing counts (links, images, headings), use the EXACT numbers from DOM ANALYSIS.
6. For references array, only include items that exist in the provided content - use type "count" for numeric data from DOM ANALYSIS.

**CONFIDENCE CALIBRATION:**
- If html_available=false (indicated in input), set confidence="low" on structure/schema recommendations.
- If content was truncated, note this in data_quality.limitations and consider confidence impact.
- Set confidence="high" only when you have direct, unambiguous evidence from the input.
- Set confidence="medium" for reasonable inferences with partial evidence.
- Set confidence="low" when data is incomplete or inference is speculative.

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
- Content modularity: clear sections, lists/tables/Q&A where appropriate
- Evidence signals: citations, author info, dates, measurable proof points
- Internal linking quality: count, anchor relevance, depth, presence of related links
- Schema coverage: which types exist, validity (basic), mismatch risk
- Social meta tags: Open Graph and Twitter Card presence and completeness
- International SEO: hreflang tags presence if applicable
- Mobile readiness: viewport meta tag presence
- Image optimization: alt text coverage, dimension attributes for CLS
- Boilerplate ratio: main content vs repeated template noise (rough heuristic)
- Extraction hazards: broken numbering, duplicated headings, huge unchunked paragraphs, excessive CTA repetition

**STRUCTURED DATA MARKUP (CRITICAL FOR RICH RESULTS & LLM PROCESSING):**
Structured data (Schema.org JSON-LD) can make your content eligible for rich results in Google Search and may help LLMs understand your content structure and relationships more accurately.

IMPORTANT CONTEXT - Rich Result Eligibility:
- HowTo rich results are DEPRECATED (Google removed How-to rich results; the Search Central announcement calls it deprecated)
- FAQ rich results are HEAVILY RESTRICTED (Google limited FAQ rich results to authoritative government and health sites)
- Only claim rich_results_benefit if that schema type is currently eligible for rich results for this kind of site/page
- Use only properties supported by Google's documentation for that feature; do not invent fields
- Structured data does NOT guarantee a rich result and has general eligibility/policy requirements

When generating schema_recommendations:
1. For action="add": Provide complete, valid JSON-LD code_example with required properties. Include rationale explaining why this schema helps with rich results (if eligible) and LLM processing. List required_properties and recommended_properties. Include testing_steps (Rich Results Test, Search Console). Add eligibility_note explaining "not guaranteed" and any feature availability constraints.
2. For action="fix": Provide corrected JSON-LD code_example. Explain what was wrong in rationale. Include implementation_steps to fix the issue. List missing required_properties or incorrect properties.
3. For action="remove": code_example can be null. Focus implementation_steps on removal process and re-testing. Explain why removal is recommended in rationale.
4. For action="validate": Provide the existing schema as code_example. Include testing_steps to verify it's working correctly.

REQUIREMENTS:
- code_example: REQUIRED for "add", "fix", "validate" actions. Must be complete, valid JSON-LD that can be copied and pasted. For "remove" action, code_example can be null.
- implementation_steps: ALWAYS required (minimum 1 step). Must be actionable, numbered steps.
- placement_instructions: Where to place the schema (e.g., "in the <head> section before </head>", "right after <body> tag", "before </body> tag"). Can be null if not applicable.
- rationale: REQUIRED. Explain why this schema helps with rich results (if eligible) and LLM processing. For HowTo/FAQ, note that rich results are not generally available but may help understanding.
- rich_results_benefit: Only include if the schema type is currently eligible for rich results for this site/page type. Can be null.
- llm_benefit: Explain how this helps LLMs understand content structure. Can be null.
- required_properties: Array of required properties for eligibility (e.g., ["name", "description"] for Product schema).
- recommended_properties: Array of recommended properties for completeness (e.g., ["brand", "offers"] for Product schema).
- testing_steps: Steps to test (e.g., ["Use Google Rich Results Test tool", "Check Search Console for errors"]).
- eligibility_note: Explicit note about "not guaranteed" and feature availability constraints (e.g., "Rich results are not guaranteed. FAQ schema is restricted to authoritative government and health sites.").

SCHEMA PLACEMENT:
- JSON-LD can be placed in <head> or <body> sections
- Google recommends JSON-LD format
- Can be implemented in ways compatible with typical site templates
- Avoid implying only-head placement as a universal rule

LLM BENEFITS (Temper claims):
- Structured data can help machines interpret entities and relationships
- Do NOT imply a direct ranking boost
- Do NOT guarantee "ChatGPT will use this"
- Frame as "may improve interpretability for systems that consume structured signals"

CODE GENERATION GUIDELINES:
- Prefer minimal valid markup: required + high-value recommended fields only
- If schema would be huge, generate a minimal baseline and optionally add "expandable fields" suggestions
- Ensure JSON-LD is valid JSON (proper escaping, no trailing commas)
- Use real data from the page when possible (title, description, etc.)

**ANSWER BLOCK ANALYSIS (CRITICAL FOR AI EXTRACTABILITY):**
The "Answer Block" is a concise answer to the primary query placed within the first 150-250 words of the main content. This is CRITICAL because:
1. AI systems (ChatGPT, Claude, Perplexity, Google AI Overviews) extract and cite content from the beginning of articles
2. Users scanning content decide within seconds if the page answers their question
3. Search engines use early content to understand page relevance and generate featured snippets

When analyzing answer_block_analysis:
1. Examine the "FIRST 250 WORDS" section provided in the input
2. Determine if these first words directly answer the inferred primary_intent
3. Rate answer_quality as:
   - "excellent": Clear, complete answer within first 150-250 words, directly addresses query
   - "good": Partial answer present, could be more direct or complete
   - "needs_improvement": Introduction is present but doesn't directly answer the query (e.g., only context/background)
   - "missing": No answer block, page jumps into details without providing upfront value
4. If answer is weak/missing, generate a suggested_answer_block (150-200 words) that:
   - Directly answers the primary query in plain language
   - Includes key facts, numbers, or actionable points
   - Can be placed immediately after the H1 or introductory paragraph
5. Provide specific placement_recommendation (e.g., "Add after the H1 'Understanding Redaction Failures' and before the first H2")

**SCORING (0-100 with confidence):**
- extractability: How easily can AI systems extract and understand the main content?
- structure: How well-organized is the page structure (headings, sections, hierarchy)?
- trust: How trustworthy/authoritative does the content appear (citations, dates, author)?
- internal_discovery: How well does the page facilitate internal site navigation?
- answer_block: How well does the page provide immediate value with a concise answer in the first 150-250 words?
  - 90-100: Excellent answer block that directly answers the primary query with key facts
  - 70-89: Good answer present but could be more direct or complete
  - 50-69: Introduction exists but doesn't directly answer the query
  - 0-49: No clear answer block, page doesn't provide upfront value

Each score MUST include a confidence level based on available evidence.

**PRIORITY LEVELS:**
- P0: Critical issues that significantly hurt extractability or structure (e.g., no H1, missing answer block)
- P1: Important improvements that would meaningfully enhance discoverability
- P2: Nice-to-have optimizations

**OUTPUT:**
Return ONLY a JSON object matching the requested schema. Be specific and actionable.

**IMPORTANT:**
- Set brand_consistency to null (this will be populated separately if brand analysis is requested).
- Populate data_quality based on the input indicators (html_available, content length, etc.).
- All other fields must be populated with actual audit results grounded in evidence.`;

export interface SeoAuditContext {
  page_type?: "blog" | "product" | "landing" | "docs";
  target_keyword?: string;
  target_audience?: string;
  brand_voice?: string;
}

export interface ImageData {
  src: string;
  alt: string | null;
  width: string | null;
  height: string | null;
  loading: string | null; // "lazy" | "eager" | null
  hasLazySrc: boolean; // data-src, data-lazy-src, etc.
  srcset: string | null;
}

export interface OpenGraphData {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
  type: string | null;
  siteName: string | null;
}

export interface TwitterCardData {
  card: string | null; // "summary", "summary_large_image", etc.
  title: string | null;
  description: string | null;
  image: string | null;
  site: string | null;
  creator: string | null;
}

export interface HreflangTag {
  hreflang: string;
  href: string;
}

export interface PageAnalysis {
  jinaContent: string;
  html: string;
  domData: {
    title: string | null;
    metaDescription: string | null;
    canonical: string | null;
    robotsMeta: string | null;
    // Additional robots variants
    googlebotMeta: string | null;
    bingbotMeta: string | null;
    // Viewport for mobile-first
    viewport: string | null;
    // Open Graph tags
    openGraph: OpenGraphData;
    // Twitter Cards
    twitterCard: TwitterCardData;
    // International SEO
    hreflangTags: HreflangTag[];
    // Content structure
    headings: Array<{ level: number; text: string }>;
    wordCount: number;
    // Links
    internalLinks: Array<{ href: string; anchorText: string }>;
    externalLinks: Array<{ href: string; anchorText: string }>;
    // Images with extended data
    images: ImageData[];
    imagesWithoutAlt: number;
    imagesWithoutDimensions: number;
    // Schema
    schemaJsonLd: Array<Record<string, any>>;
    schemaParseErrors: number; // Count of invalid JSON-LD blocks
  };
}

export interface DataQualityInput {
  htmlAvailable: boolean;
  jinaContentLength: number;
  domParseSuccess: boolean;
  contentTruncated: boolean;
  limitations: string[];
}

/**
 * Search query data from DataForSEO
 * Provides real search volume data to inform primary query identification
 */
export interface SearchQueryData {
  query: string;
  searchVolume: number;
  cpc: number;
  competition: string;
  isQuestion: boolean; // Whether the query is a question (what, how, why, etc.)
}

/**
 * Generate SEO audit recommendations using AI
 */
export async function generateSeoAudit(
  url: string,
  analysis: PageAnalysis,
  context?: SeoAuditContext,
  dataQuality?: DataQualityInput,
  searchQueries?: SearchQueryData[]
): Promise<SeoAuditResult> {
  // Truncate content to control costs (max 100k chars for LLM)
  const maxContentLength = 100000;
  const contentTruncated = analysis.jinaContent.length > maxContentLength;
  const truncatedJina = contentTruncated
    ? analysis.jinaContent.substring(0, maxContentLength) + "\n\n[Content truncated for analysis...]"
    : analysis.jinaContent;

  // Build data quality context
  const dq = dataQuality || {
    htmlAvailable: !!analysis.html,
    jinaContentLength: analysis.jinaContent.length,
    domParseSuccess: true,
    contentTruncated,
    limitations: [],
  };
  
  if (contentTruncated && !dq.limitations.includes("Content truncated")) {
    dq.limitations.push(`Content truncated at ${maxContentLength} characters`);
  }

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

  // Build Open Graph summary
  const og = analysis.domData.openGraph;
  const ogSummary = [
    og.title ? `og:title: "${og.title}"` : "og:title: Missing",
    og.description ? `og:description: "${og.description.substring(0, 100)}${og.description.length > 100 ? '...' : ''}"` : "og:description: Missing",
    og.image ? `og:image: Present` : "og:image: Missing",
    og.type ? `og:type: "${og.type}"` : "og:type: Missing",
  ].join("\n  ");

  // Build Twitter Card summary
  const tc = analysis.domData.twitterCard;
  const tcSummary = [
    tc.card ? `twitter:card: "${tc.card}"` : "twitter:card: Missing",
    tc.title ? `twitter:title: "${tc.title}"` : "twitter:title: Missing (will fallback to og:title)",
    tc.image ? `twitter:image: Present` : "twitter:image: Missing (will fallback to og:image)",
  ].join("\n  ");

  // Build hreflang summary
  const hreflangSummary = analysis.domData.hreflangTags.length > 0
    ? analysis.domData.hreflangTags.map(h => `${h.hreflang}: ${h.href}`).join(", ")
    : "None found";

  // Build schema summary
  const schemaTypes = analysis.domData.schemaJsonLd
    .map(s => s["@type"] || "Unknown type")
    .join(", ") || "None";

  // Build analysis summary for LLM
  const domAnalysis = `
DATA QUALITY INDICATORS:
- html_available: ${dq.htmlAvailable}
- jina_content_length: ${dq.jinaContentLength}
- dom_parse_success: ${dq.domParseSuccess}
- content_truncated: ${dq.contentTruncated}
- limitations: ${dq.limitations.length > 0 ? dq.limitations.join("; ") : "None"}

DOM ANALYSIS:
- Title: ${analysis.domData.title || "Missing"} (${analysis.domData.title?.length || 0} chars)
- Meta Description: ${analysis.domData.metaDescription || "Missing"} (${analysis.domData.metaDescription?.length || 0} chars)
- Canonical: ${analysis.domData.canonical || "Missing"}
- Viewport: ${analysis.domData.viewport || "Missing"}
- Robots Meta: ${analysis.domData.robotsMeta || "Not set"}
- Googlebot Meta: ${analysis.domData.googlebotMeta || "Not set"}
- Bingbot Meta: ${analysis.domData.bingbotMeta || "Not set"}
- Word Count: ${analysis.domData.wordCount}

OPEN GRAPH TAGS:
  ${ogSummary}

TWITTER CARD TAGS:
  ${tcSummary}

HREFLANG TAGS: ${hreflangSummary}

HEADINGS: ${analysis.domData.headings.length} found
  H1: ${analysis.domData.headings.filter(h => h.level === 1).length}
  H2: ${analysis.domData.headings.filter(h => h.level === 2).length}
  H3: ${analysis.domData.headings.filter(h => h.level === 3).length}

LINKS:
  Internal: ${analysis.domData.internalLinks.length}
  External: ${analysis.domData.externalLinks.length}

IMAGES: ${analysis.domData.images.length} total
  Without alt text: ${analysis.domData.imagesWithoutAlt}
  Without dimensions (width/height): ${analysis.domData.imagesWithoutDimensions}
  With lazy loading: ${analysis.domData.images.filter(img => img.loading === "lazy" || img.hasLazySrc).length}

SCHEMA JSON-LD: ${analysis.domData.schemaJsonLd.length} blocks found
  Types: ${schemaTypes}
  Parse errors: ${analysis.domData.schemaParseErrors}

HEADINGS TREE:
${analysis.domData.headings.map(h => `${"  ".repeat(h.level - 1)}H${h.level}: ${h.text}`).join("\n") || "(No headings found)"}
`;

  // Extract first 250 words for answer block analysis
  const words = analysis.jinaContent.split(/\s+/).filter(w => w.length > 0);
  const first250Words = words.slice(0, 250).join(" ");
  const first250WordCount = Math.min(words.length, 250);

  // Build search queries section if available
  let searchQueriesSection = "";
  if (searchQueries && searchQueries.length > 0) {
    const questionQueries = searchQueries.filter(q => q.isQuestion);
    const topQueries = searchQueries.slice(0, 10);
    
    searchQueriesSection = `
REAL SEARCH DATA (from DataForSEO - use this to identify the PRIMARY QUERY):
Top Related Search Queries by Volume:
${topQueries.map((q, i) => `  ${i + 1}. "${q.query}" - ${q.searchVolume.toLocaleString()} monthly searches${q.isQuestion ? " [QUESTION]" : ""}`).join("\n")}

${questionQueries.length > 0 ? `Question-Based Queries (ideal for answer blocks):
${questionQueries.slice(0, 5).map((q, i) => `  ${i + 1}. "${q.query}" - ${q.searchVolume.toLocaleString()} monthly searches`).join("\n")}
` : ""}
IMPORTANT: Use this real search data to:
1. Identify the PRIMARY QUERY users are searching for (prioritize by search volume)
2. Ensure the answer_block addresses the highest-volume relevant query
3. Suggest content that answers question-based queries if present
`;
  } else {
    searchQueriesSection = `
SEARCH DATA: Not available (DataForSEO not configured or no queries found)
- Primary query will be inferred from page content analysis
`;
  }

  const userContent = `Audit this webpage for SEO structure and AI extractability:

URL: ${url}
${contextPrompt}

${domAnalysis}
${searchQueriesSection}

FIRST 250 WORDS (Critical for Answer Block Analysis):
Word count in excerpt: ${first250WordCount}
---
${first250Words}
---

MAIN CONTENT (from Jina Reader):
${truncatedJina}

Analyze this page and provide specific, actionable recommendations. Use the DATA QUALITY INDICATORS to set appropriate confidence levels.

IMPORTANT: Pay special attention to the answer_block_analysis. ${searchQueries && searchQueries.length > 0 
  ? "Use the REAL SEARCH DATA above to identify the primary query users are searching for, then evaluate whether the FIRST 250 WORDS directly answer that query." 
  : "Evaluate whether the FIRST 250 WORDS directly answer the inferred primary query."} If not, provide a suggested_answer_block that the content owner can add immediately after their H1 or intro paragraph.`;

  try {
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: SEO_AUDIT_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: zodResponseFormat(SeoAuditSchema, "seo_audit"),
      temperature: 0.3,
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate structured SEO audit");
    }

    // Ensure URL is set and override data_quality with actual values
    return {
      ...result,
      url,
      data_quality: {
        html_available: dq.htmlAvailable,
        jina_content_length: dq.jinaContentLength,
        dom_parse_success: dq.domParseSuccess,
        content_truncated: dq.contentTruncated,
        limitations: dq.limitations,
      },
      brand_consistency: result.brand_consistency ?? null,
      brand_consistency_skipped: result.brand_consistency_skipped ?? null,
      search_queries: searchQueries && searchQueries.length > 0 ? searchQueries : null,
    };
  } catch (error) {
    console.error("Error generating SEO audit:", error);
    throw error;
  }
}
