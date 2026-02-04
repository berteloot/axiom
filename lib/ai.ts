import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getImageAsBase64, extractKeyFromS3Url } from "./s3";
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
    "Webinar_Recording", "Sales_Deck", "Technical_Doc", "Playbook"
  ]).describe("The format of the asset. IMPORTANT: If the title or content contains 'playbook', classify as 'Playbook'. Playbooks are sales enablement documents that provide structured guidance, frameworks, or methodologies for sales teams."),

  funnelStage: z.enum([
    "TOFU_AWARENESS", 
    "MOFU_CONSIDERATION", 
    "BOFU_DECISION", 
    "RETENTION"
  ]).describe("The buyer's journey stage. WATERFALL PRIORITY RULE: Analyze primary intent. Check in order - (1) BOFU: User validating risk/ROI (hard ROI metrics, pricing, security compliance, deep implementation specs, explicit commercial CTAs). Case Studies with metrics → BOFU, narrative-only → MOFU. (2) MOFU: User comparing approaches (comparative content, methodology, capabilities without pricing). (3) TOFU: User discovering problems (trends, definitions, pain agitation without product pitch). Use asset type heuristics as tie-breakers."),

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
    
  applicableIndustries: z.array(z.string())
    .max(5)
    .describe("Industries where this asset would be most relevant based on content analysis. Use standard industry names (e.g., 'Hospital & Health Care', 'Financial Services', 'Computer Software'). Extract from: explicit industry mentions, compliance frameworks (HIPAA→Healthcare), terminology patterns, role mentions, customer examples. Maximum 5 industries."),
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
  applicableIndustries: string[];
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
   - Examples: ✅ "CFO", "VP of Engineering", "Chief Marketing Officer" | ❌ "Enterprise", "SMB", "Startups", "Managers", "Leaders"
   
   **PAIN CLUSTER → ICP MAPPING (MANDATORY - Match ICPs to pain ownership):**
   🔴 CRITICAL: You MUST include the functional owner of the pain cluster, not just C-suite generalists.
   
   - **Data Privacy/Compliance pains** (e.g., "Data Privacy Compliance", "Data Privacy", "GDPR Risk", "Regulatory Compliance", "Sensitive Data"):
     → 🔴 MUST INCLUDE: Data Privacy Officer, Data Protection Officer (DPO), or Privacy Officer
     → ALSO CONSIDER: Chief Privacy Officer, CISO, Compliance Manager, Compliance Officer, General Counsel, Risk Manager
   
   - **Security pains** (e.g., "Cybersecurity Risk", "Data Breach Exposure", "Security Compliance", "Data Security"):
     → 🔴 MUST INCLUDE: Chief Information Security Officer (CISO) or Information Security Manager
     → ALSO CONSIDER: Security Director, CIO, IT Security Manager
   
   - **Manual Process/Efficiency pains** (e.g., "Manual Processes", "Time-consuming Workflows", "Operational Bottlenecks", "Manual Redaction"):
     → MUST INCLUDE: The functional owner (e.g., "Manual Redaction" → Legal Operations Director, General Counsel)
     → ALSO CONSIDER: VP of Operations, COO, Operations Director
   
   - **Technology/Engineering pains** (e.g., "Technical Debt", "Legacy Systems", "System Integration"):
     → CTO, CIO, VP of Engineering, IT Director, Engineering Director
   
   - **Cost/Financial pains** (e.g., "Cost Overruns", "Budget Constraints", "ROI Uncertainty"):
     → CFO, VP of Finance, Financial Controller
   
   - **Growth/Revenue pains** (e.g., "Customer Churn", "Lead Quality", "Pipeline Velocity"):
     → CRO, VP of Sales, VP of Marketing, CMO, Customer Success Director
   
   - **Legal/Risk pains** (e.g., "Litigation Risk", "Contract Compliance", "E-Discovery"):
     → General Counsel, Chief Legal Officer, Legal Operations Director, Risk Manager
   
   🔴 MANDATORY RULE: If the pain cluster contains "Data Privacy" or "Privacy Compliance", you MUST include "Data Privacy Officer" or "Data Protection Officer (DPO)" as one of the ICPs. Do NOT skip this role in favor of generic executives like CEO.

3. **Funnel Stage** (STRICT WATERFALL LOGIC):
   Analyze the asset's *primary intent*. Check these conditions in order. Stop at the first match.
   
   **PRODUCT VISIBILITY QUICK CHECK (Initial Filter):**
   - No product mention at all → Lean TOFU
   - Product shown as one approach among alternatives → Lean MOFU
   - Product as THE solution with proof/metrics → Lean BOFU
   
   **PRIORITY 1: BOFU (Decision) - "Validate & Buy"**
   - **Buyer State:** Purchase-ready, needs risk reduction and ROI validation
   - **Signals:** 
     - Hard numbers: ROI metrics (e.g., "saved 30%", "reduced by X%"), specific pricing models
     - Social Proof: Named customers with specific results, direct testimonials with job titles
     - Validation: Trust centers, security compliance, legal terms, deep implementation specs (API docs)
     - Commercials: Explicit "Book a Demo", "Talk to Sales", "Get Pricing" as the primary CTA
   - **Signal Words:** "achieved", "saved", "reduced", "ROI", "results", "testimonial", "proof", "success story", specific % or $
   - **Asset Types:** Pricing Sheets, ROI Calculators, Contracts, Technical Implementation Guides, Case Studies with metrics
   - **Case Study Rule:** Contains specific metrics ($ saved, % gain) or "Results" section → BOFU. Purely narrative without data → MOFU.
   - **Social Proof Rule:** Named customers with quantified results → BOFU. Anonymous examples or general claims → MOFU.
   
   **PRIORITY 2: MOFU (Consideration) - "Evaluate Options"**
   - **Buyer State:** Solution-aware, actively comparing approaches and vendors
   - **Signals:** 
     - Comparative: "Us vs. Them", "Old Way vs. New Way", feature comparisons
     - Methodology: Explains the framework, features, or unique mechanism of action
     - Capabilities: Deep dives into *what* the product does, but without hard pricing/contract data
     - CTAs: Free trial, demo requests, gated content downloads
   - **Signal Words:** "vs", "comparison", "how to", "which is better", "features", "capabilities", "use cases", "best practices"
   - **Asset Types:** Whitepapers, Solution Briefs, Product Demos, Webinar Recordings, Feature Deep-Dives
   - **Competitor Rule:** Direct competitor comparisons → MOFU. Winning against competitor with proof → BOFU.
   
   **PRIORITY 3: TOFU (Awareness) - "Discover Problem"**
   - **Buyer State:** Problem-aware or problem-unaware, not yet solution-aware
   - **Signals:** 
     - High-level trends, industry news, definitions ("What is X?")
     - Agitating pain points without pitching product as the solution
     - Brand acts as "Publisher/Educator" rather than "Vendor"
     - CTAs: Subscribe, follow, download educational content
   - **Signal Words:** "What is", "Guide to", "Introduction to", "101", "Basics of", "Why X matters", "trends"
   - **Asset Types:** Blog Posts, Trend Reports, Infographics, Glossaries, High-Level Checklists, Thought Leadership
   
   **PRIORITY 4: RETENTION - "Expand & Succeed"**
   - **Buyer State:** Existing customer seeking to maximize value
   - **Signals:** Customer success content, upsell/cross-sell, advanced usage guides, community/user group content
   - **Signal Words:** "advanced", "pro tips", "maximize", "expand", "upgrade", "new features for customers"
   - **Asset Types:** Customer newsletters, advanced tutorials, expansion guides, user community content
   
   **EDGE CASES:**
   - **Hybrid Content:** If content spans stages, classify by PRIMARY intent. Note that educational content featuring product heavily = MOFU minimum.
   - **Gated vs Ungated:** Gating alone doesn't determine stage; analyze the content substance.
   - **CTA Rule:** When in doubt, the call-to-action often reveals true funnel position.
   
   **ASSET TYPE HEURISTICS (Use as tie-breakers):**
   - **Sales Deck** → Strong indicator of MOFU or BOFU
   - **Whitepaper** → Strong indicator of MOFU
   - **Playbook** → Strong indicator of MOFU (sales enablement, structured guidance)
   - **Infographic** → Strong indicator of TOFU
   - **Case Study** → Check for metrics (BOFU) vs narrative-only (MOFU)
   
   **ASSET TYPE DETECTION PRIORITY:**
   - 🔴 CRITICAL: If the title contains "playbook" (case-insensitive), classify as "Playbook" - do NOT classify as "Whitepaper".
   - If the content repeatedly mentions "playbook" or provides structured sales guidance/frameworks, classify as "Playbook".
   - Playbooks are sales enablement documents that provide structured guidance, frameworks, methodologies, or step-by-step processes for sales teams.
   - Do NOT confuse Playbooks with Whitepapers - Playbooks are more tactical and action-oriented.

4. **Outreach**: Write the hook as if you are a rep sending a personal note to a prospect.

5. **Applicable Industries** (EXTRACTION RULES):
   Identify industries where this asset would be most relevant. Look for these signals in the content:
   
   **EXPLICIT MENTIONS:**
   - Direct industry names: "healthcare organizations", "financial institutions", "manufacturing companies"
   - Vertical-specific terminology: "patient data", "loan origination", "supply chain"
   
   **COMPLIANCE/REGULATION SIGNALS:**
   - HIPAA, HL7, FHIR → Hospital & Health Care
   - SOX, Basel III, AML, KYC → Banking, Financial Services
   - GDPR → Applies broadly, check other signals
   - PCI-DSS → Retail, Financial Services
   - FDA 21 CFR Part 11 → Pharmaceuticals, Biotechnology, Medical Devices
   - FedRAMP, ITAR → Government Administration, Defense & Space
   - SOC 2, ISO 27001 → Broadly applicable (IT/Security focus)
   
   **ROLE-BASED SIGNALS:**
   - Chief Medical Officer, Clinical Director → Hospital & Health Care
   - Chief Investment Officer, Portfolio Manager → Investment Management
   - Plant Manager, Manufacturing Engineer → Industrial Automation, Machinery
   - Retail Operations Director, Store Manager → Retail
   
   **TECHNOLOGY SIGNALS:**
   - EMR, EHR, PACS → Hospital & Health Care
   - Core Banking, Payment Processing → Banking, Financial Services
   - ERP, MES, SCADA → Industrial Automation, Manufacturing
   - CRM, Marketing Automation → Broadly applicable
   
   **CUSTOMER EXAMPLE SIGNALS:**
   - If case studies mention specific industry customers, include those industries
   
   **OUTPUT FORMAT:**
   - Use standard industry names aligned with common taxonomies
   - Examples: "Hospital & Health Care", "Financial Services", "Computer Software", "Retail", "Manufacturing", "Insurance", "Telecommunications"
   - Maximum 5 industries per asset
   - If truly industry-agnostic (e.g., generic productivity content), use broad categories like "Information Technology & Services"

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
  accountId?: string,
  title?: string | null
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

CRITICAL ANALYSIS RULES:
🔴 YOU MUST ANALYZE EACH ASSET'S ACTUAL CONTENT INDIVIDUALLY. Do NOT default to brand context values without content analysis.

1. matchedProductLineId: MUST use exact ID from productLines[].id above. NO hallucination.

2. painClusters: 
   - FIRST: Analyze the asset's content to identify what problems it addresses
   - THEN: If the content addresses problems matching painClusters[] terms, use those exact terms
   - ELSE: Infer new pain clusters from the content (2-5 words, Title Case)
   - DO NOT default to painClusters[] without content analysis

3. icpTargets: 
   - FIRST: Analyze the asset's content to determine WHO it targets (job titles mentioned, personas addressed)
   - THEN: If content targets roles matching primaryICPRoles[], use those exact titles
   - ELSE IF: Content targets roles matching productLines[].targetAudience, use those
   - ELSE: Infer new ICP targets from content analysis (specific job titles only)
   - DO NOT default to primaryICPRoles[] if the content doesn't actually target those roles
   - Each asset may target different ICPs based on its unique content

4. funnelStage: 
   - Use STRICT WATERFALL LOGIC based on the asset's ACTUAL CONTENT
   - Analyze the content's primary intent, not just asset type
   - Check BOFU signals first (ROI/metrics/validation/commercials in the content)
   - Then MOFU (comparative/methodology in the content)
   - Then TOFU (trends/problems/education in the content)
   - Case Studies with metrics → BOFU, narrative-only → MOFU
   - Blog posts can be TOFU, MOFU, or BOFU depending on their actual content - analyze each individually

5. snippets: Prioritize ROI_STAT matching roiClaims[], COMPETITIVE_WEDGE matching keyDifferentiators[].

REMEMBER: Each asset is unique. Analyze its actual content, not just the brand context.
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
      if (!key) {
        throw new Error(`Could not extract S3 key from URL: ${s3Url}`);
      }
      
      // Download image from S3 and convert to base64 to avoid OpenAI timeout issues
      console.log(`[IMAGE] Downloading image from S3 and converting to base64: ${key}`);
      const imageDataUrl = await getImageAsBase64(key);
      
      userContent = [
        { type: "text", text: "Analyze this marketing asset image." },
        { type: "image_url", image_url: { url: imageDataUrl } },
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
      const safeText = text.length > 300000 ? text.slice(0, 300000) + "..." : text;
      
      // Check if title or content contains "playbook" (case-insensitive) for asset type detection
      const titleContainsPlaybook = title ? /playbook/i.test(title) : false;
      const contentContainsPlaybook = /playbook/i.test(safeText);
      const containsPlaybook = titleContainsPlaybook || contentContainsPlaybook;
      
      const playbookInstruction = containsPlaybook 
        ? `\n\n🔴 ASSET TYPE PRIORITY: ${titleContainsPlaybook ? "The TITLE" : "The content"} contains 'playbook' - you MUST classify this as 'Playbook' asset type, NOT 'Whitepaper'. Playbooks are sales enablement documents with structured guidance, frameworks, or methodologies.`
        : "";

      const titleContext = title ? `\n\nAsset Title: "${title}"` : "";

      userContent = [
        { type: "text", text: `🔴 CRITICAL: Analyze THIS SPECIFIC ASSET'S CONTENT below. Each asset is unique - do not default to generic values. Base your analysis on the actual content provided.${titleContext}${playbookInstruction}

Analyze this content:
${safeText}

Remember: Analyze the actual content above to determine funnel stage, ICP targets, and pain clusters. Do not use default values without content justification.` }
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
      temperature: 0.4, // Slightly higher to allow variation between similar assets while maintaining consistency
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
      // Normalize applicable industries: dedupe, trim, limit to 5
      applicableIndustries: dedupeArray(result.applicableIndustries || [])
        .map(industry => industry.trim())
        .filter(industry => industry.length > 0 && industry.length < 100)
        .slice(0, 5),
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
