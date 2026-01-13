import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Brand Consistency Analysis Schema (without platform - added manually)
const BrandConsistencySchema = z.object({
  brand_description: z.string().describe("How this AI platform describes the brand"),
  accuracy_score: z.number().min(0).max(100).describe("How accurately the AI represents the brand (0-100)"),
  key_facts_present: z.array(z.string()).describe("Key brand facts that ARE accurately represented"),
  key_facts_missing: z.array(z.string()).describe("Key brand facts that are MISSING or incorrect"),
  misstatements: z.array(z.string()).describe("Incorrect or misleading statements about the brand"),
  tone_match: z.enum(["excellent", "good", "fair", "poor"]).describe("How well the AI's tone matches brand voice"),
  recommendations: z.array(z.string()).describe("Specific recommendations to improve brand representation on this platform"),
});

export type BrandConsistencyResult = z.infer<typeof BrandConsistencySchema> & {
  platform: "chatgpt" | "claude" | "perplexity";
};

export interface BrandContext {
  valueProposition?: string | null;
  keyDifferentiators: string[];
  targetIndustries: string[];
  painClusters: string[];
  useCases: string[];
  roiClaims: string[];
  brandVoice: string[];
  websiteUrl?: string | null;
  productName?: string;
}

/**
 * Safely extract hostname from a URL, removing www. prefix
 * Returns undefined if URL cannot be parsed
 */
function safeHostname(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  try {
    // Normalize URL - add protocol if missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const urlObj = new URL(normalizedUrl);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    // If URL parsing fails, try simple regex extraction
    const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
    return match ? match[1] : undefined;
  }
}

/**
 * Query ChatGPT about a brand
 */
async function queryChatGPT(brandName: string, websiteUrl?: string): Promise<string> {
  const prompt = websiteUrl
    ? `Please provide a comprehensive description of the company "${brandName}" (website: ${websiteUrl}). Include:
- What the company does and their main business
- Key products or services
- Target audience or market
- What makes them unique or differentiates them
- Company background or history if available
- Any notable achievements or positioning

Base your response on publicly available information. Be detailed and specific.`
    : `Please provide a comprehensive description of the company "${brandName}". Include:
- What the company does and their main business
- Key products or services
- Target audience or market
- What makes them unique or differentiates them
- Company background or history if available
- Any notable achievements or positioning

Base your response on publicly available information. Be detailed and specific.`;

  // If we have a website URL, prefer web search so the model can use up-to-date public info.
  if (websiteUrl) {
    try {
      const host = safeHostname(websiteUrl);
      const allowedDomains = host ? [host, "www." + host] : undefined;

      const response = await openai.responses.create({
        // Allow overriding the model used for web search in env.
        // If you do not have access to gpt-5, set OPENAI_WEB_SEARCH_MODEL to a model you do have.
        model: process.env.OPENAI_WEB_SEARCH_MODEL || "gpt-5",
        tools: [
          host
            ? {
                type: "web_search",
                filters: {
                  allowed_domains: allowedDomains,
                },
              }
            : { type: "web_search" },
        ],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        input: [
          {
            role: "system",
            content:
              "You are a careful company researcher. Use web search to gather publicly available information. If the company is small or information is sparse, say so clearly and avoid guessing.",
          },
          {
            role: "user",
            content:
              prompt +
              "\n\nImportant: Use web search for this request and only include facts supported by public sources. If you cannot confirm something, label it as uncertain.",
          },
        ],
        text: {
          verbosity: "medium",
        },
      });

      const out = (response as any).output_text || "";

      // If the model returned something useful, use it.
      if (out && out.trim().length > 0) {
        return out;
      }
    } catch (err) {
      console.warn("Web search call failed; falling back to Chat Completions.", err);
    }
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that provides accurate, factual information about companies based on publicly available information. Provide comprehensive, detailed responses. If you have knowledge about the company, share it. If you're uncertain, indicate what information is available and what might be missing.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content || "";
    
    // Check if the response indicates lack of information
    if (!response || response.toLowerCase().includes("i don't have") || response.toLowerCase().includes("i don't know") || response.toLowerCase().includes("i cannot")) {
      console.warn(`ChatGPT response suggests lack of information for ${brandName}: ${response.substring(0, 100)}`);
    }
    
    return response || "No response from ChatGPT";
  } catch (error) {
    console.error("Error querying ChatGPT:", error);
    throw new Error(`Failed to query ChatGPT: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Analyze brand consistency for a single AI platform
 */
async function analyzeBrandConsistency(
  platform: "chatgpt" | "claude" | "perplexity",
  aiResponse: string,
  brandContext: BrandContext
): Promise<BrandConsistencyResult> {
  // Build brand facts summary
  const brandFacts = `
BRAND FACTS (Canonical):
- Value Proposition: ${brandContext.valueProposition || "Not specified"}
- Key Differentiators: ${brandContext.keyDifferentiators.join(", ") || "None specified"}
- Target Industries: ${brandContext.targetIndustries.join(", ") || "None specified"}
- Pain Clusters: ${brandContext.painClusters.join(", ") || "None specified"}
- Use Cases: ${brandContext.useCases.join(", ") || "None specified"}
- ROI Claims: ${brandContext.roiClaims.join(", ") || "None specified"}
- Brand Voice: ${brandContext.brandVoice.join(", ") || "Not specified"}
`;

  const analysisPrompt = `Analyze how accurately an AI platform represents a brand.

AI PLATFORM RESPONSE (${platform}):
${aiResponse}

${brandFacts}

Compare the AI's response to the canonical brand facts. Provide:
1. An accuracy score (0-100) - how well does the AI represent the brand?
2. Key facts that ARE accurately represented
3. Key facts that are MISSING or incorrect
4. Any misstatements or misleading information
5. Tone match assessment (how well does the AI's tone match the brand voice?)
6. Specific recommendations to improve brand representation

Be critical and specific.`;

  try {
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content: "You are an expert brand analyst. Analyze how accurately AI platforms represent brands compared to their canonical messaging.",
        },
        {
          role: "user",
          content: analysisPrompt,
        },
      ],
      response_format: zodResponseFormat(BrandConsistencySchema, "brand_consistency"),
      temperature: 0.2,
    });

    const result = completion.choices[0]?.message?.parsed;
    if (!result) {
      throw new Error("Failed to parse brand consistency analysis");
    }

    return {
      platform,
      ...result,
    };
  } catch (error) {
    console.error(`Error analyzing brand consistency for ${platform}:`, error);
    // Return fallback result
    return {
      platform,
      brand_description: aiResponse.substring(0, 200),
      accuracy_score: 0,
      key_facts_present: [],
      key_facts_missing: brandContext.keyDifferentiators,
      misstatements: ["Unable to analyze - API error"],
      tone_match: "poor",
      recommendations: ["Fix API connection to enable analysis"],
    };
  }
}

/**
 * Test brand representation across multiple AI platforms
 */
export async function testBrandConsistency(
  accountId: string,
  brandName?: string
): Promise<{
  overall_score: number;
  platform_results: BrandConsistencyResult[];
  summary: {
    average_accuracy: number;
    common_misstatements: string[];
    critical_gaps: string[];
    top_recommendations: string[];
  };
}> {
  // Fetch brand context from database
  const brandContext = await prisma.brandContext.findUnique({
    where: { accountId },
  });

  if (!brandContext) {
    throw new Error("Brand context not found. Please set up your brand context first.");
  }

  // Build brand context object
  const context: BrandContext = {
    valueProposition: brandContext.valueProposition,
    keyDifferentiators: brandContext.keyDifferentiators,
    targetIndustries: brandContext.targetIndustries,
    painClusters: brandContext.painClusters,
    useCases: brandContext.useCases,
    roiClaims: brandContext.roiClaims,
    brandVoice: Array.isArray(brandContext.brandVoice)
      ? brandContext.brandVoice
      : [brandContext.brandVoice as string],
    websiteUrl: brandContext.websiteUrl,
    productName: brandName,
  };

  // Determine brand name for queries - use safeHostname to get clean hostname
  const brandNameToQuery = brandName || safeHostname(context.websiteUrl) || "the company";

  // Query AI platforms (currently only ChatGPT via OpenAI)
  // Note: Claude and Perplexity would require their respective APIs
  const platformResults: BrandConsistencyResult[] = [];

  // Query ChatGPT
  try {
    const chatgptResponse = await queryChatGPT(brandNameToQuery, context.websiteUrl || undefined);
    const chatgptAnalysis = await analyzeBrandConsistency("chatgpt", chatgptResponse, context);
    platformResults.push(chatgptAnalysis);
  } catch (error) {
    console.error("Error testing ChatGPT:", error);
    platformResults.push({
      platform: "chatgpt",
      brand_description: "Error: Could not query ChatGPT",
      accuracy_score: 0,
      key_facts_present: [],
      key_facts_missing: context.keyDifferentiators,
      misstatements: ["Unable to query ChatGPT"],
      tone_match: "poor",
      recommendations: ["Fix ChatGPT API connection"],
    });
  }

  // TODO: Add Claude and Perplexity queries when APIs are available
  // For now, we'll note that these platforms need API access
  if (platformResults.length === 0) {
    throw new Error("No AI platforms could be queried");
  }

  // Calculate summary
  const averageAccuracy =
    platformResults.reduce((sum, r) => sum + r.accuracy_score, 0) / platformResults.length;

  const allMisstatements = platformResults.flatMap((r) => r.misstatements);
  const commonMisstatements = allMisstatements
    .filter((m, i, arr) => arr.indexOf(m) !== i) // Find duplicates
    .filter((m, i, arr) => arr.indexOf(m) === i); // Remove duplicates

  const allMissingFacts = platformResults.flatMap((r) => r.key_facts_missing);
  const criticalGaps = allMissingFacts
    .filter((f, i, arr) => arr.indexOf(f) !== i) // Find duplicates (missing across multiple platforms)
    .filter((f, i, arr) => arr.indexOf(f) === i); // Remove duplicates

  const allRecommendations = platformResults.flatMap((r) => r.recommendations);
  const topRecommendations = allRecommendations
    .slice(0, 5); // Top 5 recommendations

  return {
    overall_score: averageAccuracy,
    platform_results: platformResults,
    summary: {
      average_accuracy: averageAccuracy,
      common_misstatements: commonMisstatements,
      critical_gaps: criticalGaps,
      top_recommendations: topRecommendations,
    },
  };
}
