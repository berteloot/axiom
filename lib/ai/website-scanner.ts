import { z } from "zod";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { BRAND_VOICES } from "@/lib/constants/brand-voices";
import { INDUSTRIES } from "@/lib/constants/industries";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Jina AI Reader - web-to-markdown API
const JINA_READER_URL = "https://r.jina.ai";
// Jina AI Search - for discovering trending topics
const JINA_SEARCH_URL = "https://s.jina.ai";
const JINA_API_KEY = process.env.JINA_API_KEY;

// 1. The Output Schema
// This guarantees the AI returns data that fits perfectly into the BrandIdentityForm
// Note: OpenAI Structured Outputs requires all fields to be required, use .nullable() for optional fields
export const WebsiteAnalysisSchema = z.object({
  productName: z.string()
    .describe("The clear, canonical name of the product or company."),
    
  tagline: z.string()
    .describe("A short, punchy 1-sentence description (e.g. 'The AI-powered CRM for Dentists')."),
    
  valueProposition: z.string()
    .describe("The core strategic promise. Format: 'We help [Target] achieve [Outcome] by [Mechanism].'"),
    
  targetIndustries: z.array(z.string())
    .describe("Infer ALL relevant vertical industries (3-7 industries). Think broadly about who would buy this product. Must match standard B2B industry names (e.g. 'Computer Software', 'Financial Services', 'Health, Wellness & Fitness', 'Marketing & Advertising', 'Information Technology & Services')."),
    
  idealCustomerProfile: z.string()
    .describe("Specific buyer roles (e.g. 'VP of Sales', 'Chief Compliance Officer') and company size/type."),
    
  brandVoice: z.string()
    .describe("Two adjectives describing the tone (e.g. 'Authoritative & Corporate' or 'Playful & Developer-focused'). Be specific about the tone characteristics."),
    
  competitors: z.array(z.string()).nullable()
    .describe("Any competitors mentioned or strongly implied (e.g. 'Alternative to Salesforce'). Return null if none found."),

  // === NEW FIELDS FOR ASSET ANALYSIS CONTEXT ===
  
  painClusters: z.array(z.string())
    .describe("The 3-7 core PAIN POINTS / PROBLEMS the company solves. Must be noun phrases, 2-4 words, Title Case. Examples: 'Data Silos', 'Manual Processes', 'Compliance Risk', 'Customer Churn', 'Technical Debt', 'Security Vulnerabilities'. These will be used to categorize marketing assets."),

  keyDifferentiators: z.array(z.string())
    .describe("The 2-5 unique selling points that differentiate from competitors. What do they do better/differently? Examples: 'AI-Powered Automation', 'Enterprise-Grade Security', 'No-Code Interface', 'Real-Time Analytics'."),

  primaryICPRoles: z.array(z.string())
    .describe("The 3-5 primary buyer job titles/roles. Must be specific titles like 'CTO', 'VP of Marketing', 'Chief Revenue Officer', 'Head of Engineering'. NOT segments like 'Enterprise' or 'SMB'."),

  useCases: z.array(z.string())
    .describe("The 3-6 primary use cases or applications. How do customers actually use the product? Examples: 'Sales Pipeline Management', 'Customer Onboarding', 'Compliance Reporting', 'API Integration'."),

  roiClaims: z.array(z.string()).nullable()
    .describe("Any specific ROI metrics or claims mentioned (e.g. '40% cost reduction', '3x faster deployment', '50% less manual work'). Return null if none found."),
});

export type WebsiteAnalysisResult = z.infer<typeof WebsiteAnalysisSchema>;

// Product Line Analysis Schema - for extracting product line information from text
export const ProductLineAnalysisSchema = z.object({
  name: z.string()
    .describe("The clear, canonical name of the product line or product category (e.g., 'Cloud Services', 'Consumer Electronics', 'Enterprise Security Suite')."),
  
  description: z.string()
    .describe("A clear description of what this product line is and what it includes. Should be 2-4 sentences."),
  
  valueProposition: z.string()
    .describe("The specific value proposition for THIS product line. Format: 'We help [Target] achieve [Outcome] by [Mechanism].' This should be specific to the product line, not the general company value prop."),
  
  specificICP: z.string()
    .describe("Who specifically buys THIS product line? Include job titles/roles, company size, industry, and key pain points. Be specific about the target audience for this particular product."),
});

export type ProductLineAnalysisResult = z.infer<typeof ProductLineAnalysisSchema>;

// 2. The System Prompt
// This instructs the AI on how to interpret the markdown content.
export const WEBSITE_ANALYSIS_SYSTEM_PROMPT = `
You are an expert B2B Market Analyst. Your job is to deeply "Profile" a company based on their website content.

**INPUT:**
You will receive markdown content scraped from a company's homepage/landing page.

**CRITICAL EXTRACTION RULES:**

1. **Value Proposition:**
   - Decode marketing speak into specifics. "We streamline workflows" → HOW? "Automating API integrations"
   - Format: "We help [Target] achieve [Outcome] by [Mechanism]."

2. **Target Industries (Be EXHAUSTIVE - 5-7 minimum):**
   - Think BROADLY about every industry that could use this product
   - Include BOTH direct AND adjacent industries
   - Example: Marketing automation tool → "Marketing & Advertising", "Computer Software", "Information Technology & Services", "E-Learning", "Financial Services", "Retail"
   - Use standard names: "Computer Software", "Financial Services", "Marketing & Advertising", "Information Technology & Services", "Management Consulting", "Internet"

3. **PAIN CLUSTERS (CRITICAL for Asset Analysis):**
   - Identify the 3-7 core PROBLEMS/CHALLENGES the company solves
   - Must be noun phrases, 2-4 words, Title Case
   - Look for: "challenges", "problems", "pain points", "struggles", "obstacles"
   - Transform benefits into problems: "Save time" → "Manual Processes", "Reduce errors" → "Data Quality Issues"
   - Examples: "Data Silos", "Manual Processes", "Compliance Risk", "Customer Churn", "Technical Debt", "Security Vulnerabilities", "Operational Inefficiency", "Slow Time-to-Market"

4. **PRIMARY ICP ROLES (3-5 job titles):**
   - Must be SPECIFIC job titles, not segments
   - ✅ "CTO", "VP of Marketing", "Chief Revenue Officer", "Head of Engineering", "Director of Operations"
   - ❌ "Enterprise", "SMB", "Startups", "Managers"
   - Infer from content: "compliance" → "Chief Compliance Officer", "deploy faster" → "VP of Engineering"

5. **KEY DIFFERENTIATORS (2-5 unique selling points):**
   - What makes them DIFFERENT from competitors?
   - Look for: "only", "first", "unlike", "better than", superlatives
   - Examples: "AI-Powered Automation", "Enterprise-Grade Security", "No-Code Interface", "Real-Time Analytics"

6. **USE CASES (3-6 applications):**
   - HOW do customers actually use the product?
   - Look for: "use cases", "solutions", "applications", customer stories
   - Examples: "Sales Pipeline Management", "Customer Onboarding", "Compliance Reporting", "API Integration"

7. **ROI CLAIMS:**
   - Extract any specific metrics: percentages, multipliers, time savings
   - Examples: "40% cost reduction", "3x faster deployment", "50% less manual work"
   - Return null if none found (don't invent them)

8. **Brand Voice:**
   - 2 adjectives describing tone (e.g. "Professional & Technical", "Bold & Developer-First")

9. **Competitors:**
   - Only if explicitly mentioned or strongly implied ("Alternative to X")

**OUTPUT:**
Return ONLY a JSON object matching the requested schema. Do not include markdown formatting.
`;

/**
 * Scrapes a website using Jina AI Reader and returns clean markdown content
 * Jina Reader handles JavaScript-rendered sites
 * Simply fetch https://r.jina.ai/{url} to get markdown
 */
async function scrapeWebsiteContent(url: string): Promise<string> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set. Get your free API key at https://jina.ai/reader/");
  }

  try {
    // Normalize URL (add protocol if missing)
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // Call Jina AI Reader - simply prepend the URL to their endpoint
    const jinaUrl = `${JINA_READER_URL}/${normalizedUrl}`;
    
    const response = await fetch(jinaUrl, {
      headers: {
        // Authentication
        "Authorization": `Bearer ${JINA_API_KEY}`,
        // Request plain text/markdown response
        "Accept": "text/plain",
        // Request more complete content extraction
        "X-With-Generated-Alt": "true",
      },
    });

    if (!response.ok) {
      console.error("Jina Reader error:", response.status, response.statusText);
      throw new Error(`Failed to fetch website: ${response.status} - ${response.statusText}`);
    }

    const markdown = await response.text();

    if (!markdown || markdown.trim().length < 50) {
      throw new Error("Could not extract meaningful content from the website");
    }

    // Log content length for debugging
    console.log(`Jina Reader returned ${markdown.length} characters from ${normalizedUrl}`);

    // Increase limit to 15000 characters to capture more content for better analysis
    return markdown.length > 15000 
      ? markdown.substring(0, 15000) + "\n\n[Content truncated...]" 
      : markdown;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to scrape website: ${error.message}`);
    }
    throw new Error("Failed to scrape website: Unknown error");
  }
}

/**
 * Maps AI-detected brand voice description to BRAND_VOICES options
 */
function mapBrandVoiceToOptions(brandVoiceDescription: string): string[] {
  const description = brandVoiceDescription.toLowerCase();
  const matchedVoices: string[] = [];

  // Map common descriptions to brand voices
  const mappings: Record<string, string[]> = {
    "professional": ["Professional", "Corporate", "Formal"],
    "authoritative": ["Authoritative", "Expert", "Trustworthy"],
    "technical": ["Technical", "Expert", "Professional"],
    "friendly": ["Friendly", "Approachable", "Warm"],
    "playful": ["Playful", "Fun", "Creative"],
    "innovative": ["Innovative", "Cutting-Edge", "Forward-Thinking"],
    "corporate": ["Corporate", "Professional", "Formal"],
    "casual": ["Casual", "Conversational", "Friendly"],
    "bold": ["Bold", "Disruptive", "Innovative"],
    "trustworthy": ["Trustworthy", "Reliable", "Transparent"],
    "data-driven": ["Data-Driven", "Analytical", "Results-Oriented"],
    "customer-centric": ["Customer-Centric", "Service-Oriented", "Helpful"],
  };

  // Check for matches
  for (const [key, voices] of Object.entries(mappings)) {
    if (description.includes(key)) {
      matchedVoices.push(...voices.filter((v) => !matchedVoices.includes(v)));
    }
  }

  // If no matches, try to find closest matches by checking individual brand voices
  if (matchedVoices.length === 0) {
    for (const voice of BRAND_VOICES) {
      if (description.includes(voice.toLowerCase())) {
        matchedVoices.push(voice);
      }
    }
  }

  // If still no matches, return common defaults
  if (matchedVoices.length === 0) {
    matchedVoices.push("Professional", "Customer-Centric");
  }

  // Return top 3 matches
  return matchedVoices.slice(0, 3);
}

// === Normalization helpers ===
function normalizeTitleCase(str: string): string {
  const acronyms = new Set([
    "CEO","CTO","CFO","CMO","COO","CIO","CISO","CPO","CDO",
    "VP","SVP","EVP","IT","HR","PR","ROI","KPI","AI","ML",
    "US","UK","EU","B2B","B2C","SaaS","API","UI","UX","QA"
  ]);

  return str
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      const upper = word.toUpperCase();
      if (acronyms.has(upper)) return upper;
      if (word.length <= 4 && word === upper && /^[A-Z]+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const cleaned = item.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function normalizePhrases(
  items: string[] | null | undefined,
  opts?: { max?: number; titleCase?: boolean; minWords?: number; maxWords?: number }
): string[] {
  const max = opts?.max ?? 10;
  const titleCase = opts?.titleCase ?? true;
  const minWords = opts?.minWords;
  const maxWords = opts?.maxWords;

  const cleaned = dedupeStrings(items ?? []).map(s => (titleCase ? normalizeTitleCase(s) : s));

  const filtered = cleaned.filter(s => {
    const words = s.split(/\s+/).filter(Boolean);
    if (minWords != null && words.length < minWords) return false;
    if (maxWords != null && words.length > maxWords) return false;
    return true;
  });

  return filtered.slice(0, max);
}

/**
 * Maps AI-detected industries to INDUSTRIES options
 */
function mapIndustriesToOptions(detectedIndustries: string[]): string[] {
  const matchedIndustries: string[] = [];

  // Extended alias map for common industry variations
  const aliasMap: Record<string, string> = {
    "saas": "Computer Software",
    "software": "Computer Software",
    "fintech": "Financial Services",
    "finance": "Financial Services",
    "banking": "Banking",
    "healthcare": "Hospital & Health Care",
    "health": "Health, Wellness & Fitness",
    "medical": "Medical Practice",
    "tech": "Information Technology & Services",
    "it": "Information Technology & Services",
    "technology": "Information Technology & Services",
    "marketing": "Marketing & Advertising",
    "advertising": "Marketing & Advertising",
    "e-commerce": "Internet",
    "ecommerce": "Internet",
    "online": "Internet",
    "retail": "Retail",
    "manufacturing": "Electrical/Electronic Manufacturing",
    "education": "Education Management",
    "edtech": "E-Learning",
    "e-learning": "E-Learning",
    "consulting": "Management Consulting",
    "professional services": "Management Consulting",
    "media": "Online Media",
    "entertainment": "Entertainment",
    "real estate": "Real Estate",
    "insurance": "Insurance",
    "legal": "Legal Services",
    "law": "Law Practice",
    "hr": "Human Resources",
    "human resources": "Human Resources",
    "recruiting": "Staffing & Recruiting",
    "logistics": "Logistics & Supply Chain",
    "supply chain": "Logistics & Supply Chain",
    "telecommunications": "Telecommunications",
    "telecom": "Telecommunications",
    "automotive": "Automotive",
    "construction": "Construction",
    "energy": "Oil & Energy",
    "utilities": "Utilities",
    "government": "Government Administration",
    "nonprofit": "Nonprofit Organization Management",
    "non-profit": "Nonprofit Organization Management",
  };

  for (const detected of detectedIndustries) {
    const normalized = detected.toLowerCase().trim();
    
    // Try exact match first
    const exactMatch = INDUSTRIES.find(
      (ind) => ind.toLowerCase() === normalized
    );
    if (exactMatch && !matchedIndustries.includes(exactMatch)) {
      matchedIndustries.push(exactMatch);
      continue;
    }

    // Try alias match
    let matched = false;
    for (const [alias, industry] of Object.entries(aliasMap)) {
      if (normalized.includes(alias) && !matchedIndustries.includes(industry)) {
        matchedIndustries.push(industry);
        matched = true;
        break;
      }
    }

    if (matched) continue;

    // Try partial match on INDUSTRIES list
    const firstToken = normalized.split(/\s+/)[0];
    if (!matchedIndustries.some(m => m.toLowerCase().includes(firstToken))) {
      const partialMatch = INDUSTRIES.find(
        (ind) => ind.toLowerCase().includes(normalized) || normalized.includes(ind.toLowerCase())
      );
      if (partialMatch && !matchedIndustries.includes(partialMatch)) {
        matchedIndustries.push(partialMatch);
      }
    }
  }

  return matchedIndustries.slice(0, 7); // Increased to max 7 industries
}

/**
 * Analyzes a website URL and extracts company profile information
 */
export async function detectProfileFromUrl(url: string): Promise<{
  // Form fields (mapped to existing options)
  targetIndustries: string[];
  brandVoice: string[];
  competitors: string[];
  // New strategic fields for asset analysis
  painClusters: string[];
  keyDifferentiators: string[];
  primaryICPRoles: string[];
  useCases: string[];
  roiClaims: string[];
  // Full detected info for display
  detectedInfo: WebsiteAnalysisResult;
}> {
  try {
    // Step 1: Scrape the website
    const websiteText = await scrapeWebsiteContent(url);

    if (!websiteText || websiteText.trim().length < 50) {
      throw new Error("Could not extract meaningful content from the website. The site may require JavaScript to load, or the content may be inaccessible.");
    }

    // Step 2: Analyze with OpenAI
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: WEBSITE_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: `Analyze this website content:\n\n${websiteText}` },
      ],
      response_format: zodResponseFormat(WebsiteAnalysisSchema, "website_analysis"),
      temperature: 0.2, // Keep it low for consistent analysis
    });

    const analysis = completion.choices[0].message.parsed;

    if (!analysis) {
      throw new Error("AI failed to generate structured analysis");
    }

    // Step 3: Map AI results to form fields
    const brandVoiceOptions = mapBrandVoiceToOptions(analysis.brandVoice);
    const industryOptions = mapIndustriesToOptions(analysis.targetIndustries);
    const competitors = analysis.competitors || [];

    return {
      // Mapped form fields
      targetIndustries: industryOptions,
      brandVoice: brandVoiceOptions,
      competitors,
      // New strategic fields (normalized for consistency)
      painClusters: normalizePhrases(analysis.painClusters, { max: 7, titleCase: true, minWords: 2, maxWords: 4 }),
      keyDifferentiators: normalizePhrases(analysis.keyDifferentiators, { max: 5, titleCase: true, minWords: 2, maxWords: 6 }),
      primaryICPRoles: normalizePhrases(analysis.primaryICPRoles, { max: 5, titleCase: true, minWords: 1, maxWords: 6 }),
      useCases: normalizePhrases(analysis.useCases, { max: 6, titleCase: true, minWords: 2, maxWords: 6 }),
      roiClaims: normalizePhrases(analysis.roiClaims ?? [], { max: 7, titleCase: false, minWords: 2, maxWords: 8 }),
      // Full analysis for reference
      detectedInfo: analysis,
    };
  } catch (error) {
    console.error("Error detecting profile from URL:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to analyze website: Unknown error");
  }
}

/**
 * Extracts brand context information from pasted text (e.g., brand guides, value proposition documents)
 * Reuses the same analysis logic as detectProfileFromUrl but accepts text directly
 */
export async function extractBrandContextFromText(text: string): Promise<{
  // Form fields (mapped to existing options)
  targetIndustries: string[];
  brandVoice: string[];
  competitors: string[];
  // New strategic fields for asset analysis
  painClusters: string[];
  keyDifferentiators: string[];
  primaryICPRoles: string[];
  useCases: string[];
  roiClaims: string[];
  // Full detected info for display
  detectedInfo: WebsiteAnalysisResult;
}> {
  try {
    // Validate input text
    const cleanedText = text.trim();
    
    if (!cleanedText || cleanedText.length < 50) {
      throw new Error("Text is too short. Please provide at least 50 characters of content to analyze.");
    }

    // Truncate very long text to avoid token limits (keep it reasonable for analysis)
    const textToAnalyze = cleanedText.length > 15000 
      ? cleanedText.substring(0, 15000) + "\n\n[Content truncated...]" 
      : cleanedText;

    // Analyze with OpenAI using the same prompt as website analysis
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { 
          role: "system", 
          content: WEBSITE_ANALYSIS_SYSTEM_PROMPT + "\n\nNOTE: The input text may be from brand guides, value proposition documents, company descriptions, or other marketing materials. Extract the same information as you would from a website."
        },
        { 
          role: "user", 
          content: `Analyze this company information:\n\n${textToAnalyze}` 
        },
      ],
      response_format: zodResponseFormat(WebsiteAnalysisSchema, "website_analysis"),
      temperature: 0.2, // Keep it low for consistent analysis
    });

    const analysis = completion.choices[0].message.parsed;

    if (!analysis) {
      throw new Error("AI failed to generate structured analysis");
    }

    // Map AI results to form fields (same logic as detectProfileFromUrl)
    const brandVoiceOptions = mapBrandVoiceToOptions(analysis.brandVoice);
    const industryOptions = mapIndustriesToOptions(analysis.targetIndustries);
    const competitors = analysis.competitors || [];

    return {
      // Mapped form fields
      targetIndustries: industryOptions,
      brandVoice: brandVoiceOptions,
      competitors,
      // New strategic fields (normalized for consistency)
      painClusters: normalizePhrases(analysis.painClusters, { max: 7, titleCase: true, minWords: 2, maxWords: 4 }),
      keyDifferentiators: normalizePhrases(analysis.keyDifferentiators, { max: 5, titleCase: true, minWords: 2, maxWords: 6 }),
      primaryICPRoles: normalizePhrases(analysis.primaryICPRoles, { max: 5, titleCase: true, minWords: 1, maxWords: 6 }),
      useCases: normalizePhrases(analysis.useCases, { max: 6, titleCase: true, minWords: 2, maxWords: 6 }),
      roiClaims: normalizePhrases(analysis.roiClaims ?? [], { max: 7, titleCase: false, minWords: 2, maxWords: 8 }),
      // Full analysis for reference
      detectedInfo: analysis,
    };
  } catch (error) {
    console.error("Error extracting brand context from text:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to extract brand context from text: Unknown error");
  }
}

// Product Line Analysis System Prompt
const PRODUCT_LINE_ANALYSIS_SYSTEM_PROMPT = `
You are an expert B2B Product Analyst. Your job is to extract product line information from text content.

**INPUT:**
You will receive text content describing a specific product line, product category, or product offering.

**CRITICAL EXTRACTION RULES:**

1. **Product Line Name:**
   - Extract the clear, canonical name of the product line or category
   - Should be a concise name (2-5 words)
   - Examples: "Cloud Services", "Consumer Electronics", "Enterprise Security Suite", "Residential Solar Solutions"

2. **Description:**
   - Provide a clear, concise description of what this product line is
   - Should be 2-4 sentences
   - Focus on what the product line includes and its purpose
   - Should be informative but not overly verbose

3. **Value Proposition:**
   - Extract or infer the specific value proposition for THIS product line
   - Format: "We help [Target] achieve [Outcome] by [Mechanism]."
   - This should be specific to the product line, not the general company value prop
   - If not explicitly stated, infer from the description

4. **Target Audience (Specific ICP):**
   - Identify who specifically buys THIS product line
   - Include: job titles/roles, company size, industry, key pain points
   - Be specific about the target audience for this particular product
   - Format as a clear, descriptive paragraph (2-4 sentences)

**OUTPUT:**
Return ONLY a JSON object matching the requested schema. Do not include markdown formatting.
`;

/**
 * Extracts product line information from pasted text (e.g., product descriptions, product sheets, marketing materials)
 */
export async function extractProductLineFromText(text: string): Promise<ProductLineAnalysisResult> {
  try {
    // Validate input text
    const cleanedText = text.trim();
    
    if (!cleanedText || cleanedText.length < 50) {
      throw new Error("Text is too short. Please provide at least 50 characters of content to analyze.");
    }

    // Truncate very long text to avoid token limits
    const textToAnalyze = cleanedText.length > 15000 
      ? cleanedText.substring(0, 15000) + "\n\n[Content truncated...]" 
      : cleanedText;

    // Analyze with OpenAI
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { 
          role: "system", 
          content: PRODUCT_LINE_ANALYSIS_SYSTEM_PROMPT
        },
        { 
          role: "user", 
          content: `Extract product line information from this text:\n\n${textToAnalyze}` 
        },
      ],
      response_format: zodResponseFormat(ProductLineAnalysisSchema, "product_line_analysis"),
      temperature: 0.2, // Keep it low for consistent analysis
    });

    const analysis = completion.choices[0].message.parsed;

    if (!analysis) {
      throw new Error("AI failed to generate structured analysis");
    }

    return analysis;
  } catch (error) {
    console.error("Error extracting product line from text:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to extract product line information from text: Unknown error");
  }
}

/**
 * Trending Topics Search Result Schema
 */
export const TrendingTopicsSchema = z.object({
  trendingTopics: z.array(z.string())
    .describe("3-7 trending topics identified from search results"),
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      content: z.string(),
      relevance: z.enum(["high", "medium", "low"]),
      sourceType: z.enum(["consulting", "industry_media", "research", "other"])
        .describe("Type of source: consulting firm, industry media, research organization, or other"),
      isReputable: z.boolean()
        .describe("Whether this is a reputable source (consulting firms, established industry media, research orgs)"),
    })
  ).max(5),
  insights: z.string()
    .describe("Strategic insights for content creation based on trending topics"),
  sourcesUsed: z.array(z.string())
    .describe("List of reputable source URLs that were used (excluding competitor blogs)"),
});

export type TrendingTopicsResult = z.infer<typeof TrendingTopicsSchema>;

/**
 * Searches for trending topics related to content suggestions using Jina AI Search
 * Returns top 5 results with processed content ready for LLM analysis
 */
export async function searchTrendingTopics(
  query: string,
  context?: {
    icp?: string;
    painCluster?: string;
    funnelStage?: string;
    industry?: string;
    valueProposition?: string;
    keyDifferentiators?: string[];
    useCases?: string[];
    painClusters?: string[]; // All pain clusters from brand identity
    competitors?: string[]; // Competitor names to exclude
  }
): Promise<TrendingTopicsResult> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set. Get your free API key at https://jina.ai/reader/");
  }

  try {
    // Build enhanced search query with context - prioritize pain clusters
    let searchQuery = query;
    if (context) {
      const contextParts: string[] = [];
      
      // Primary: Pain clusters (both specific and all from brand)
      if (context.painCluster) {
        contextParts.push(context.painCluster);
      }
      if (context.painClusters && context.painClusters.length > 0) {
        // Add other relevant pain clusters
        const otherPainClusters = context.painClusters
          .filter(pc => pc !== context.painCluster)
          .slice(0, 2); // Add up to 2 more pain clusters
        contextParts.push(...otherPainClusters);
      }
      
      // Secondary: ICP and industry context
      if (context.icp) contextParts.push(`for ${context.icp}`);
      if (context.industry) contextParts.push(`in ${context.industry}`);
      
      // Tertiary: Brand differentiators and use cases (if relevant)
      if (context.keyDifferentiators && context.keyDifferentiators.length > 0) {
        // Add top differentiator if it relates to the pain cluster
        const topDifferentiator = context.keyDifferentiators[0];
        if (topDifferentiator && topDifferentiator.length < 30) {
          contextParts.push(topDifferentiator);
        }
      }
      
      if (contextParts.length > 0) {
        searchQuery = `${query} ${contextParts.join(" ")}`;
      }
    }

    // Call Jina Search API - returns top 5 results
    const jinaSearchUrl = `${JINA_SEARCH_URL}/${encodeURIComponent(searchQuery)}`;
    
    const response = await fetch(jinaSearchUrl, {
      headers: {
        "Authorization": `Bearer ${JINA_API_KEY}`,
        "Accept": "text/plain",
        "X-With-Generated-Alt": "true",
      },
    });

    if (!response.ok) {
      console.error("Jina Search error:", response.status, response.statusText);
      // Return empty result instead of throwing - trending topics are optional
      return {
        results: [],
        trendingTopics: [],
        insights: "Trending topics discovery unavailable. Proceeding without trending context.",
        sourcesUsed: [],
      };
    }

    // Jina Search returns a combined markdown of top 5 results
    const markdown = await response.text();

    if (!markdown || markdown.trim().length < 50) {
      return {
        results: [],
        trendingTopics: [],
        insights: "No trending topics found for this query.",
        sourcesUsed: [],
      };
    }

    // Parse the results and extract insights using OpenAI
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content: `You are a B2B Content Strategist analyzing search results to identify trending topics and insights.

🔴 CRITICAL SOURCE FILTERING RULES:
1. **EXCLUDE competitor blogs** - Never use content from: ${context?.competitors?.join(", ") || "competitor websites"}
2. **PRIORITIZE reputable sources**:
   - Consulting firms (McKinsey, Deloitte, PwC, Gartner, Forrester, BCG, etc.)
   - Established industry media (Harvard Business Review, MIT Technology Review, industry publications)
   - Research organizations (IDC, Gartner, Forrester, academic institutions)
   - Government sources (when relevant)
3. **AVOID**: Competitor blogs, vendor marketing content, unverified sources
4. **Source credibility matters** - Only cite sources that add credibility

Extract from the search results:
1. Key trending topics (3-7 topics) - specific, actionable topics currently being discussed
2. Relevance assessment for each result (high/medium/low)
3. Source type classification (consulting, industry_media, research, other)
4. Reputability assessment (true for consulting firms, established media, research orgs)
5. Strategic insights for content creation based on trending topics
6. List of reputable sources used (URLs only, excluding competitor blogs)

Focus on:
- Topics that relate to solving pain clusters (especially: ${context?.painCluster || "the identified pain cluster"})
- Topics that align with B2B content strategy and the organization's value proposition
- Current industry conversations about solving these specific problems
- Actionable insights for content creators
- How trending topics connect to pain cluster solutions
- Avoid generic or overly broad topics

Return structured data matching the schema.`,
        },
        {
          role: "user",
          content: `Analyze these search results for trending topics related to: "${query}"

Context:
${context ? `
- ICP: ${context.icp || "Not specified"}
- Primary Pain Cluster: ${context.painCluster || "Not specified"}
- All Pain Clusters: ${context.painClusters?.join(", ") || "Not specified"}
- Industry: ${context.industry || "Not specified"}
- Value Proposition: ${context.valueProposition || "Not specified"}
- Key Differentiators: ${context.keyDifferentiators?.join(", ") || "Not specified"}
- Use Cases: ${context.useCases?.join(", ") || "Not specified"}
- Competitors to EXCLUDE: ${context.competitors?.join(", ") || "None specified"}
` : "No additional context"}

🔴 CRITICAL: 
- EXCLUDE any results from competitor websites: ${context?.competitors?.join(", ") || "None"}
- PRIORITIZE reputable sources (consulting firms, industry media, research organizations)
- Only include sources that add credibility to the content

Focus on finding trending topics that:
1. Relate to solving the pain cluster(s): ${context?.painCluster || context?.painClusters?.join(", ") || "Not specified"}
2. Connect to the organization's value proposition and differentiators
3. Show current industry conversations about these problems
4. Come from reputable, credible sources

Search Results:
${markdown.substring(0, 10000)}`,
        },
      ],
      response_format: zodResponseFormat(TrendingTopicsSchema, "trending_topics"),
      temperature: 0.3,
    });

    const analysis = completion.choices[0].message.parsed;

    if (!analysis) {
      throw new Error("AI failed to analyze trending topics");
    }

    // Post-process: ensure sourcesUsed reflects reputable sources, and remove likely competitor results
    const competitorTerms = (context?.competitors ?? [])
      .map(c => c.toLowerCase().trim())
      .filter(Boolean);

    const filteredResults = (analysis.results ?? []).filter(r => {
      const haystack = `${r.url} ${r.title} ${r.content}`.toLowerCase();
      if (competitorTerms.some(t => t && haystack.includes(t))) return false;
      return true;
    });

    const sourcesUsed = dedupeStrings(
      filteredResults.filter(r => r.isReputable).map(r => r.url)
    );

    return {
      ...analysis,
      results: filteredResults,
      sourcesUsed,
    };
  } catch (error) {
    console.error("Error searching trending topics:", error);
    // Return empty result instead of throwing - trending topics are optional
    return {
      results: [],
      trendingTopics: [],
      insights: error instanceof Error 
        ? `Trending topics discovery failed: ${error.message}` 
        : "Trending topics discovery unavailable.",
      sourcesUsed: [],
    };
  }
}
