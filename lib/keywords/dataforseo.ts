/**
 * DataForSEO Keyword Research Service
 * 
 * Provides "Just-in-Time" keyword research for content briefs.
 * Fetches strategic keywords based on funnel stage:
 * - BOFU: Prioritizes high CPC (commercial intent)
 * - TOFU: Prioritizes high search volume (awareness)
 */

interface KeywordResult {
  keyword: string;
  volume: number;
  cpc: number;
  competition: string; // "low", "medium", "high"
  competition_index?: number; // 0-1 scale (optional)
}

export interface APIWarning {
  type: "cost" | "credits" | "rate_limit" | "auth" | "error";
  message: string;
  api: "DataForSEO" | "Jina" | "OpenAI";
}

interface DataForSEOResponse {
  version: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    result_count: number;
    path: string[];
    data?: {
      se_type: string;
      location_code: number;
      language_code: string;
      seed_keyword: string;
      items_count: number;
      items: Array<{
        keyword: string;
        location_code?: number;
        language_code?: string;
        search_volume: number;
        competition?: number; // 0-1 scale
        competition_level?: string; // "low", "medium", "high"
        cpc: number;
        monthly_searches?: Array<{
          year: number;
          month: number;
          search_volume: number;
        }>;
        keyword_data?: {
          keyword_info?: {
            search_volume?: number;
            cpc?: number;
            competition?: number;
            competition_level?: string;
            keyword?: string;
          };
        };
      }>;
    }[];
    result?: Array<{
      keyword: string;
      search_volume: number;
      cpc: number;
      competition?: number;
      competition_level?: string;
      keyword_data?: {
        keyword_info?: {
          search_volume?: number;
          cpc?: number;
          competition?: number;
          competition_level?: string;
          keyword?: string;
        };
      };
    }>;
  }>;
}

/**
 * Extract seed keyword from content idea title/topic
 * Simple preprocessing: takes first few meaningful words
 */
function extractSeedKeyword(titleOrTopic: string): string {
  // Remove common stop words and take first 3-5 meaningful words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
  ]);

  const words = titleOrTopic
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 0 && !stopWords.has(word))
    .slice(0, 5); // Take up to 5 meaningful words

  return words.join(' ') || titleOrTopic.toLowerCase().slice(0, 50);
}

/**
 * Fetch related keywords from DataForSEO API
 */
async function fetchKeywordsFromAPI(seedKeyword: string): Promise<{ keywords: KeywordResult[]; warnings: APIWarning[] }> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  const warnings: APIWarning[] = [];

  if (!login || !password) {
    console.warn('[DataForSEO] Credentials not configured. Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD. Skipping keyword research.');
    warnings.push({
      type: "auth",
      message: "DataForSEO credentials not configured. Keyword research skipped.",
      api: "DataForSEO"
    });
    return { keywords: [], warnings };
  }

  console.log(`[DataForSEO] Fetching keywords for seed: "${seedKeyword}"`);

  // Base64 encode credentials for Basic Auth
  const credentials = Buffer.from(`${login}:${password}`).toString('base64');

  // Build request body following DataForSEO API v3 best practices
  // Using location_name and language_name for better readability
  // Adding filters and order_by to optimize results
  const requestBody = [
    {
      keyword: seedKeyword,
      location_name: "United States", // More readable than location_code
      language_name: "English",
      depth: 1, // Can go up to 4 for more keywords, but 1 is sufficient for our use case
      limit: 20, // Request more to have better selection after filtering
      include_seed_keyword: true,
      // Filter to only get keywords with search volume > 0
      filters: [
        ["keyword_data.keyword_info.search_volume", ">", 0]
      ],
      // Pre-sort by search volume descending for better results
      order_by: ["keyword_data.keyword_info.search_volume,desc"]
    },
  ];

  try {
    // Using the correct endpoint per DataForSEO v3 documentation
    const response = await fetch(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    // Check rate limits from headers
    const rateLimitLimit = response.headers.get("X-RateLimit-Limit");
    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
    if (rateLimitLimit && rateLimitRemaining) {
      const remaining = parseInt(rateLimitRemaining);
      const limit = parseInt(rateLimitLimit);
      console.log(`[DataForSEO] Rate limit: ${remaining}/${limit} remaining`);
      
      // Warn admins if rate limit is getting low (< 20% remaining)
      if (remaining < limit * 0.2) {
        warnings.push({
          type: "rate_limit",
          message: `DataForSEO rate limit low: ${remaining}/${limit} requests remaining. Consider monitoring usage.`,
          api: "DataForSEO"
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DataForSEO] API HTTP error: ${response.status} ${response.statusText}`);
      console.error(`[DataForSEO] Error response: ${errorText.substring(0, 500)}`);
      
      warnings.push({
        type: "error",
        message: `DataForSEO API error: ${response.status} ${response.statusText}. Keyword research unavailable.`,
        api: "DataForSEO"
      });
      
      return { keywords: [], warnings };
    }

    const data: DataForSEOResponse = await response.json();

    // Track API cost for admin warnings
    if (data.cost) {
      console.log(`[DataForSEO] API cost: ${data.cost} credits`);
      warnings.push({
        type: "cost",
        message: `DataForSEO API used ${data.cost} credits for this request.`,
        api: "DataForSEO"
      });
    }

    // Handle API errors (credits, rate limits, etc.)
    // Status code 20000 = success per DataForSEO documentation
    if (data.status_code !== 20000 || !data.tasks || data.tasks.length === 0) {
      console.warn(`[DataForSEO] API returned error code: ${data.status_code}`);
      console.warn(`[DataForSEO] Error message: ${data.status_message}`);
      console.warn(`[DataForSEO] Tasks count: ${data.tasks_count}, Errors: ${data.tasks_error}`);
      
      // Common error codes per DataForSEO docs
      if (data.status_code === 40100) {
        console.error(`[DataForSEO] Authentication failed - check credentials`);
        warnings.push({
          type: "auth",
          message: "DataForSEO authentication failed. Check API credentials.",
          api: "DataForSEO"
        });
      } else if (data.status_code === 40200) {
        console.error(`[DataForSEO] Insufficient credits - add credits to your account`);
        warnings.push({
          type: "credits",
          message: "DataForSEO account has insufficient credits. Add credits to continue keyword research.",
          api: "DataForSEO"
        });
      } else if (data.status_code === 40001) {
        console.error(`[DataForSEO] Invalid parameter - check request format`);
        warnings.push({
          type: "error",
          message: "DataForSEO API error: Invalid request parameters.",
          api: "DataForSEO"
        });
      } else {
        warnings.push({
          type: "error",
          message: `DataForSEO API error (code ${data.status_code}): ${data.status_message || "Unknown error"}`,
          api: "DataForSEO"
        });
      }
      
      return { keywords: [], warnings };
    }

    const task = data.tasks[0];
    if (task.status_code !== 20000) {
      console.warn(`[DataForSEO] Task returned error code: ${task.status_code}`);
      console.warn(`[DataForSEO] Task error message: ${task.status_message}`);
      console.warn(`[DataForSEO] Task result count: ${task.result_count}`);
      
      // Log task cost
      if (task.cost) {
        console.log(`[DataForSEO] Task cost: ${task.cost} credits`);
        warnings.push({
          type: "cost",
          message: `DataForSEO task cost: ${task.cost} credits (task failed)`,
          api: "DataForSEO"
        });
      }
      
      warnings.push({
        type: "error",
        message: `DataForSEO task error (code ${task.status_code}): ${task.status_message || "Task failed"}`,
        api: "DataForSEO"
      });
      
      return { keywords: [], warnings };
    }

    // Handle response structure - check both task.data and task.result
    // Per docs, results can be in either location depending on endpoint
    let items: any[] = [];
    if (task.data && task.data.length > 0 && task.data[0].items) {
      items = task.data[0].items;
    } else if (task.result && Array.isArray(task.result)) {
      // Alternative response structure where results are in task.result array
      items = task.result;
    } else {
      console.warn(`[DataForSEO] Unexpected response structure - no items found`);
      console.warn(`[DataForSEO] Task data keys: ${task.data ? Object.keys(task.data[0] || {}) : 'no data'}`);
      
      warnings.push({
        type: "error",
        message: "DataForSEO API returned unexpected response structure. No keywords extracted.",
        api: "DataForSEO"
      });
      
      return { keywords: [], warnings };
    }

    // Transform API response to our simplified format
    // Handle different possible response structures from DataForSEO API
    const keywords = items
      .map((item: any) => {
        // Handle nested keyword_data structure (some endpoints return this)
        const keywordData = item.keyword_data?.keyword_info || item;
        const keywordInfo = keywordData.keyword_info || keywordData;
        
        return {
          keyword: item.keyword || keywordData.keyword || "",
          volume: keywordInfo?.search_volume || item.search_volume || 0,
          cpc: keywordInfo?.cpc || item.cpc || 0,
          competition: keywordInfo?.competition_level || item.competition_level || "low",
          competition_index: keywordInfo?.competition || item.competition || 0, // 0-1 scale
        };
      })
      .filter((k: any) => k.keyword && k.volume > 0); // Filter out invalid entries

    console.log(`[DataForSEO] Successfully fetched ${keywords.length} keywords from API`);
    
    // Track task cost if available
    if (task.cost) {
      warnings.push({
        type: "cost",
        message: `DataForSEO API used ${task.cost} credits for keyword research.`,
        api: "DataForSEO"
      });
    }
    
    return { keywords, warnings };
  } catch (error) {
    console.error("[DataForSEO] Request failed:", error);
    
    const warnings: APIWarning[] = [{
      type: "error",
      message: `DataForSEO API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      api: "DataForSEO"
    }];
    
    // Don't crash the app - return empty array on error
    return { keywords: [], warnings };
  }
}

/**
 * Strategic keyword filtering based on funnel stage
 * 
 * BOFU (Decision): Prioritize high CPC (commercial intent)
 * TOFU (Awareness): Prioritize high search volume
 * MOFU (Consideration): Balanced approach
 */
function filterKeywordsByStage(
  keywords: KeywordResult[],
  funnelStage: string
): KeywordResult[] {
  if (keywords.length === 0) {
    console.log(`[DataForSEO] No keywords to filter for stage: ${funnelStage}`);
    return [];
  }

  // Remove keywords with zero volume or zero CPC
  const validKeywords = keywords.filter(
    (k) => k.volume > 0 && k.cpc > 0
  );

  console.log(`[DataForSEO] Filtering: ${keywords.length} total → ${validKeywords.length} with volume>0 & CPC>0`);

  if (validKeywords.length === 0) {
    console.warn(`[DataForSEO] No valid keywords after filtering (all had zero volume or CPC)`);
    return [];
  }

  let sorted: KeywordResult[];

  if (funnelStage === "BOFU_DECISION") {
    // BOFU: Prioritize CPC (commercial intent)
    sorted = [...validKeywords].sort((a, b) => {
      // First by CPC (descending), then by volume as tiebreaker
      if (Math.abs(a.cpc - b.cpc) > 0.5) {
        return b.cpc - a.cpc;
      }
      return b.volume - a.volume;
    });
  } else if (funnelStage === "TOFU_AWARENESS") {
    // TOFU: Prioritize search volume
    sorted = [...validKeywords].sort((a, b) => {
      // First by volume (descending), then by CPC as tiebreaker
      if (Math.abs(a.volume - b.volume) > 100) {
        return b.volume - a.volume;
      }
      return b.cpc - a.cpc;
    });
  } else {
    // MOFU/RETENTION: Balanced approach (volume * CPC score)
    sorted = [...validKeywords].sort((a, b) => {
      const scoreA = a.volume * Math.log(a.cpc + 1);
      const scoreB = b.volume * Math.log(b.cpc + 1);
      return scoreB - scoreA;
    });
  }

  // Return top 5
  const topKeywords = sorted.slice(0, 5);
  console.log(`[DataForSEO] Strategy applied for ${funnelStage}: Selected top ${topKeywords.length} keywords`);
  if (topKeywords.length > 0) {
    console.log(`[DataForSEO] Top keyword: "${topKeywords[0].keyword}" (Vol: ${topKeywords[0].volume}, CPC: $${topKeywords[0].cpc.toFixed(2)})`);
  }
  return topKeywords;
}

/**
 * Main function: Get strategic keywords for content brief
 * 
 * @param seed - Seed keyword or content idea title/topic
 * @param funnelStage - Funnel stage (TOFU_AWARENESS, MOFU_CONSIDERATION, BOFU_DECISION, RETENTION)
 * @returns Object with keywords array and warnings (for admin display)
 */
export async function getStrategicKeywords(
  seed: string,
  funnelStage: string
): Promise<{ keywords: KeywordResult[]; warnings: APIWarning[] }> {
  try {
    // Extract clean seed keyword from input
    const seedKeyword = extractSeedKeyword(seed);
    console.log(`[getStrategicKeywords] Processing seed: "${seed}" → cleaned: "${seedKeyword}" for stage: ${funnelStage}`);

    // Fetch keywords from API
    const { keywords, warnings } = await fetchKeywordsFromAPI(seedKeyword);

    if (keywords.length === 0) {
      console.log(`[getStrategicKeywords] No keywords returned from API - will use AI-generated SEO guidance instead`);
      return { keywords: [], warnings };
    }

    // Apply strategic filtering based on funnel stage
    const filtered = filterKeywordsByStage(keywords, funnelStage);
    console.log(`[getStrategicKeywords] Filtered ${keywords.length} keywords to ${filtered.length} strategic keywords for ${funnelStage}`);
    return { keywords: filtered, warnings };
  } catch (error) {
    console.error("[getStrategicKeywords] Error:", error);
    
    const warnings: APIWarning[] = [{
      type: "error",
      message: `Keyword research error: ${error instanceof Error ? error.message : "Unknown error"}`,
      api: "DataForSEO"
    }];
    
    // Return empty array on error - don't crash the app
    return { keywords: [], warnings };
  }
}

// Export types for use in other files
export type { KeywordResult };
