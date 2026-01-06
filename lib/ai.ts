import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getPresignedDownloadUrl, extractKeyFromS3Url } from "./s3";
import { prisma } from "./prisma";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Atomic Snippet Schema - for extracting "Gold Nuggets" from documents
const SnippetSchema = z.object({
  type: z.enum([
    "ROI_STAT",          // e.g. "Saved 30% on cloud costs"
    "CUSTOMER_QUOTE",    // e.g. "Best tool we've used - CTO of Acme"
    "VALUE_PROP",        // e.g. "The only tool with ISO 27001 cert"
    "COMPETITIVE_WEDGE", // e.g. "Unlike Salesforce, we offer..."
    "DEFINITION"         // e.g. "What is Headless CMS?"
  ]).describe("The category of this specific information nugget."),

  content: z.string()
    .max(280)
    .describe("The exact text of the stat, quote, or argument. Keep it concise (under 280 chars) so it's ready for social/email."),

  context: z.string()
    .describe("One sentence explaining where this fits or why it matters. (e.g. 'Use this when objection handling about price')."),
    
  pageLocation: z.number().nullable()
    .describe("The page number where this snippet was found. IMPORTANT: Only set a number if the input text contains explicit page markers (e.g., 'PAGE 1', 'PAGE 2', '[PAGE_BREAK_2]'). If the text extractor did not inject page markers, this MUST be null. Do not guess or hallucinate page numbers."),
    
  confidenceScore: z.number().min(1).max(100)
    .describe("How strong/useful is this snippet? 100 = Perfect for a slide deck."),
    
  isVerbatim: z.boolean()
    .describe("True if this is exact quoted text from the source. False if paraphrased or inferred from visual context (e.g., charts, images)."),
});

// Normalization helpers
/**
 * Smart title-case normalization for pain clusters only.
 * Preserves technical terms with digits, slashes, hyphens (e.g., "ISO 27001", "SOC 2", "S/4HANA").
 * Only applies title-case to simple word strings.
 */
function normalizePainClusterTitleCase(str: string): string {
  // If string contains digits, slashes, or hyphens, preserve as-is (likely technical term)
  if (/[0-9\/_-]/.test(str)) {
    return str.trim();
  }
  
  // Common acronyms that should stay all-caps
  const acronyms = new Set([
    'CEO', 'CTO', 'CFO', 'CMO', 'COO', 'CIO', 'CISO', 'CPO', 'CDO',
    'VP', 'SVP', 'EVP', 'IT', 'HR', 'PR', 'ROI', 'KPI', 'AI', 'ML',
    'US', 'UK', 'EU', 'B2B', 'B2C', 'SaaS', 'API', 'UI', 'UX', 'QA',
    'ISO', 'SOC', 'GDPR', 'HIPAA', 'PCI', 'SSO', 'MFA', 'IAM'
  ]);
  
  return str
    .split(/\s+/)
    .map(word => {
      const upper = word.toUpperCase();
      // Preserve known acronyms
      if (acronyms.has(upper)) {
        return upper;
      }
      // Preserve words that are already all caps (likely acronyms)
      if (word.length <= 4 && word === upper && /^[A-Z]+$/.test(word)) {
        return word;
      }
      // Normal title case for everything else
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function dedupeArray(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter(item => {
    const normalized = item.trim().toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

// 1. Define the Base Schema with Zod (Strict Typing)
// This guarantees the AI ONLY returns data in this exact shape.
// Note: matchedProductLineId will be added dynamically based on available product lines
const BaseAnalysisSchema = z.object({
  // "rationale" - brief explanation (renamed from reasoning, kept short)
  rationale: z.string()
    .max(200)
    .describe("Brief explanation (max 200 chars) of why this content fits the selected stage and persona."),
  
  assetType: z.enum([
    "Whitepaper", "Case_Study", "Blog_Post", "Infographic", 
    "Webinar_Recording", "Sales_Deck", "Technical_Doc"
  ]).describe("The format of the asset"),

  funnelStage: z.enum([
    "TOFU_AWARENESS", 
    "MOFU_CONSIDERATION", 
    "BOFU_DECISION", 
    "RETENTION"
  ]).describe("The buyer's journey stage. WATERFALL PRIORITY RULE: Check in order - (1) If contains specific ROI stats, customer testimonials, or pricing → BOFU (even if mentions pain points). (2) If explains how product works, features, or compares solutions → MOFU. (3) If only discusses problems/trends without solution details → TOFU. Asset Type Anchor: Case Study → BOFU, Sales Deck → MOFU/BOFU (never TOFU)."),

  icpTargets: z.array(z.string())
    .max(5)
    .describe("Job titles/roles ONLY (e.g., 'CTO', 'CFO', 'VP of Sales'). NO market segments like 'Enterprise' or 'SMB'. Maximum 5 targets."),
  
  painClusters: z.array(z.string())
    .max(3)
    .describe("Strategic problems addressed as noun phrases, 2-5 words, Title Case (e.g., 'Technical Debt', 'Data Silos', 'Compliance Risk'). NO verbs, NO company names, NO vague single words. Maximum 3 clusters."),

  outreachTip: z.string()
    .max(240)
    .describe("A one-sentence hook for email outreach (max 240 chars)."),
  
  contentGaps: z.array(z.string())
    .max(5)
    .nullable()
    .describe("Topics mentioned but not deeply explored (max 5 gaps)."),

  // New "Enterprise" fields
  atomicSnippets: z.array(SnippetSchema)
    .max(8)
    .describe("Extract the most punchy, usable 'Gold Nuggets' from this document."),
    
  contentQualityScore: z.number().min(1).max(100)
    .describe("Overall assessment of how actionable and well-written this asset is."),
    
  suggestedExpiryDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date format (YYYY-MM-DD)")
    .refine((date) => {
      const parsed = Date.parse(date);
      return !isNaN(parsed) && parsed > 0;
    }, {
      message: "Invalid date: must be a valid calendar date (e.g., '2026-02-30' is invalid)",
    })
    .describe("ISO Date string (YYYY-MM-DD format only). When will this content likely become outdated? Consider asset type (News = 6 months, Evergreen = 2 years). Must be a valid calendar date."),
});

// Function to create dynamic schema based on available product lines
function createAnalysisSchema(productLineIds: string[]) {
  if (productLineIds.length > 0) {
    // If product lines exist, constrain matchedProductLineId to ONLY those IDs
    return BaseAnalysisSchema.extend({
      matchedProductLineId: z.enum([productLineIds[0], ...productLineIds.slice(1)] as [string, ...string[]])
        .describe("The ID of the product line this asset best relates to. You MUST choose one of the provided product line IDs."),
    });
  } else {
    // If no product lines exist, make it nullable
    return BaseAnalysisSchema.extend({
      matchedProductLineId: z.null()
        .describe("No product lines exist for this account, so this must be null."),
    });
  }
}

// Extract the TypeScript type from the base schema
// Note: This represents the structure, but matchedProductLineId will be validated dynamically
export type AnalysisResult = z.infer<typeof BaseAnalysisSchema> & {
  matchedProductLineId: string | null;
};

const BASE_SYSTEM_PROMPT = `You are a Senior B2B Marketing Strategist. 
Your goal is to categorize marketing assets for an Asset Intelligence System.

STRATEGY GUIDELINES:
1. **Pain Clusters** (CRITICAL RULES):
   - Must be 2-5 words, noun phrase, Title Case (e.g., "Technical Debt", "Operational Inefficiency", "Data Silos")
   - Ignore surface symptoms ("slow app"). Identify the root strategic driver.
   - NO verbs, NO company names, NO vague single words like "Efficiency" alone
   - NO duplicates or near-duplicates (e.g., don't include both "Tech Debt" and "Technical Debt")
   - Maximum 3 distinct clusters per asset
   - Examples: ✅ "Cost Management", "Compliance Risk", "Customer Churn" | ❌ "Efficiency", "Slow", "Acme Corp Problems"

2. **ICP Targets** (CRITICAL RULES - READ CAREFULLY):
   - MUST be job titles/roles ONLY (e.g., "CTO", "CFO", "VP of Sales", "Chief Medical Officer")
   - NO market segments (❌ "Enterprise", "SMB", "Startups")
   - NO generic titles (❌ "Manager", "Director" - be specific like "Marketing Manager", "Engineering Director")
   - 🔴 CRITICAL: If the company has provided PRIMARY ICP ROLES in the context, you MUST use those exact titles when the asset targets those personas
   - Be flexible in recognizing roles: "technology leaders" = CTO, "finance executives" = CFO, "sales leadership" = VP of Sales
   - Prioritize C-level and VP roles when relevant
   - Examples: ✅ "CFO", "VP of Engineering", "Chief Marketing Officer" | ❌ "Enterprise", "SMB", "Startups", "Managers", "Leaders"

3. **Funnel Stage** (STRICT WATERFALL LOGIC):
   Determine the funnel stage by checking these conditions in order. Stop at the first match.
   
   **PRIORITY 1: BOFU (Decision) - "The Proof"**
   - **Signals:** Contains specific ROI metrics (e.g., "saved 30%", "$X cost reduction"), customer testimonials/quotes, pricing information, or legal/contract terms.
   - **Asset Types:** Case Studies, Pricing Sheets, ROI Calculators, Contracts, Customer Success Stories.
   - **CRITICAL RULE:** Even if the asset mentions "Pain Points" or problems, the presence of ROI/Proof/Testimonials makes it BOFU. A Case Study that describes customer pain is STILL BOFU because it proves the solution works.
   
   **PRIORITY 2: MOFU (Consideration) - "The Solution"**
   - **Signals:** Explains *how* the product/solution solves the problem. Mentions specific features, use cases, implementation details, or compares us vs. competitors (competitive differentiation).
   - **Asset Types:** Whitepapers, Solution Briefs, Webinar Recordings, Product Demos, Technical Documentation.
   - **Logic:** If it moves beyond "why this problem is bad" to "how we fix it" or "what makes us different," it is MOFU.
   
   **PRIORITY 3: TOFU (Awareness) - "The Problem"**
   - **Signals:** Focuses on market trends, definitions ("What is X?"), or agitating pain clusters without pitching the specific product/solution deeply.
   - **Asset Types:** Blog Posts, Infographics, Trend Reports, Checklists, Educational Content.
   - **Logic:** Default to TOFU only if no Solution or Proof signals are present. Pure educational/problem-focused content without solution details.
   
   **ASSET TYPE HARD ANCHORS:**
   - **Case Study** → MUST be BOFU (it's proof of success, always Decision stage)
   - **Sales Deck** → MUST be MOFU or BOFU (active selling, never TOFU)
   - **Whitepaper** → Typically MOFU (deep technical consideration)
   - **Infographic** → Typically TOFU (high-level visual awareness)

4. **Outreach**: Write the hook as if you are a rep sending a personal note to a prospect.

*** SNIPPET EXTRACTION RULES ***
Your goal is to "mine" the document for "Atomic Content" that a salesperson or marketer would want to copy-paste.

1. ROI STATS: Look for specific numbers (%, $, X times faster). 
   - BAD: "We save you money."
   - GOOD: "Reduces AWS spend by 40% within 3 months."

2. QUOTES: Extract high-impact testimonials or authority statements.
   - Ignore generic marketing fluff.

3. CONTEXT IS KING: For every snippet, the 'context' field must tell the user WHEN to use it.
   - Example: "Use this stat to counter the 'it's too expensive' objection."

4. QUALITY FILTER: If a document is fluff, return an empty snippets array. Do not hallucinate data.

*** IMAGE ANALYSIS RULES ***
If the input is an image (Infographic, Chart, Slide, Screenshot):

1. **OCR Everything:** Read ALL text in the image, including:
   - Main headlines and body text
   - Axis labels, footnotes, and legends on charts
   - Small print, watermarks, and attribution text
   - 🔴 CRITICAL: If text is too small/unclear to read, mark it as unreadable. DO NOT invent or hallucinate text that isn't legible.

2. **Describe Visuals:** When extracting a snippet, include the visual context.
   - Example: "Bar chart showing 50% growth" (Context: "Visual chart on slide 3")
   - Set isVerbatim=false for visual interpretations (charts, graphs)

3. **Charts are Gold:** If you see a chart or data visualization:
   - Extract the specific numbers for the 'atomicSnippets' array with type 'ROI_STAT'
   - Capture trends and comparisons shown
   - Set isVerbatim=false since these are visual interpretations

4. **Infographic Structure:** For infographics, extract each data point or statistic separately.
`;

export async function analyzeAsset(
  text: string | null,
  fileType: string,
  s3Url?: string,
  accountId?: string
): Promise<AnalysisResult> {
  try {
    // 1. Fetch Brand Context and Product Lines (new multi-product architecture)
    let brandContext = null;
    let productLines: any[] = [];
    let legacyProfile = null;

    if (accountId) {
      // Try new architecture first
      brandContext = await prisma.brandContext.findUnique({
        where: { accountId },
        include: {
          productLines: true,
        },
      });

      if (brandContext) {
        productLines = brandContext.productLines || [];
      } else {
        // Fallback to legacy CompanyProfile for backward compatibility
        legacyProfile = await prisma.companyProfile.findUnique({
          where: { accountId },
        });
      }
    }

    // 2. Create dynamic schema based on available product lines
    const productLineIds = productLines.map(pl => pl.id);
    const AnalysisSchema = createAnalysisSchema(productLineIds);

    let contextPrompt = "";
    
    // 3. Build context prompt (compact JSON format for efficiency)
    // NEW MULTI-PRODUCT LOGIC
    if (brandContext && productLines.length > 0) {
      const brandContextJson = JSON.stringify({
        brandVoice: Array.isArray(brandContext.brandVoice) 
          ? brandContext.brandVoice.join(", ") 
          : brandContext.brandVoice,
        valueProposition: brandContext.valueProposition || null,
        targetIndustries: brandContext.targetIndustries,
        competitors: brandContext.competitors,
        painClusters: brandContext.painClusters || [],
        primaryICPRoles: brandContext.primaryICPRoles || [],
        keyDifferentiators: brandContext.keyDifferentiators || [],
        useCases: brandContext.useCases || [],
        roiClaims: brandContext.roiClaims || [],
        productLines: productLines.map(line => ({
          id: line.id,
          name: line.name,
          description: line.description,
          valueProposition: line.valueProposition,
          targetAudience: line.specificICP
        }))
      }, null, 2);
      
      contextPrompt = `COMPANY CONTEXT (JSON):
${brandContextJson}

RULES:
1. matchedProductLineId: MUST use exact ID from productLines[].id above. NO hallucination.
2. painClusters: Prefer exact terms from painClusters[] when relevant, else infer (2-5 words, Title Case).
3. icpTargets: PRIORITY 1 = primaryICPRoles[], PRIORITY 2 = productLines[].targetAudience, PRIORITY 3 = infer new.
4. funnelStage: Use WATERFALL LOGIC (see system prompt). Check BOFU signals first (ROI/testimonials), then MOFU (solution/features), then TOFU (problem only). Case Studies → BOFU always.
5. snippets: Prioritize ROI_STAT matching roiClaims[], COMPETITIVE_WEDGE matching keyDifferentiators[].
`;
    } 
    // BRAND CONTEXT WITHOUT PRODUCT LINES
    else if (brandContext) {
      const brandContextJson = JSON.stringify({
        brandVoice: Array.isArray(brandContext.brandVoice) 
          ? brandContext.brandVoice.join(", ") 
          : brandContext.brandVoice,
        valueProposition: brandContext.valueProposition || null,
        targetIndustries: brandContext.targetIndustries,
        competitors: brandContext.competitors,
        painClusters: brandContext.painClusters || [],
        primaryICPRoles: brandContext.primaryICPRoles || [],
        keyDifferentiators: brandContext.keyDifferentiators || [],
        useCases: brandContext.useCases || [],
        roiClaims: brandContext.roiClaims || []
      }, null, 2);
      
      contextPrompt = `COMPANY CONTEXT (JSON):
${brandContextJson}

RULES:
1. painClusters: Prefer exact terms from painClusters[] when relevant, else infer (2-5 words, Title Case).
2. icpTargets: PRIORITY 1 = primaryICPRoles[], PRIORITY 2 = infer new (specific job titles only).
3. funnelStage: Use WATERFALL LOGIC (see system prompt). Check BOFU signals first (ROI/testimonials), then MOFU (solution/features), then TOFU (problem only). Case Studies → BOFU always.
4. snippets: Prioritize ROI_STAT matching roiClaims[], COMPETITIVE_WEDGE matching keyDifferentiators[].
`;
    } 
    // LEGACY SINGLE-PRODUCT LOGIC (backward compatibility)
    else if (legacyProfile) {
      const industries = legacyProfile.targetIndustries.join(", ");
      
      contextPrompt = `
--- COMPANY CONTEXT ---
You are acting as a Strategist for the company: "${legacyProfile.productName}".

OUR VALUE PROPOSITION: 
"${legacyProfile.valueProposition}"

OUR TARGET INDUSTRIES: 
${industries}

OUR IDEAL BUYER (ICP): 
"${legacyProfile.idealCustomerProfile}"

INSTRUCTIONS:
1. When identifying "ICP Targets", prioritize roles relevant to our Target Industries (e.g., if we target Healthcare, suggest "Chief Medical Officer" over generic "Manager").
2. When identifying "Pain Clusters", map the asset's content to the problems solved by our Value Proposition.
3. Tailor the "Outreach Tip" specifically for a buyer in these industries.
----------------------
`;
    }

    // 4. Construct the system message with context
    const systemMessage = contextPrompt + "\n" + BASE_SYSTEM_PROMPT;

    const isImage = fileType.startsWith("image/");
    let userContent: any[] = [];

    // --- HANDLE IMAGES ---
    if (isImage && s3Url) {
      const key = extractKeyFromS3Url(s3Url);
      const imageUrl = key ? await getPresignedDownloadUrl(key, 3600) : s3Url;
      
      userContent = [
        { type: "text", text: "Analyze this marketing asset image." },
        { type: "image_url", image_url: { url: imageUrl } },
      ];
    } 
    
    // --- HANDLE TEXT ---
    else {
      if (!text || text.trim().length === 0) {
        const isPDF = fileType === "application/pdf";
        if (isPDF) {
          throw new Error(`Cannot analyze PDF: Text extraction failed. This usually means the PDF is image-based (scanned) or encrypted. Please convert it to a searchable PDF or extract text manually.`);
        } else {
          throw new Error(`Cannot analyze ${fileType}: No text content found. Please ensure the file contains readable text content.`);
        }
      }
      
      // GPT-4o has a 128k context window. 
      // We only truncate if it's massive (>100k chars) to save cost, not because we have to.
      const safeText = text.length > 100000 ? text.slice(0, 100000) + "..." : text;
      
      userContent = [
        { type: "text", text: `Analyze this content:\n\n${safeText}` }
      ];
    }

    // --- THE MAGIC (Structured Outputs with Dynamic Schema) ---
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06", // Use this version for best Structured Output support
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userContent },
      ],
      response_format: zodResponseFormat(AnalysisSchema, "marketing_analysis"),
      temperature: 0.2, // Keep it low for consistent classification
    });

    const result = completion.choices[0].message.parsed;

    if (!result) throw new Error("AI failed to generate structured analysis");

    // Note: suggestedExpiryDate is now validated by Zod's .refine() - no manual validation needed
    // If the AI generates an invalid date, Zod will reject it and force a retry

    // Normalize and validate outputs
    const normalized: AnalysisResult = {
      ...result,
      matchedProductLineId: result.matchedProductLineId, // Enum validation already handled by Zod
      // Normalize rationale (trim and limit)
      rationale: result.rationale.trim().substring(0, 200),
      // Normalize ICP targets: dedupe, trim only (NO title-case to preserve technical terms like "RevOps", "S/4HANA")
      icpTargets: dedupeArray(result.icpTargets || [])
        .map(target => target.trim())
        .filter(target => target.length > 0 && target.length < 50) // Filter out invalid entries
        .slice(0, 5),
      // Normalize pain clusters: dedupe, smart title-case (preserves technical terms), filter vague single words, limit to 3
      painClusters: dedupeArray(result.painClusters || [])
        .map(cluster => normalizePainClusterTitleCase(cluster.trim()))
        .filter(cluster => {
          const words = cluster.split(/\s+/);
          // Must be 2-5 words, not a single vague word
          return words.length >= 2 && words.length <= 5 && 
                 !["efficiency", "productivity", "quality", "performance"].includes(cluster.toLowerCase());
        })
        .slice(0, 3),
      // Normalize outreach tip (trim and limit)
      outreachTip: result.outreachTip.trim().substring(0, 240),
      // Normalize content gaps if present
      contentGaps: result.contentGaps 
        ? dedupeArray(result.contentGaps.map(gap => gap.trim())).slice(0, 5)
        : null,
      // Date is already validated by Zod - use as-is (asset-processor will convert to Date for Prisma)
      suggestedExpiryDate: result.suggestedExpiryDate,
    };

    return normalized;

  } catch (error) {
    console.error("Error analyzing asset:", error);
    // Re-throw error instead of returning defaults - let the processor handle it
    throw error;
  }
}

// Export the snippet schema type for use in components
export type AtomicSnippet = z.infer<typeof SnippetSchema>;

// Re-export image analyzer for dedicated image analysis use cases
export { analyzeImage, isAnalyzableImage, type ImageAnalysisResult, type ImageSnippet } from "./ai/image-analyzer";

// Re-export video analyzer for audio-first video analysis
export { 
  analyzeVideo, 
  isAnalyzableVideo, 
  isAnalyzableAudio,
  isAnalyzableMedia,
  videoAnalysisToText,
  getSupportedVideoExtensions,
  getSupportedAudioExtensions,
  type VideoAnalysisResult, 
  type TranscriptSnippet,
  type SpeakerInsight,
} from "./ai/video-analyzer";
