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
 * Helper function to extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    // If URL parsing fails, try to extract manually
    const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
    return match ? match[1] : url;
  }
}

/**
 * Helper function to extract published date from content or URL
 */
function extractPublishedDate(url: string, content: string): string | null {
  // Try to extract from URL first (common patterns: /2024/01/, /2024-01-15/, etc.)
  const urlDateMatch = url.match(/\/(\d{4})[\/\-](\d{1,2})[\/\-]?(\d{1,2})?/);
  if (urlDateMatch) {
    const year = parseInt(urlDateMatch[1], 10);
    const month = parseInt(urlDateMatch[2], 10) || 1;
    const day = parseInt(urlDateMatch[3], 10) || 1;
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime()) && date <= new Date()) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // Try to extract from content (look for "Published:", "Date:", etc.)
  const contentDateMatch = content.match(/(?:published|date|updated)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i) ||
                            content.match(/(\d{4}-\d{2}-\d{2})/) ||
                            content.match(/([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
  
  if (contentDateMatch) {
    try {
      const date = new Date(contentDateMatch[1] || contentDateMatch[0]);
      if (!isNaN(date.getTime()) && date <= new Date()) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // Ignore parsing errors
    }
  }
  
  return null;
}

/**
 * Helper function to determine why source is reputable
 */
function getWhyReputable(url: string, sourceType: string): string {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('sap.com') || urlLower.includes('oracle.com') || urlLower.includes('microsoft.com')) {
    return "Primary vendor documentation - authoritative source";
  }
  if (urlLower.includes('mckinsey') || urlLower.includes('deloitte') || urlLower.includes('pwc') || urlLower.includes('bcg') || urlLower.includes('bain') || urlLower.includes('accenture') || urlLower.includes('kyndryl')) {
    return "Major consulting firm - credible research and insights";
  }
  if (urlLower.includes('gartner') || urlLower.includes('forrester') || urlLower.includes('idc')) {
    return "Established research organization - industry analysis";
  }
  if (urlLower.includes('.edu') || urlLower.includes('mit.edu') || urlLower.includes('harvard.edu')) {
    return "Academic institution - peer-reviewed research";
  }
  if (sourceType === "industry_media") {
    return "Established industry publication - credible journalism";
  }
  return "Credible source in the industry";
}

/**
 * Trending Topics Search Result Schema
 */
export const TrendingTopicsSchema = z.object({
  trendingTopics: z.array(z.string())
    .describe("5-8 trending topics identified from search results, each must be traceable to at least one source"),
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      content: z.string(),
      relevance: z.enum(["high", "medium", "low"])
        .describe("Relevance to the company's industry, pain clusters, and brand identity. MUST be 'low' if source doesn't relate to company's business."),
      sourceType: z.enum(["consulting", "industry_media", "research", "other"])
        .describe("Type of source: consulting firm, industry media, research organization, or other"),
      isReputable: z.boolean()
        .describe("Whether this is a reputable source (consulting firms, established industry media, research orgs). NOTE: reputable ≠ relevant. Mark as 'low' relevance if reputable but not relevant."),
      publisher: z.string().nullable().optional()
        .describe("Publisher/domain name extracted from URL (e.g., 'sap.com', 'mckinsey.com')"),
      publishedDate: z.string().nullable().optional()
        .describe("Publication date in ISO format (YYYY-MM-DD) if extractable, null otherwise"),
      excerpt: z.string().nullable().optional()
        .describe("Short excerpt (<= 500 chars) from the content that supports why this source is relevant"),
      whyReputable: z.string().nullable().optional()
        .describe("Short explanation of why this source is reputable (e.g., 'Major consulting firm - credible research')"),
      whyRelevant: z.string().nullable().optional()
        .describe("Short explanation of why this source is relevant to the ICP and pain cluster (e.g., 'CFO-credible source that quantifies financial exposure')"),
    })
  ).min(3).max(5),
  insights: z.string()
    .describe("Strategic insights for content creation based on trending topics"),
  sourcesUsed: z.array(z.string())
    .describe("List of reputable source URLs that were used (excluding competitor blogs)"),
});

// Extended type that includes generated IDs
export type TrendingTopicsResult = z.infer<typeof TrendingTopicsSchema> & {
  results: Array<z.infer<typeof TrendingTopicsSchema>["results"][0] & { id: string }>;
  sourceCountWarning?: string;
  _apiWarnings?: Array<{ type: string; message: string; api: string }>;
};


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
    // Complete brand identity context
    brandVoice?: string;
    primaryICPRoles?: string[];
    targetIndustries?: string[];
    valueProposition?: string;
    roiClaims?: string[];
    keyDifferentiators?: string[];
    useCases?: string[];
    painClusters?: string[]; // All pain clusters from brand identity
    competitors?: string[]; // Competitor names to exclude
    websiteUrl?: string; // Company's own website URL to exclude
    // Product line context
    productLineName?: string;
    productLineDescription?: string;
    productLineValueProp?: string;
    productLineICPs?: string[];
  }
): Promise<TrendingTopicsResult> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set. Get your free API key at https://jina.ai/reader/");
  }

  try {
    // Build enhanced search query with context - use ALL brand identity fields for maximum specificity
    // The base query from generate-ideas should already include brand identity terms
    // Here we just ensure Jina gets additional context for better relevance
    let searchQuery = query;
    
    // Note: The search query construction in generate-ideas/route.ts now uses ALL brand identity fields
    // This function primarily adds additional context terms if needed, but the main query should already be comprehensive
    if (context) {
      const contextParts: string[] = [];
      
      // Only add context if the base query seems incomplete (less than 3 terms)
      const baseQueryTerms = query.split(/\s+/).filter(t => t.length > 0);
      if (baseQueryTerms.length < 3) {
        // Add product line context if available (most specific)
        if (context.productLineName) {
          contextParts.push(context.productLineName);
        }
        
        // Add use cases if base query doesn't include them
        if (context.useCases && context.useCases.length > 0 && !query.toLowerCase().includes(context.useCases[0].toLowerCase().substring(0, 10))) {
          const topUseCase = context.useCases[0];
          const useCaseTerms = topUseCase
            .split(/[\s,\-\(\)]+/)
            .filter(word => word.length > 5 && !['management', 'solutions', 'services', 'platform', 'system'].includes(word.toLowerCase()))
            .slice(0, 1);
          if (useCaseTerms.length > 0) {
            contextParts.push(...useCaseTerms);
          }
        }
        
        // Add industry as fallback if still needed
        if (context.industry && contextParts.length < 2) {
          const industryTerms = context.industry
            .split(/[,\s&]/)
            .filter(term => term.length > 3)
            .slice(0, 1);
          contextParts.push(...industryTerms);
        }
      }
      
      if (contextParts.length > 0) {
        searchQuery = `${query} ${contextParts.join(" ")}`;
      }
    }

    // Call Jina Search API - returns top 5 results as JSON with proper URLs
    const jinaSearchUrl = `${JINA_SEARCH_URL}/${encodeURIComponent(searchQuery)}`;
    console.log(`[Jina Search] Calling Jina API: ${jinaSearchUrl.substring(0, 80)}...`);
    
    const response = await fetch(jinaSearchUrl, {
      headers: {
        "Authorization": `Bearer ${JINA_API_KEY}`,
        "Accept": "application/json", // Use JSON format for reliable URL extraction
        "X-With-Generated-Alt": "true",
      },
    });

    console.log(`[Jina Search] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Jina Search] ERROR: ${response.status} ${response.statusText}`);
      console.error(`[Jina Search] Error response: ${errorText.substring(0, 500)}`);
      
      const warnings: Array<{ type: string; message: string; api: string }> = [];
      
      // Add admin warnings for specific error codes
      if (response.status === 401 || response.status === 403) {
        warnings.push({
          type: "auth",
          message: "Jina API authentication failed. Check JINA_API_KEY credentials.",
          api: "Jina"
        });
      } else if (response.status === 429) {
        warnings.push({
          type: "rate_limit",
          message: "Jina API rate limit exceeded. Trending topics discovery unavailable.",
          api: "Jina"
        });
      } else {
        warnings.push({
          type: "error",
          message: `Jina API error (${response.status}): ${response.statusText}. Trending topics discovery unavailable.`,
          api: "Jina"
        });
      }
      
      // Return empty result instead of throwing - trending topics are optional
      return {
        results: [],
        trendingTopics: [],
        insights: "Trending topics discovery unavailable. Proceeding without trending context.",
        sourcesUsed: [],
        _apiWarnings: warnings,
      };
    }

    // Parse Jina JSON response - contains data array with url, title, content
    let jinaResponse: any;
    try {
      jinaResponse = await response.json();
      console.log(`[Jina Search] Response structure keys:`, Object.keys(jinaResponse));
      console.log(`[Jina Search] Response structure:`, JSON.stringify(jinaResponse).substring(0, 1000));
    } catch (parseError) {
      const responseText = await response.text();
      console.error(`[Jina Search] Failed to parse JSON response:`, parseError);
      console.error(`[Jina Search] Raw response (first 1000 chars):`, responseText.substring(0, 1000));
      
      const warnings: Array<{ type: string; message: string; api: string }> = [{
        type: "error",
        message: `Jina Search API returned invalid response. Response status: ${response.status}`,
        api: "Jina"
      }];
      
      return {
        results: [],
        trendingTopics: [],
        insights: "Failed to parse Jina Search API response.",
        sourcesUsed: [],
        _apiWarnings: warnings,
      };
    }
    
    // Extract search results from Jina JSON response
    // Jina Search API returns results in different possible structures
    // Response structure: { data: [{ title, url, content, publishedTime, ... }] }
    let jinaResults: Array<{ url: string; title: string; content: string; publishedTime?: string; date?: string }> = [];
    
    // Check for error response
    if (jinaResponse.code && jinaResponse.code !== 200) {
      console.error(`[Jina Search] API error response:`, jinaResponse);
      const warnings: Array<{ type: string; message: string; api: string }> = [{
        type: "error",
        message: jinaResponse.message || `Jina Search API error: ${jinaResponse.code}`,
        api: "Jina"
      }];
      
      return {
        results: [],
        trendingTopics: [],
        insights: jinaResponse.readableMessage || jinaResponse.message || "Jina Search API error.",
        sourcesUsed: [],
        _apiWarnings: warnings,
      };
    }
    
    // Try different response structures
    if (jinaResponse.data && Array.isArray(jinaResponse.data) && jinaResponse.data.length > 0) {
      jinaResults = jinaResponse.data;
      console.log(`[Jina Search] Found results in 'data' array: ${jinaResults.length} items`);
    } else if (jinaResponse.data && typeof jinaResponse.data === 'object' && Array.isArray(jinaResponse.data.data)) {
      // Nested data structure
      jinaResults = jinaResponse.data.data;
      console.log(`[Jina Search] Found results in 'data.data' array: ${jinaResults.length} items`);
    } else if (jinaResponse.results && Array.isArray(jinaResponse.results) && jinaResponse.results.length > 0) {
      jinaResults = jinaResponse.results;
      console.log(`[Jina Search] Found results in 'results' array: ${jinaResults.length} items`);
    } else if (Array.isArray(jinaResponse) && jinaResponse.length > 0) {
      jinaResults = jinaResponse;
      console.log(`[Jina Search] Found results as root array: ${jinaResults.length} items`);
    } else if (jinaResponse.data === null && jinaResponse.code) {
      // This is an error response (e.g., authentication failed)
      console.error(`[Jina Search] API returned error:`, jinaResponse);
      const warnings: Array<{ type: string; message: string; api: string }> = [{
        type: "error",
        message: jinaResponse.readableMessage || jinaResponse.message || `Jina Search API error (${jinaResponse.code})`,
        api: "Jina"
      }];
      
      return {
        results: [],
        trendingTopics: [],
        insights: jinaResponse.readableMessage || jinaResponse.message || "Jina Search API authentication or configuration error.",
        sourcesUsed: [],
        _apiWarnings: warnings,
      };
    }
    
    console.log(`[Jina Search] Extracted ${jinaResults.length} results from response`);
    
    if (!jinaResults || jinaResults.length === 0) {
      console.warn(`[Jina Search] No results found. Full response structure:`, JSON.stringify(jinaResponse).substring(0, 2000));
      
      const warnings: Array<{ type: string; message: string; api: string }> = [{
        type: "error",
        message: "Jina Search API returned no results. This might be due to query specificity or API configuration.",
        api: "Jina"
      }];
      
      return {
        results: [],
        trendingTopics: [],
        insights: "No trending topics found for this query. Try a more general search or check API configuration.",
        sourcesUsed: [],
        _apiWarnings: warnings,
      };
    }

    // Calculate date cutoff (6 months ago - STRICT REQUIREMENT)
    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const cutoffDateStr = sixMonthsAgo.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Log search results for debugging
    console.log(`[Jina Search] Initial results: ${jinaResults.length} with URLs:`, 
      jinaResults.map(r => ({ url: r.url, title: r.title }))
    );

    // Extract dates from URLs and filter out old sources BEFORE analysis
    // Normalize results to ensure we have url, title, content
    const preFilteredResults: Array<{ url: string; title: string; content: string; publishedTime?: string }> = [];
    
    for (const result of jinaResults) {
      // Normalize result - ensure we have required fields
      if (!result.url || !result.title) {
        console.log(`[Jina Search] Skipping result missing url or title:`, result);
        continue;
      }
      
      // Extract publishedTime from Jina response if available (ISO format: "2025-09-12T07:34:29+00:00")
      let publishedDate: Date | null = null;
      if (result.publishedTime) {
        try {
          publishedDate = new Date(result.publishedTime);
          if (isNaN(publishedDate.getTime())) {
            publishedDate = null;
          }
        } catch (e) {
          console.log(`[Jina Search] Could not parse publishedTime: ${result.publishedTime}`);
        }
      }
      
      // Extract year from URL (common patterns: /2024/, /2020/07/, /2009/, etc.)
      const urlYearMatch = result.url.match(/\/(\d{4})\//);
      const urlYear = urlYearMatch ? parseInt(urlYearMatch[1], 10) : null;
      
      // Extract date from content (look for "Published:", "Date:", year patterns)
      const contentYearMatch = result.content?.match(/(?:published|date|updated)[:\s]+(\d{4})/i) || 
                               result.content?.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(\d{4})/i) ||
                               result.content?.match(/\b(20\d{2})\b/);
      const contentYear = contentYearMatch ? parseInt(contentYearMatch[1] || contentYearMatch[0], 10) : null;
      
      // Use publishedTime if available (most accurate), otherwise use year from URL/content
      let sourceYear: number | null = null;
      if (publishedDate && !isNaN(publishedDate.getTime())) {
        sourceYear = publishedDate.getFullYear();
      } else {
        sourceYear = urlYear && contentYear 
          ? Math.max(urlYear, contentYear) 
          : (urlYear || contentYear);
      }
      
      // DATE FILTERING: Only reject if clearly older than 6 months
      // Use publishedTime if available for precise date checking, otherwise use year-based filtering
      if (publishedDate && !isNaN(publishedDate.getTime())) {
        // Use precise date from publishedTime - reject if older than 6 months
        if (publishedDate < sixMonthsAgo) {
          console.log(`[Jina Search] REJECTED - Published date too old: ${result.title} (${publishedDate.toISOString().substring(0, 10)})`);
          continue;
        }
        console.log(`[Jina Search] ALLOWING - Published date is recent: ${result.title} (${publishedDate.toISOString().substring(0, 10)})`);
      } else if (sourceYear) {
        // Fall back to year-based filtering if no precise date available
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-11
        
        // Reject sources from years clearly too old (more than 2 years in the past)
        if (sourceYear < currentYear - 2) {
          console.log(`[Jina Search] REJECTED - Year is too old: ${result.title} (${sourceYear})`);
          continue; // Skip this source
        }
        
        // For sources from last year or current year: be lenient and allow through
        // We'll do more precise filtering in the second pass if we have explicit dates
        if (sourceYear === currentYear - 1 || sourceYear === currentYear) {
          console.log(`[Jina Search] ALLOWING - Year is recent: ${result.title} (${sourceYear})`);
        }
        
        // Reject invalid years (future more than 1 year ahead or very old)
        if (sourceYear > currentYear + 1 || sourceYear < 2010) {
          console.log(`[Jina Search] REJECTED - Invalid year: ${result.title} (${sourceYear})`);
          continue;
        }
      }
      
      // Additional check: Look for explicit dates in content (more precise)
      const explicitDateMatch = result.content?.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(\d{4})/i);
      if (explicitDateMatch) {
        try {
          const explicitDate = new Date(explicitDateMatch[0]);
          if (!isNaN(explicitDate.getTime())) {
            // Only reject if the explicit date is clearly older than 6 months
            if (explicitDate < sixMonthsAgo) {
              console.log(`[Jina Search] REJECTED - Explicit date too old: ${result.title} (${explicitDateMatch[0]})`);
              continue;
            }
          }
        } catch (e) {
          // If date parsing fails, be lenient and allow through
          console.log(`[Jina Search] Could not parse explicit date, allowing source: ${result.title}`);
        }
      }
      
      // DOMAIN FILTERING: Exclude .gov and .edu domains unless explicitly relevant to brand context
      const urlLower = result.url.toLowerCase();
      const isGovernmentDomain = urlLower.includes('.gov') || urlLower.includes('.gov.au') || urlLower.includes('.gov.uk') || urlLower.includes('government');
      const isEducationDomain = urlLower.includes('.edu') || urlLower.includes('.edu.au') || urlLower.includes('.ac.uk') || urlLower.includes('university') || urlLower.includes('college');
      
      if (isGovernmentDomain || isEducationDomain) {
        // Only allow if the content explicitly mentions relevant brand identity terms
        const contentLower = (result.content || result.title || "").toLowerCase();
        const hasRelevantTerms = 
          (context?.painCluster && contentLower.includes(context.painCluster.toLowerCase())) ||
          (context?.productLineName && contentLower.includes(context.productLineName.toLowerCase())) ||
          (context?.useCases && context.useCases.some(uc => contentLower.includes(uc.toLowerCase().substring(0, 15)))) ||
          (context?.targetIndustries && context.targetIndustries.some(ind => contentLower.includes(ind.toLowerCase()))) ||
          (context?.keyDifferentiators && context.keyDifferentiators.some(kd => {
            const terms = kd.toLowerCase().split(/\s+/).filter(t => t.length > 4);
            return terms.some(t => contentLower.includes(t));
          }));
        
        if (!hasRelevantTerms) {
          console.log(`[Jina Search] REJECTED - Government/Education domain without relevant brand context: ${result.title} (${result.url})`);
          continue; // Skip this source
        }
        console.log(`[Jina Search] ALLOWING - Government/Education domain with relevant context: ${result.title}`);
      }
      
      // If no date information found, allow the source through (let AI determine if it's relevant)
      // Include publishedTime in the result for later use
      preFilteredResults.push({
        url: result.url,
        title: result.title,
        content: result.content || "",
        publishedTime: result.publishedTime,
      });
    }

    console.log(`[Jina Search] Pre-filtered ${jinaResults.length} results to ${preFilteredResults.length} (removed ${jinaResults.length - preFilteredResults.length} outdated sources)`);

    // Build structured data to pass to OpenAI for analysis (using pre-filtered results)
    const searchResultsForAnalysis = preFilteredResults.slice(0, 10).map((r, idx) => 
      `RESULT ${idx + 1}:
- URL: ${r.url}
- Title: ${r.title}
- Content: ${r.content?.substring(0, 1500) || "No content available"}
---`
    ).join("\n\n");

    // Parse the results and extract insights using OpenAI
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content: `You are a B2B Content Strategist analyzing search results to identify trending topics and insights.

🔴 CRITICAL DATE REQUIREMENT - ABSOLUTE PRIORITY:
- Today's date: ${todayStr}
- Maximum acceptable source age: ${cutoffDateStr} (6 months ago)
- **MANDATORY**: Do NOT include ANY source older than ${cutoffDateStr} in your results
- If a URL contains /2020/, /2016/, /2009/, or similar old years, it is AUTOMATICALLY REJECTED
- If content mentions publication dates older than 6 months, REJECT the source
- Only include sources that are CURRENT (within 6 months of ${todayStr})

🔴 CRITICAL: UNDERSTAND COMPLETE BRAND IDENTITY CONTEXT
Before analyzing sources, you MUST understand the complete brand identity:

COMPANY BRAND IDENTITY (CRITICAL CONTEXT):
${context?.brandVoice ? `- Brand Voice: ${context.brandVoice}` : ""}
${context?.primaryICPRoles && context.primaryICPRoles.length > 0 ? `- Primary ICP Roles: ${context.primaryICPRoles.join(", ")}` : ""}
${context?.targetIndustries && context.targetIndustries.length > 0 ? `- Target Industries: ${context.targetIndustries.join(", ")}` : ""}
${context?.industry ? `- Primary Industry: ${context.industry}` : ""}
${context?.valueProposition ? `- Value Proposition: ${context.valueProposition}` : ""}
${context?.roiClaims && context.roiClaims.length > 0 ? `- ROI Claims: ${context.roiClaims.join(", ")}` : ""}
${context?.keyDifferentiators && context.keyDifferentiators.length > 0 ? `- Key Differentiators: ${context.keyDifferentiators.join(", ")}` : ""}
${context?.useCases && context.useCases.length > 0 ? `- Use Cases: ${context.useCases.join(", ")}` : ""}
${context?.painClusters && context.painClusters.length > 0 ? `- All Pain Clusters: ${context.painClusters.join(", ")}` : ""}
${context?.painCluster ? `- Primary Pain Cluster: ${context.painCluster}` : ""}
${context?.competitors && context.competitors.length > 0 ? `- Competitors (EXCLUDE): ${context.competitors.join(", ")}` : ""}
${context?.productLineName ? `
PRODUCT LINE CONTEXT (MOST SPECIFIC):
- Product Line Name: ${context.productLineName}
${context.productLineDescription ? `- Description: ${context.productLineDescription}` : ""}
${context.productLineValueProp ? `- Value Proposition: ${context.productLineValueProp}` : ""}
${context.productLineICPs && context.productLineICPs.length > 0 ? `- Target ICPs: ${context.productLineICPs.join(", ")}` : ""}
` : ""}

🔴 CRITICAL: USE ALL BRAND IDENTITY INFORMATION
You MUST consider ALL of the above brand identity information when:
1. Determining source relevance
2. Identifying trending topics
3. Assessing if topics align with the company
4. Filtering sources that don't match the company's context

🔴 CRITICAL SOURCE FILTERING RULES:
1. **EXCLUDE competitor blogs** - Never use content from: ${context?.competitors?.join(", ") || "competitor websites"}
2. **EXCLUDE company's own website** - Never use content from: ${context?.websiteUrl ? context.websiteUrl : "the company's own domain"} (you cannot source yourself as a source)
3. **STRICT DATE REQUIREMENT - 6 MONTHS MAXIMUM**:
   - TODAY'S DATE: ${todayStr}
   - CUTOFF DATE: ${cutoffDateStr} (6 months ago)
   - **MANDATORY**: REJECT ANY source with a date older than ${cutoffDateStr}
   - Check URLs for year patterns (e.g., /2020/, /2016/, /2009/)
   - Check content for publication dates, "Published:", "Date:" patterns
   - **If a source shows a year before ${sixMonthsAgo.getFullYear()} OR a specific date before ${cutoffDateStr}, MARK IT AS "low" relevance and EXCLUDE it**
   - Only accept sources from ${sixMonthsAgo.getFullYear()} or later (and only if within 6 months of today)
3. **EXCLUDE Government (.gov) and Education (.edu) domains UNLESS explicitly relevant**:
   - Sources from .gov, .edu, .gov.au, .edu.au, .ac.uk, etc. should be EXCLUDED unless:
     * The content explicitly mentions: ${context?.painCluster || "the pain cluster"}, ${context?.productLineName || "the product line"}, or ${context?.useCases?.[0]?.substring(0, 30) || "use cases"}
     * The source is specifically about the industry: ${context?.targetIndustries?.join(", ") || context?.industry || "target industry"}
     * The source directly relates to the value proposition or differentiators
   - If a .gov/.edu source doesn't explicitly match brand identity context, EXCLUDE it or mark as "low" relevance
4. **PRIORITIZE reputable sources** (but ONLY if recent AND relevant):
   - Consulting firms (McKinsey, Deloitte, PwC, Gartner, Forrester, BCG, etc.) - **ONLY if published within 6 months AND relevant to brand identity**
   - Established industry media - **ONLY if published within 6 months AND relevant to brand identity**
   - Research organizations - **ONLY if published within 6 months AND relevant to brand identity**
   - Primary vendor documentation (e.g., SAP.com for SAP topics) - **ONLY if relevant to product line/pain clusters**
5. **AVOID**: Competitor blogs, vendor marketing content, unverified sources, **ANY source older than 6 months**, **Government/Education domains that don't match brand identity context**
6. **Source must match ALL THREE**: Credibility + Recency + Relevance to brand identity

🔴 CRITICAL URL HANDLING:
- Each search result includes a URL field - you MUST use the EXACT URL provided
- Do NOT modify, shorten, or invent URLs
- Copy the URL exactly as shown in each search result

Extract from the search results:
1. **TRENDING TOPICS FIRST** (5-8 topics) - Identify specific, actionable topics currently being discussed that relate to:
   - The GAP CONTEXT: ${context?.icp || "target ICP"} at ${context?.funnelStage || "funnel stage"} facing ${context?.painCluster || "the pain cluster"}
   - The BRAND IDENTITY: ${context?.targetIndustries?.join(", ") || context?.industry || "target industries"}, ${context?.productLineName || "product line"}, ${context?.useCases?.join(", ") || "use cases"}
   - Each trending topic MUST be traceable to at least one source in the results

2. **GAP-SPECIFIC SOURCE RECOMMENDATIONS** (3-5 sources minimum):
   **CRITICAL: Each source MUST match ALL THREE criteria:**
   - ✅ **Brand Identity Match**: Relevant to ${context?.targetIndustries?.join(", ") || context?.industry || "target industries"}, ${context?.productLineName || "product line"}, ${context?.useCases?.join(", ") || "use cases"}, ${context?.painClusters?.join(", ") || context?.painCluster || "pain clusters"}
   - ✅ **Trending Topic Support**: The source content MUST support at least ONE of the trending topics you identified above. The source should provide evidence, data, or insights related to that trending topic.
   - ✅ **Gap Context Alignment**: The source must be relevant to ${context?.icp || "the target ICP"} at ${context?.funnelStage || "the funnel stage"} facing ${context?.painCluster || "the pain cluster"}. For TOFU awareness gaps, sources should focus on awareness/education content, not technical implementation.

   For each source, provide:
   - Use the EXACT URL from the search result
   - Use the EXACT title from the search result
   - **Publisher**: Extract domain/publisher from URL (e.g., "sap.com", "mckinsey.com")
   - **Published Date**: Extract publication date in ISO format (YYYY-MM-DD) if available in URL or content, otherwise null
   - **Excerpt**: Short excerpt (<= 500 chars) from the content that shows why this source is relevant
   - **Why Reputable**: Short explanation of why this source is reputable (e.g., "Major consulting firm - credible research", "Primary vendor documentation - authoritative source")
   - **Why Relevant**: Short explanation that ties ALL THREE together:
     * How it relates to ${context?.icp || "the target ICP"} and ${context?.painCluster || "the pain cluster"}
     * How it supports the trending topic(s) it's linked to
     * Why it's appropriate for ${context?.funnelStage || "the funnel stage"} gap context
     * Example: "CFO-credible source at TOFU awareness stage that quantifies financial exposure for brownfield migration, supporting the trending topic on cost overrun risks"
   - **DATE CHECK (MANDATORY FIRST STEP)**:
     * Extract the year/date from the URL (look for /YYYY/ patterns) or content
     * If the date is older than ${cutoffDateStr}, **MARK AS "low" relevance AND EXCLUDE from final results**
     * If date is missing but content looks old (mentions years like 2009, 2016, 2020 in a publication context), **MARK AS "low" AND EXCLUDE**
   - Relevance assessment (high/medium/low) - CRITICAL: 
     * Mark as "high" if source matches all three: brand identity + trending topic + gap context
     * Mark as "medium" if source matches brand identity and gap context but only weakly supports trending topics
     * Mark as "low" if source doesn't match brand identity, doesn't support trending topics, or doesn't align with gap context - EXCLUDE these
   - Source type classification (consulting, industry_media, research, other)
   - Reputability assessment (true for consulting firms, established media, research orgs) - NOTE: Reputable ≠ Relevant ≠ Recent. A .gov source from 2009 about education grants is NOT acceptable

3. **TRENDING TOPICS WITH ICP FRAMING** (must be traceable to sources):
   For each trending topic, provide:
   - The topic/trend (must be specific to the gap context and brand identity)
   - **Angle**: How to frame this for ${context?.icp || "the target ICP"} at ${context?.funnelStage || "funnel stage"} (e.g., for TOFU awareness: "The migration decision is no longer a tech roadmap issue. It is a predictable cost and risk exposure with a date attached.")
   - **Why it trends**: Why this is currently being discussed in ${context?.targetIndustries?.join(" or ") || context?.industry || "the industry"}
   - **Evidence hook**: Specific citation or data point from the sources above that supports this trend
   - **Source connection**: Which source(s) from your results provide evidence for this trending topic

4. Strategic insights for content creation based on:
   - Trending topics identified
   - Brand identity alignment
   - Gap context (${context?.icp || "ICP"} + ${context?.funnelStage || "stage"} + ${context?.painCluster || "pain cluster"})

5. List of reputable, recent sources used (URLs only, excluding competitor blogs, irrelevant sources, AND sources older than 6 months)

🔴 CRITICAL RELEVANCE SCORING:
- "high" relevance: Source directly relates to company's industry AND pain clusters AND value proposition
- "medium" relevance: Source relates to industry or pain clusters but not both
- "low" relevance: Source doesn't match industry/pain clusters, EVEN IF from .gov/.edu (e.g., education grants ≠ tech company relevance)

Examples:
- ❌ Education grant (.gov) for tech company → LOW relevance (not relevant despite being reputable)
- ❌ Construction PDF for software company → LOW relevance
- ✅ Tech transformation report from McKinsey → HIGH relevance
- ✅ SAP migration guide for tech company → HIGH relevance

🔴 CRITICAL: COMPREHENSIVE RELEVANCE FILTERING
Sources MUST be relevant to ALL of the following brand identity factors:
1. Industry/Domain: ${context?.targetIndustries?.join(", ") || context?.industry || "Not specified"}
2. Pain Cluster(s): ${context?.painClusters?.join(", ") || context?.painCluster || "Not specified"}
3. ICP Context: ${context?.primaryICPRoles?.join(", ") || context?.icp || "Not specified"}
4. Value Proposition: ${context?.valueProposition || "Not specified"}
5. Use Cases: ${context?.useCases?.join(", ") || "Not specified"}
${context?.productLineName ? `6. Product Line: ${context.productLineName}` : ""}

EXCLUDE sources that:
- Are from completely different industries/domains (e.g., education grants for tech companies)
- Don't mention or relate to the pain cluster(s) identified
- Don't align with the company's value proposition or use cases
- Are too generic and don't connect to the company's specific context
- Could confuse the reader about what the company actually does
- Don't match the brand voice or target ICP roles

Focus on:
- Topics that relate to solving pain clusters (especially: ${context?.painCluster || context?.painClusters?.join(", ") || "the identified pain cluster"})
- Topics that align with B2B content strategy and the organization's COMPLETE value proposition
- Current industry conversations about solving these specific problems IN THE COMPANY'S TARGET INDUSTRIES
- Actionable insights for content creators that are relevant to the company's domain, use cases, and differentiators
- How trending topics connect to pain cluster solutions IN THE COMPANY'S CONTEXT (considering all brand identity factors)
- Avoid generic or overly broad topics that don't connect to the company's business

🔴 CRITICAL: STRICT BRAND IDENTITY RELEVANCE CHECK - COUNT MATCHES
Before including a source, count how many factors it matches. A source MUST match at least 4 of these 7 to be included:

1. "Does this source explicitly relate to ${context?.targetIndustries?.join(" or ") || context?.industry || "the company's industry"}?" (Content must discuss this industry/domain)
2. "Does it discuss ${context?.painClusters?.join(" or ") || context?.painCluster || "the pain cluster"}?" (Content must mention/address these pain points)
3. "Does it relate to the company's use cases: ${context?.useCases?.join(", ") || "Not specified"}?" (Content should connect to these use cases)
${context?.productLineName ? `4. "Does it mention ${context.productLineName} or directly relate to it?" (Product line domain match)` : "4. \"Does it relate to the product/service domain?\" (Domain match)"}
5. "Does it align with the company's value proposition: ${context?.valueProposition || "Not specified"}?" (Would it help someone researching this value prop?)
6. "Is it relevant to ${context?.primaryICPRoles?.join(" or ") || context?.icp || "the target ICP"}?" (Is it written for these roles?)
7. "Does it align with ${context?.keyDifferentiators?.join(" or ") || "the company's differentiators"}?" (Technical/domain context match)

**DECISION RULE:**
- Matches 4+ factors → INCLUDE (mark relevance as "high" or "medium")
- Matches fewer than 4 factors → EXCLUDE (do not include in results array)
- Generic AI/financial markets/nuclear energy/education content that doesn't match brand identity → EXCLUDE (regardless of reputation)
- Government/education sources that don't explicitly match brand identity → EXCLUDE

**If the source matches fewer than 4 factors, DO NOT include it in the results array. Return fewer sources rather than including irrelevant ones.**

Return structured data matching the schema.`,
        },
        {
          role: "user",
          content: `Analyze these search results for trending topics related to: "${query}"

🔴 COMPLETE BRAND IDENTITY CONTEXT (USE ALL OF THIS):
${context ? `
COMPANY BRAND IDENTITY:
${context.brandVoice ? `- Brand Voice: ${context.brandVoice}` : ""}
${context.primaryICPRoles && context.primaryICPRoles.length > 0 ? `- Primary ICP Roles: ${context.primaryICPRoles.join(", ")}` : ""}
${context.targetIndustries && context.targetIndustries.length > 0 ? `- Target Industries: ${context.targetIndustries.join(", ")}` : ""}
${context.industry ? `- Primary Industry: ${context.industry}` : ""}
${context.valueProposition ? `- Value Proposition: ${context.valueProposition}` : ""}
${context.roiClaims && context.roiClaims.length > 0 ? `- ROI Claims: ${context.roiClaims.join(", ")}` : ""}
${context.keyDifferentiators && context.keyDifferentiators.length > 0 ? `- Key Differentiators: ${context.keyDifferentiators.join(", ")}` : ""}
${context.useCases && context.useCases.length > 0 ? `- Use Cases: ${context.useCases.join(", ")}` : ""}
${context.painClusters && context.painClusters.length > 0 ? `- All Pain Clusters: ${context.painClusters.join(", ")}` : ""}
${context.painCluster ? `- Primary Pain Cluster: ${context.painCluster}` : ""}
${context.icp ? `- Content ICP: ${context.icp}` : ""}
${context.competitors && context.competitors.length > 0 ? `- Competitors to EXCLUDE: ${context.competitors.join(", ")}` : ""}
${context.productLineName ? `
PRODUCT LINE (MOST SPECIFIC CONTEXT):
- Product Line Name: ${context.productLineName}
${context.productLineDescription ? `- Description: ${context.productLineDescription}` : ""}
${context.productLineValueProp ? `- Value Proposition: ${context.productLineValueProp}` : ""}
${context.productLineICPs && context.productLineICPs.length > 0 ? `- Target ICPs: ${context.productLineICPs.join(", ")}` : ""}
` : ""}
` : "No additional context"}

🔴 CRITICAL: MANDATORY STRICT RELEVANCE CHECK - SOURCES MUST MATCH THREE CRITERIA
Before including ANY source, you MUST verify it matches ALL THREE:

**CRITERIA 1: GAP CONTEXT ALIGNMENT (MANDATORY)**
The source must be relevant to:
- **ICP**: ${context?.icp || "the target ICP"} 
- **Funnel Stage**: ${context?.funnelStage || "the funnel stage"}
  ${context?.funnelStage?.includes('TOFU') ? "→ For TOFU awareness: source should focus on awareness, education, understanding, not technical implementation" : ""}
  ${context?.funnelStage?.includes('MOFU') ? "→ For MOFU consideration: source should help evaluation, comparison, strategic planning" : ""}
  ${context?.funnelStage?.includes('BOFU') ? "→ For BOFU decision: source should support decision-making, selection, purchase" : ""}
- **Pain Cluster**: ${context?.painCluster || "the pain cluster"}

**CRITERIA 2: BRAND IDENTITY MATCH (MUST MATCH AT LEAST 4 of 7)**
1. **Industry Match**: Does the source explicitly relate to ${context?.targetIndustries?.join(" or ") || context?.industry || "the company's target industries"}?
2. **Pain Cluster Match**: Does the source discuss ${context?.painClusters?.join(" or ") || context?.painCluster || "the pain cluster(s)"}?
3. **Use Case Connection**: Does the source relate to ${context?.useCases?.join(" or ") || "the company's use cases"}?
${context?.productLineName ? `4. **Product Line Relevance**: Does the source mention ${context.productLineName} or directly relate to it?` : "4. **Product/Service Domain**: Does the source relate to the product/service domain?"}
5. **Value Prop Alignment**: Would someone researching ${context?.valueProposition || "the company's value proposition"} find this relevant?
6. **ICP Relevance**: Is the source written for or relevant to ${context?.primaryICPRoles?.join(" or ") || context?.icp || "the target ICP roles"}?
7. **Differentiator/Technical Context**: Does the source align with ${context?.keyDifferentiators?.join(" or ") || "the company's differentiators"}?

**CRITERIA 3: TRENDING TOPIC SUPPORT (MANDATORY)**
- The source content MUST support at least ONE of the trending topics you identify
- Each trending topic you list must have at least one supporting source
- If a source doesn't support any trending topic, EXCLUDE it
- The trending topics should be specific to the gap context (${context?.icp || "ICP"} + ${context?.funnelStage || "stage"} + ${context?.painCluster || "pain cluster"})

**EXCLUSION RULES - EXCLUDE IF:**
- Source is from the company's own website/domain → EXCLUDE (you cannot source yourself as a source)
- Source doesn't match gap context (wrong ICP, wrong stage, wrong pain cluster) → EXCLUDE
- Source matches FEWER than 4 of the 7 brand identity factors → EXCLUDE
- Source doesn't support any of the identified trending topics → EXCLUDE
- Source is from a different industry/domain (e.g., financial markets, nuclear energy, education grants for an ERP/tech company) → EXCLUDE
- Source is generic AI/financial content that doesn't relate to the company's specific domain → EXCLUDE
- Source would confuse readers about what the company actually does → EXCLUDE

**INCLUSION RULES - ONLY INCLUDE IF:**
- ✅ Source matches gap context (ICP + stage + pain cluster)
- ✅ Source matches at least 4 of the 7 brand identity factors
- ✅ Source supports at least one trending topic you identify
- ✅ Source is from the target industry/domain context

🔴 CRITICAL: 
- EXCLUDE any results from competitor websites: ${context?.competitors?.join(", ") || "None"}
- EXCLUDE any results from the company's own website: ${context?.websiteUrl ? `${context.websiteUrl} (you cannot source yourself as a source)` : "Not provided (but still exclude company's own domain if you recognize it)"}
- NEVER include sources from the company's own domain - you cannot source yourself as a source for your own content
- PRIORITIZE reputable AND RELEVANT sources that align with ALL brand identity factors
- Only include sources that add credibility AND are relevant to the COMPLETE company context
- Use the EXACT URLs provided in each search result - do NOT modify them
- If a source is reputable but doesn't match brand identity, exclude it or mark it as low relevance

Focus on finding trending topics that:
1. Relate to solving the pain cluster(s) IN ${context?.targetIndustries?.join(" or ") || context?.industry || "the company's target industries"}: ${context?.painClusters?.join(", ") || context?.painCluster || "Not specified"}
2. Connect to the organization's COMPLETE value proposition, use cases, and differentiators
3. Show current industry conversations about these problems IN THE RELEVANT TARGET INDUSTRIES
4. Come from reputable, credible sources THAT ARE RELEVANT TO ALL BRAND IDENTITY FACTORS
5. Align with the company's brand voice and target ICP roles

Search Results (EACH HAS A URL FIELD - USE IT EXACTLY):
${searchResultsForAnalysis}`,
        },
      ],
      response_format: zodResponseFormat(TrendingTopicsSchema, "trending_topics"),
      temperature: 0.3,
    });

    const analysis = completion.choices[0].message.parsed;

    if (!analysis) {
      throw new Error("AI failed to analyze trending topics");
    }

    // Extract trending topics for validation (before filtering)
    const trendingTopicsLower = (analysis.trendingTopics || []).map(t => t.toLowerCase());
    console.log(`[Jina Search] Identified ${trendingTopicsLower.length} trending topics: ${trendingTopicsLower.join(", ")}`);
    console.log(`[Jina Search] Gap context: ICP=${context?.icp || "N/A"}, Stage=${context?.funnelStage || "N/A"}, Pain=${context?.painCluster || "N/A"}`);
    console.log(`[Jina Search] AI returned ${analysis.results?.length || 0} sources before validation`);

    // Create URL lookup map from Jina results to fix any AI URL errors (use pre-filtered results)
    const jinaUrlMap = new Map<string, { url: string; title: string; content: string }>();
    for (const r of preFilteredResults) {
      if (r.url && r.title) {
        // Map by normalized title for fuzzy matching
        jinaUrlMap.set(r.title.toLowerCase().trim(), r);
        // Also map by URL for direct lookup
        jinaUrlMap.set(r.url.toLowerCase().trim(), r);
      }
    }

    // Post-process: ensure URLs from Jina are correctly used and preserve metadata
    // The AI might return malformed URLs, so we fix them from the original Jina data
    const fixedResults = (analysis.results ?? []).map((r, index) => {
      let fixedUrl = r.url;
      let fixedTitle = r.title;
      let fixedContent = r.content;
      
      // Try to find the original Jina result by title or URL
      const titleKey = r.title?.toLowerCase().trim();
      const urlKey = r.url?.toLowerCase().trim();
      
      const jinaMatch = jinaUrlMap.get(titleKey) || jinaUrlMap.get(urlKey);
      
      if (jinaMatch) {
        // Use the actual URL from Jina (most reliable)
        fixedUrl = jinaMatch.url;
        fixedTitle = jinaMatch.title || fixedTitle;
        // Optionally use the full content if AI truncated it
        if (!fixedContent || fixedContent.length < 100) {
          fixedContent = jinaMatch.content?.substring(0, 2000) || fixedContent;
        }
      } else {
        // If no match found, try to find by partial URL match
        for (const [, jinaResult] of jinaUrlMap) {
          if (jinaResult.url && r.url && (
            jinaResult.url.includes(r.url) || 
            r.url.includes(jinaResult.url.split('/').slice(-2).join('/'))
          )) {
            fixedUrl = jinaResult.url;
            fixedTitle = jinaResult.title || fixedTitle;
            fixedContent = jinaResult.content?.substring(0, 2000) || fixedContent;
            break;
          }
        }
      }
      
      // Fill in missing metadata if AI didn't provide it (but don't add IDs yet - that happens in finalResults)
      // First, try to get publishedTime from the original Jina result
      let publishedTimeFromJina: string | undefined = undefined;
      if (jinaMatch && 'publishedTime' in jinaMatch) {
        publishedTimeFromJina = (jinaMatch as any).publishedTime;
      }
      
      const publisher = r.publisher || extractDomain(fixedUrl) || null;
      // Use publishedDate from AI if available, otherwise try to extract from Jina result or URL/content
      const publishedDate = r.publishedDate || 
                           (publishedTimeFromJina ? new Date(publishedTimeFromJina).toISOString().substring(0, 10) : null) ||
                           extractPublishedDate(fixedUrl, fixedContent || "") || 
                           null;
      const excerpt = r.excerpt || (fixedContent ? (fixedContent.length > 500 ? fixedContent.substring(0, 500) + "..." : fixedContent) : null);
      const whyReputable = r.whyReputable || null; // Will be filled in finalResults based on isReputable
      const whyRelevant = r.whyRelevant || null;
      
      return {
        ...r,
        url: fixedUrl,
        title: fixedTitle,
        content: fixedContent,
        publisher: publisher,
        publishedDate: publishedDate,
        excerpt: excerpt,
        whyReputable: whyReputable,
        whyRelevant: whyRelevant,
      };
    });

    // Post-process: remove competitor results AND filter for relevance
    const competitorTerms = (context?.competitors ?? [])
      .map(c => c.toLowerCase().trim())
      .filter(Boolean);

    // Build relevance keywords from context - MUST match at least one
    const relevanceKeywords: string[] = [];
    
    // Extract industry context for relevance checking
    const targetIndustries = context?.targetIndustries || (context?.industry ? [context.industry] : []);
    if (targetIndustries.length > 0) {
      targetIndustries.forEach(industry => {
        const industryTerms = industry
          .split(/[,\s&]/)
          .filter(term => term.length > 3 && !['and', 'services', 'management', 'information', 'technology'].includes(term.toLowerCase()))
          .slice(0, 2);
        relevanceKeywords.push(...industryTerms.map(t => t.toLowerCase()));
      });
    }
    
    // Add pain cluster terms (MOST IMPORTANT)
    if (context?.painCluster) {
      const painTerms = context.painCluster
        .split(/\s+/)
        .filter(term => term.length > 3)
        .slice(0, 3);
      relevanceKeywords.push(...painTerms.map(t => t.toLowerCase()));
    }
    
    if (context?.valueProposition) {
      // Extract key terms from value proposition
      const vpTerms = context.valueProposition
        .split(/\s+/)
        .filter(term => term.length > 4 && !['help', 'achieve', 'through', 'using', 'their', 'companies', 'organizations', 'enable'].includes(term.toLowerCase()))
        .slice(0, 3);
      relevanceKeywords.push(...vpTerms.map(t => t.toLowerCase()));
    }
    
    // Add product line terms if available
    if (context?.productLineName) {
      const plTerms = context.productLineName
        .split(/\s+/)
        .filter(term => term.length > 3)
        .slice(0, 2);
      relevanceKeywords.push(...plTerms.map(t => t.toLowerCase()));
    }
    
    // Add use case terms (CRITICAL for domain relevance)
    if (context?.useCases && context.useCases.length > 0) {
      context.useCases.forEach(useCase => {
        const ucTerms = useCase
          .split(/[\s,\-\(\)]+/)
          .filter(term => term.length > 4 && !['management', 'solutions', 'services', 'platform', 'system'].includes(term.toLowerCase()))
          .slice(0, 2);
        relevanceKeywords.push(...ucTerms.map(t => t.toLowerCase()));
      });
    }
    
    // Add key differentiator terms
    if (context?.keyDifferentiators && context.keyDifferentiators.length > 0) {
      const topDiff = context.keyDifferentiators[0];
      const diffTerms = topDiff
        .split(/[\s,\-\(\)]+/)
        .filter(term => term.length > 4 && !['powered', 'grade', 'interface', 'advanced', 'modern'].includes(term.toLowerCase()))
        .slice(0, 2);
      relevanceKeywords.push(...diffTerms.map(t => t.toLowerCase()));
    }
    
    console.log(`[Jina Search] Relevance keywords for filtering: ${relevanceKeywords.join(", ")}`);
    
    // Define domain-specific exclusion patterns
    const exclusionPatterns: Array<{ pattern: string; reason: string }> = [];
    
    // If not in finance/banking, exclude general financial markets content
    if (!targetIndustries.some(ind => ['finance', 'banking', 'financial', 'capital', 'markets'].some(kw => ind.toLowerCase().includes(kw)))) {
      exclusionPatterns.push(
        { pattern: 'capital markets', reason: 'Not relevant to company industry' },
        { pattern: 'macro markets', reason: 'Not relevant to company industry' },
        { pattern: 'economic transformation', reason: 'Too generic financial content' }
      );
    }
    
    // If not in nuclear/energy, exclude nuclear energy content
    if (!targetIndustries.some(ind => ['nuclear', 'energy', 'power', 'renewable'].some(kw => ind.toLowerCase().includes(kw)))) {
      exclusionPatterns.push(
        { pattern: 'nuclear energy', reason: 'Not relevant to company industry' },
        { pattern: 'nuclear capacity', reason: 'Not relevant to company industry' }
      );
    }
    
    // If not in construction/building, exclude construction content
    if (!targetIndustries.some(ind => ['construction', 'building', 'infrastructure', 'architecture'].some(kw => ind.toLowerCase().includes(kw)))) {
      exclusionPatterns.push(
        { pattern: 'construction', reason: 'Not relevant to company industry' },
        { pattern: 'building infrastructure', reason: 'Not relevant to company industry' }
      );
    }
    
    // Define domain exclusions based on industry mismatch
    // If company is in tech/IT, exclude education/government domains that aren't relevant
    const techKeywords = ['technology', 'software', 'it', 'information technology', 'computer', 'saas', 'tech'];
    const isTechCompany = targetIndustries.some(ind => 
      techKeywords.some(kw => ind.toLowerCase().includes(kw))
    );
    
    // Also check for other industry mismatches (e.g., construction, finance, healthcare)
    const constructionKeywords = ['construction', 'building', 'infrastructure', 'architecture'];
    const isConstructionCompany = targetIndustries.some(ind => 
      constructionKeywords.some(kw => ind.toLowerCase().includes(kw))
    );
    
    // STRICT DATE FILTERING - Extract and reject old sources
    const filteredResults = fixedResults.filter(r => {
      const haystack = `${r.url} ${r.title} ${r.content || ""}`.toLowerCase();
      
      // 🔴 CRITICAL: DATE FILTERING - REJECT sources older than 6 months
      // Extract year from URL (common patterns: /2020/, /2025/08/, /2009/)
      const urlYearMatch = r.url.match(/\/(\d{4})\//);
      const urlYear = urlYearMatch ? parseInt(urlYearMatch[1], 10) : null;
      
      // Extract year from content (look for "Published:", "Date:", year patterns)
      const contentYearMatch = r.content?.match(/(?:published|date|updated|created)[:\s]+(\d{4})/i) || 
                               r.content?.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(\d{4})/i) ||
                               r.content?.match(/\b(20\d{2})\b/);
      const contentYear = contentYearMatch ? parseInt(contentYearMatch[1] || contentYearMatch[0], 10) : null;
      
      // Use the most recent year found
      const sourceYear = urlYear && contentYear 
        ? Math.max(urlYear, contentYear) 
        : (urlYear || contentYear);
      
      // DATE FILTERING - Only reject if clearly older than 6 months
      // Be lenient: if no date found, allow through (let AI determine relevance)
      if (sourceYear) {
        const currentYear = today.getFullYear();
        
        // Only reject sources from years clearly too old (more than 2 years in the past)
        if (sourceYear < currentYear - 2) {
          console.log(`[Jina Search] REJECTED - Year is too old: ${r.title} (${sourceYear}, current: ${currentYear})`);
          return false;
        }
        
        // For sources from last year: calculate precise date difference
        if (sourceYear === currentYear - 1) {
          // If we're in early months (Jan-Jun), sources from late last year (Jul-Dec) might be <6 months
          // But this is approximate from year alone - be lenient and check explicit dates if available
          // Only reject if we have explicit date that's clearly >6 months old (handled below)
          console.log(`[Jina Search] Source from last year: ${r.title} (${sourceYear}) - checking explicit date`);
        }
        
        // Reject invalid years (future more than 1 year ahead or very old)
        if (sourceYear > currentYear + 1 || sourceYear < 2010) {
          console.log(`[Jina Search] REJECTED - Invalid year: ${r.title} (${sourceYear})`);
          return false;
        }
      }
      
      // Additional check: Look for explicit dates in content or title (more precise)
      const explicitDatePattern = r.content?.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(\d{4})/i) ||
                                   r.title?.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(\d{4})/i);
      if (explicitDatePattern) {
        try {
          const explicitDate = new Date(explicitDatePattern[0]);
          // Only reject if we can parse the date AND it's clearly older than 6 months
          if (!isNaN(explicitDate.getTime()) && explicitDate < sixMonthsAgo) {
            console.log(`[Jina Search] REJECTED - Explicit date too old: ${r.title} (${explicitDatePattern[0]}, cutoff: ${cutoffDateStr})`);
            return false;
          }
          // If date parsing fails or date is within 6 months, allow through
        } catch (e) {
          // If date parsing fails, be lenient and allow through
          console.log(`[Jina Search] Could not parse explicit date for ${r.title}, allowing source`);
        }
      }
      
      // Exclude competitors
      if (competitorTerms.some(t => t && haystack.includes(t))) {
        console.log(`[Jina Search] Excluding ${r.url} - competitor`);
        return false;
      }
      
      // CRITICAL: Exclude company's own domain/website (you cannot source yourself)
      if (context?.websiteUrl) {
        try {
          const companyDomain = extractDomain(context.websiteUrl);
          const sourceDomain = extractDomain(r.url);
          
          // Check if source is from company's own domain (exact match or subdomain)
          if (companyDomain && sourceDomain && 
              (sourceDomain.toLowerCase() === companyDomain.toLowerCase() ||
               sourceDomain.toLowerCase().includes(companyDomain.toLowerCase()) ||
               companyDomain.toLowerCase().includes(sourceDomain.toLowerCase()))) {
            console.log(`[Jina Search] Excluding ${r.url} - company's own website (${companyDomain})`);
            return false;
          }
          
          // Also check if URL directly contains the company domain (with or without www, http/https)
          const domainPattern = companyDomain.toLowerCase().replace(/^www\./, '');
          if (r.url.toLowerCase().includes(domainPattern)) {
            console.log(`[Jina Search] Excluding ${r.url} - company's own website (${domainPattern})`);
            return false;
          }
        } catch (e) {
          // If domain extraction fails, still check URL directly
          const websiteUrlClean = context.websiteUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
          if (websiteUrlClean && r.url.toLowerCase().includes(websiteUrlClean)) {
            console.log(`[Jina Search] Excluding ${r.url} - company's own website (${websiteUrlClean})`);
            return false;
          }
        }
      }
      
      // CRITICAL: Also exclude sources that mention the company's product name (e.g., "FrontLoad")
      if (context?.productLineName) {
        const productNameLower = context.productLineName.toLowerCase().replace(/[™®©]/g, '').trim();
        const productNameVariations = productNameLower.split(/[\s\-]+/).filter(term => term.length > 3);
        
        // Check if source title, URL, or content mentions the product name
        const mentionsProduct = haystack.includes(productNameLower) || 
          productNameVariations.some(variation => haystack.includes(variation)) ||
          r.url.toLowerCase().includes(productNameLower);
        
        if (mentionsProduct) {
          // Exclude if:
          // 1. It's from the company's own domain
          // 2. It's a YouTube video about the product (likely company's own content)
          // 3. The title explicitly mentions the product (likely company's own content)
          const isLikelyCompanyContent = 
            (context?.websiteUrl && r.url.toLowerCase().includes(extractDomain(context.websiteUrl).toLowerCase())) ||
            (r.url.toLowerCase().includes('youtube.com') && (r.title.toLowerCase().includes(productNameLower) || haystack.includes(productNameLower))) ||
            (r.title.toLowerCase().includes(productNameLower) && r.title.toLowerCase().includes('deeper dive'));
          
          if (isLikelyCompanyContent) {
            console.log(`[Jina Search] Excluding ${r.url} - mentions company product "${context.productLineName}" and appears to be company content`);
            return false;
          }
        }
      }
      
      // Explicit domain-based exclusions for industry mismatches
      if (isTechCompany) {
        // Exclude education/government domains unless they explicitly mention tech/IT/business topics
        if (r.url.includes('.edu') || r.url.includes('ed.gov') || (r.url.includes('.gov') && !r.url.includes('tech') && !r.url.includes('it'))) {
          // Only keep if URL/title mentions tech/IT/software/business transformation/migration/etc
          const techRelatedTerms = ['technology', 'software', 'it', 'transformation', 'migration', 'digital', 'cloud', 'enterprise', 'business', 'sap', 'erp', 'software', 'system', 'infrastructure'];
          const hasTechContext = techRelatedTerms.some(term => haystack.includes(term));
          if (!hasTechContext) {
            console.log(`[Jina Search] Excluding ${r.url} - government/education domain without tech/business context`);
            return false;
          }
        }
      }
      
      // Check for exclusion patterns first (domain-specific exclusions)
      for (const { pattern, reason } of exclusionPatterns) {
        if (haystack.includes(pattern.toLowerCase())) {
          // Only exclude if it doesn't also mention relevant brand identity terms
          const hasRelevantContext = relevanceKeywords.some(kw => haystack.includes(kw)) ||
            (context?.painCluster && haystack.includes(context.painCluster.toLowerCase())) ||
            (context?.productLineName && haystack.includes(context.productLineName.toLowerCase()));
          
          if (!hasRelevantContext) {
            console.log(`[Jina Search] Excluding ${r.url} - ${reason} (pattern: ${pattern})`);
            return false;
          }
        }
      }
      
      // CRITICAL: Check if source supports any of the identified trending topics
      const supportsTrendingTopic = trendingTopicsLower.length > 0 && trendingTopicsLower.some(topic => {
        // Extract key terms from trending topic (words > 4 chars)
        const topicTerms = topic
          .split(/[\s,\-\(\)]+/)
          .filter(term => term.length > 4 && !['trending', 'topics', 'about', 'related'].includes(term.toLowerCase()))
          .slice(0, 3);
        
        // Check if source content contains these topic terms
        return topicTerms.length > 0 && topicTerms.some(term => haystack.includes(term.toLowerCase()));
      });
      
      // Relevance check: Require at least TWO relevance keyword matches OR strong pain cluster/product line match
      if (relevanceKeywords.length > 0) {
        const matchingKeywords = relevanceKeywords.filter(keyword => haystack.includes(keyword));
        const hasRelevance = matchingKeywords.length >= 2; // Require at least 2 matches
        
        // Also check for strong pain cluster or product line match
        const mentionsPainCluster = context?.painCluster && haystack.includes(context.painCluster.toLowerCase());
        const mentionsProductLine = context?.productLineName && haystack.includes(context.productLineName.toLowerCase());
        const mentionsUseCase = context?.useCases?.some(uc => haystack.includes(uc.toLowerCase().substring(0, 15)));
        const strongMatch = mentionsPainCluster || mentionsProductLine || mentionsUseCase;
        
        // CRITICAL: Gap context validation - ICP + Stage + Pain Cluster alignment
        let passesGapContext = true; // Default to true if we can't validate
        if (context?.funnelStage && context?.icp && context?.painCluster) {
          // Check ICP alignment (source should mention ICP role or relevant terms)
          const icpLower = context.icp.toLowerCase();
          const icpMatch = 
            (icpLower.includes('cfo') || icpLower.includes('financial')) 
              ? (haystack.includes('financial') || haystack.includes('cfo') || haystack.includes('finance') || haystack.includes('budget') || haystack.includes('cost') || haystack.includes('roi') || haystack.includes('exposure') || haystack.includes('risk'))
              : (icpLower.includes('cto') || icpLower.includes('it director') || icpLower.includes('technical'))
                ? (haystack.includes('technology') || haystack.includes('technical') || haystack.includes('it') || haystack.includes('enterprise') || haystack.includes('digital') || haystack.includes('transformation') || haystack.includes('migration') || haystack.includes('erp') || haystack.includes('sap'))
                : true; // If ICP not specifically identifiable, allow if other criteria met
          
          // Check pain cluster alignment (source must mention pain cluster terms)
          const painClusterMatch = haystack.includes(context.painCluster.toLowerCase()) || 
            context.painCluster.toLowerCase().split(/\s+/).some(word => word.length > 4 && haystack.includes(word.toLowerCase()));
          
          // Check stage alignment (for TOFU, prefer awareness/risk/cost over technical implementation)
          const stageMatch = context.funnelStage.includes('TOFU')
            ? (!haystack.includes('implementation guide') && !haystack.includes('technical implementation') && !haystack.includes('step-by-step')) || haystack.includes('awareness') || haystack.includes('understanding') || haystack.includes('risk') || haystack.includes('cost') || haystack.includes('exposure')
            : true; // MOFU/BOFU: allow any relevant content
          
          passesGapContext = icpMatch && stageMatch && painClusterMatch;
          
          if (!passesGapContext) {
            console.log(`[Jina Search] Gap context mismatch for ${r.url}: ICP=${icpMatch}, Stage=${stageMatch}, Pain=${painClusterMatch}`);
          }
        }
        
        // Decision logic: source must pass ALL THREE checks
        const passesBrandIdentity = hasRelevance || strongMatch;
        const passesTrendingTopicCheck = supportsTrendingTopic || trendingTopicsLower.length === 0; // Allow if no topics yet or source supports them
        
        // CRITICAL: Source must pass ALL THREE criteria
        if (!passesBrandIdentity || !passesTrendingTopicCheck || !passesGapContext) {
          // Check if it's from highly reputable consulting/tech sources that might still be relevant
          const highlyReputableDomains = ['mckinsey.com', 'deloitte.com', 'pwc.com', 'gartner.com', 'forrester.com', 'bcg.com', 'bain.com', 'hbr.org', 'sap.com', 'oracle.com', 'microsoft.com', 'kyndryl.com'];
          const isHighlyReputable = highlyReputableDomains.some(domain => r.url.toLowerCase().includes(domain));
          
          // Only allow through if highly reputable AND at least one keyword matches AND supports trending topics AND matches gap context
          if (!isHighlyReputable || (matchingKeywords.length === 0 && !strongMatch) || !passesTrendingTopicCheck || !passesGapContext) {
            console.log(`[Jina Search] Excluding ${r.url} - insufficient relevance: brand=${passesBrandIdentity}, trending=${passesTrendingTopicCheck}, gap=${passesGapContext}, keywords=${matchingKeywords.length}/${relevanceKeywords.length}`);
            return false;
          } else {
            console.log(`[Jina Search] ALLOWING ${r.url} - highly reputable with brand identity, trending topic, and gap context match`);
          }
        } else {
          console.log(`[Jina Search] ALLOWING ${r.url} - brand=${passesBrandIdentity} (${matchingKeywords.length} keywords), trending=${passesTrendingTopicCheck}, gap=${passesGapContext}`);
        }
      } else {
        // If no relevance keywords defined, at least check for trending topic support and gap context
        if (trendingTopicsLower.length > 0 && !supportsTrendingTopic) {
          console.log(`[Jina Search] Excluding ${r.url} - doesn't support any identified trending topics`);
          return false;
        }
        // Also check gap context even if no relevance keywords
        if (context?.funnelStage && context?.painCluster) {
          const painClusterMatch = haystack.includes(context.painCluster.toLowerCase());
          if (!painClusterMatch) {
            console.log(`[Jina Search] Excluding ${r.url} - doesn't match gap context (${context.funnelStage} + ${context.painCluster})`);
            return false;
          }
        }
      }
      
      return true;
    });

    // If AI returned fewer results than Jina provided, supplement with Jina results
    // This ensures we don't lose valuable sources
    const existingUrls = new Set(filteredResults.map(r => r.url.toLowerCase()));
    const supplementalResults: typeof filteredResults = [];
    
    for (const jinaResult of jinaResults) {
      if (!existingUrls.has(jinaResult.url.toLowerCase())) {
        // 🔴 CRITICAL: STRICT DATE CHECK for supplemental results (same logic as main filter)
        const urlYearMatch = jinaResult.url.match(/\/(\d{4})\//);
        const urlYear = urlYearMatch ? parseInt(urlYearMatch[1], 10) : null;
        const contentYearMatch = jinaResult.content?.match(/\b(20\d{2})\b/);
        const contentYear = contentYearMatch ? parseInt(contentYearMatch[0], 10) : null;
        const sourceYear = urlYear && contentYear ? Math.max(urlYear, contentYear) : (urlYear || contentYear);
        const currentYear = today.getFullYear();
        
        // Only reject sources from years clearly too old (more than 2 years in the past)
        if (sourceYear && sourceYear < currentYear - 2) {
          console.log(`[Jina Search] REJECTED supplemental - Year too old: ${jinaResult.title} (${sourceYear})`);
          continue;
        }
        
        // Reject invalid years (future more than 1 year ahead or very old)
        if (sourceYear && (sourceYear > currentYear + 1 || sourceYear < 2010)) {
          console.log(`[Jina Search] REJECTED supplemental - Invalid year: ${jinaResult.title} (${sourceYear})`);
          continue;
        }
        
        // For URLs with year patterns, only reject if clearly too old (2+ years)
        if (urlYear && urlYear < currentYear - 2) {
          console.log(`[Jina Search] REJECTED supplemental - URL year too old: ${jinaResult.title} (${urlYear})`);
          continue;
        }
        
        // For last year URLs, be lenient - allow through and let AI determine relevance
        
        // Check if this is a competitor
        const haystack = `${jinaResult.url} ${jinaResult.title} ${jinaResult.content}`.toLowerCase();
        if (!competitorTerms.some(t => t && haystack.includes(t))) {
          // Only add if not already in preFilteredResults
          const alreadyIncluded = preFilteredResults.some(r => r.url.toLowerCase() === jinaResult.url.toLowerCase());
          if (!alreadyIncluded) {
            supplementalResults.push({
              url: jinaResult.url,
              title: jinaResult.title,
              content: jinaResult.content?.substring(0, 2000) || "",
              relevance: "medium" as const,
              sourceType: "other" as const, // Will be classified below
              isReputable: false, // Will be determined below
            });
          }
        }
      }
    }

    // Combine and ensure we have up to 5 results
    const combinedResults = [...filteredResults, ...supplementalResults].slice(0, 5);

    // Determine reputability based on URL patterns for any results that aren't already classified
    const reputableDomains = [
      'mckinsey.com', 'deloitte.com', 'pwc.com', 'gartner.com', 'forrester.com',
      'bcg.com', 'bain.com', 'accenture.com', 'ey.com', 'kpmg.com',
      'hbr.org', 'mit.edu', 'stanford.edu', 'harvard.edu', 'forbes.com',
      'wsj.com', 'ft.com', 'economist.com', 'bloomberg.com', 'reuters.com',
      'idc.com', 'statista.com', 'pew', '.gov', '.edu'
    ];
    
    const industryMediaDomains = [
      'techcrunch.com', 'wired.com', 'zdnet.com', 'venturebeat.com', 'theverge.com',
      'arstechnica.com', 'cnet.com', 'computerworld.com', 'infoworld.com'
    ];

    // FINAL DATE FILTER - Be lenient to avoid removing everything
    // Only reject sources that are clearly too old (more than 2 years)
    const finalDateFiltered = combinedResults.filter(r => {
      // Extract year from URL one more time (safety check)
      const urlYearMatch = r.url.match(/\/(\d{4})\//);
      if (urlYearMatch) {
        const urlYear = parseInt(urlYearMatch[1], 10);
        const currentYear = today.getFullYear();
        
        // Only reject if URL contains a year from 2+ years ago
        // Be lenient with current year and last year - let AI determine relevance
        if (urlYear < currentYear - 2) {
          console.log(`[Jina Search] FINAL FILTER REJECTED - URL year too old: ${r.title} (${urlYear})`);
          return false;
        }
        
        // Reject invalid future years (more than 1 year ahead)
        if (urlYear > currentYear + 1) {
          console.log(`[Jina Search] FINAL FILTER REJECTED - Invalid future year: ${r.title} (${urlYear})`);
          return false;
        }
      }
      
      // Be lenient with content year mentions - only reject very old references
      const oldYearInContent = r.content?.match(/\b(200[0-9]|201[0-9]|202[0-2])\b/);
      if (oldYearInContent) {
        const foundYear = parseInt(oldYearInContent[0], 10);
        const currentYear = today.getFullYear();
        // Only reject if content mentions years more than 2 years old
        if (foundYear < currentYear - 2) {
          console.log(`[Jina Search] FINAL FILTER REJECTED - Very old year in content: ${r.title} (mentions ${foundYear})`);
          return false;
        }
      }
      
      return true;
    });

    console.log(`[Jina Search] Final date filter: ${combinedResults.length} → ${finalDateFiltered.length} (removed ${combinedResults.length - finalDateFiltered.length} old sources)`);

    // Generate stable source IDs and add metadata
    const finalResults = finalDateFiltered.map((r, index) => {
      const urlLower = r.url.toLowerCase();
      let sourceType = r.sourceType;
      let isReputable = r.isReputable;
      
      // Check if URL matches reputable domains
      if (reputableDomains.some(d => urlLower.includes(d))) {
        isReputable = true;
        if (urlLower.includes('mckinsey') || urlLower.includes('deloitte') || 
            urlLower.includes('pwc') || urlLower.includes('bcg') || 
            urlLower.includes('bain') || urlLower.includes('accenture') ||
            urlLower.includes('gartner') || urlLower.includes('forrester')) {
          sourceType = "consulting" as const;
        } else if (urlLower.includes('.edu') || urlLower.includes('idc.') || 
                   urlLower.includes('statista') || urlLower.includes('pew')) {
          sourceType = "research" as const;
        } else {
          sourceType = "industry_media" as const;
        }
      } else if (industryMediaDomains.some(d => urlLower.includes(d))) {
        sourceType = "industry_media" as const;
        isReputable = true;
      }
      
      // Generate stable source ID (based on URL domain + title hash)
      const domain = extractDomain(r.url);
      const titleHash = r.title.substring(0, 20).replace(/[^a-z0-9]/gi, '').toLowerCase();
      const sourceId = `src-${domain.replace(/[^a-z0-9]/gi, '-')}-${titleHash}-${index}`.substring(0, 50);
      
      // Extract metadata
      const publisher = domain || null;
      const publishedDate = extractPublishedDate(r.url, r.content || "");
      const excerpt = r.content ? (r.content.length > 500 ? r.content.substring(0, 500) + "..." : r.content) : null;
      const whyReputable = isReputable ? getWhyReputable(r.url, sourceType) : null;
      const whyRelevant = r.whyRelevant || null;
      
      return { 
        ...r, 
        id: sourceId,
        sourceType, 
        isReputable,
        publisher: publisher || r.publisher || null,
        publishedDate: publishedDate || r.publishedDate || null,
        excerpt: excerpt || r.excerpt || null,
        whyReputable: whyReputable || r.whyReputable || null,
        whyRelevant: whyRelevant || r.whyRelevant || null,
      };
    });

    const sourcesUsed = dedupeStrings(
      finalResults.filter(r => r.isReputable).map(r => r.url)
    );

    console.log(`Processed ${finalResults.length} results, ${sourcesUsed.length} reputable sources with URLs:`, sourcesUsed);

    // Flag if we have fewer than 3 sources (warning but not blocking)
    const sourceCountWarning = finalResults.length < 3
      ? `Only ${finalResults.length} sources found (target: 3-5). This may limit content traceability.`
      : null;

    return {
      ...analysis,
      results: finalResults,
      sourcesUsed,
      sourceCountWarning: sourceCountWarning || undefined,
    };
  } catch (error) {
    console.error("Error searching trending topics:", error);
    
    const warnings: Array<{ type: string; message: string; api: string }> = [{
      type: "error",
      message: `Jina Search API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      api: "Jina"
    }];
    
    // Return empty result instead of throwing - trending topics are optional
    return {
      results: [],
      trendingTopics: [],
      insights: error instanceof Error 
        ? `Trending topics discovery failed: ${error.message}` 
        : "Trending topics discovery unavailable.",
      sourcesUsed: [],
      _apiWarnings: warnings,
    };
  }
}
