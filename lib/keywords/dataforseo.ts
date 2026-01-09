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
      se_type?: string;
      location_code?: number;
      language_code?: string;
      seed_keyword?: string;
      items_count?: number;
      items?: Array<{
        keyword: string;
        keyword_data?: {
          keyword_info?: {
            keyword?: string;
            search_volume?: number;
            cpc?: number;
            competition?: number;
            competition_level?: string;
          };
        };
        search_volume?: number;
        cpc?: number;
        competition?: number;
        competition_level?: string;
      }>;
      // Alternative structure: items can also be directly keyword objects
      keyword?: string;
      search_volume?: number;
      cpc?: number;
      competition?: number;
      competition_level?: string;
    } | {
      // Items can also be directly in result as keyword objects
      keyword: string;
      keyword_data?: {
        keyword_info?: {
          keyword?: string;
          search_volume?: number;
          cpc?: number;
          competition?: number;
          competition_level?: string;
        };
      };
      search_volume?: number;
      cpc?: number;
      competition?: number;
      competition_level?: string;
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
 * Enrich keywords with search volume and CPC data
 * Uses the search_volume/live endpoint to get metrics for a batch of keywords
 */
async function enrichKeywordsWithMetrics(
  keywords: KeywordResult[],
  credentials: string,
  locationName: string = "United States",
  languageName: string = "English"
): Promise<{ keywords: KeywordResult[]; warnings: APIWarning[] }> {
  const warnings: APIWarning[] = [];
  
  if (keywords.length === 0) {
    return { keywords: [], warnings };
  }

  // Extract unique keyword strings (max 1000 per request per API docs)
  const keywordStrings = [...new Set(keywords.map(k => k.keyword))].slice(0, 100);
  
  console.log(`[DataForSEO] Enriching ${keywordStrings.length} keywords with search volume data...`);

  try {
    // Use search_volume/live endpoint to get metrics
    // Per docs: https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/
    const response = await fetch(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{
          keywords: keywordStrings,
          location_name: locationName,
          language_name: languageName,
        }]),
      }
    );

    if (!response.ok) {
      console.warn(`[DataForSEO] Search volume API error: ${response.status}`);
      return { keywords, warnings }; // Return original keywords without enrichment
    }

    const data = await response.json();
    
    // Track cost
    if (data.cost) {
      console.log(`[DataForSEO] Search volume API cost: ${data.cost} credits`);
      warnings.push({
        type: "cost",
        message: `DataForSEO API used ${data.cost} credits for search volume data.`,
        api: "DataForSEO"
      });
    }

    if (data.status_code !== 20000 || !data.tasks?.[0]?.result) {
      console.warn(`[DataForSEO] Search volume API returned no results`);
      return { keywords, warnings };
    }

    // Build a map of keyword -> metrics
    const metricsMap = new Map<string, { volume: number; cpc: number; competition: string; competition_index: number }>();
    
    const results = data.tasks[0].result;
    for (const item of results) {
      if (item.keyword) {
        metricsMap.set(item.keyword.toLowerCase(), {
          volume: item.search_volume || 0,
          cpc: item.cpc || 0,
          competition: item.competition_level || item.competition || "unknown",
          competition_index: item.competition_index || item.competition || 0,
        });
      }
    }

    console.log(`[DataForSEO] Got metrics for ${metricsMap.size} keywords`);

    // Enrich original keywords with metrics
    const enrichedKeywords = keywords.map(kw => {
      const metrics = metricsMap.get(kw.keyword.toLowerCase());
      if (metrics) {
        return {
          ...kw,
          volume: metrics.volume,
          cpc: metrics.cpc,
          competition: metrics.competition,
          competition_index: metrics.competition_index,
        };
      }
      return kw;
    });

    return { keywords: enrichedKeywords, warnings };
  } catch (error) {
    console.error(`[DataForSEO] Error enriching keywords:`, error);
    return { keywords, warnings }; // Return original keywords on error
  }
}

/**
 * Fetch keyword suggestions from DataForSEO API
 * Uses keyword_suggestions endpoint for broader coverage (Google Autocomplete based)
 * This endpoint has better coverage for B2B/niche terms than related_keywords
 */
async function fetchKeywordsFromAPI(
  seedKeyword: string,
  locationName: string = "United States",
  languageName: string = "English"
): Promise<{ keywords: KeywordResult[]; warnings: APIWarning[] }> {
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

  // Use keyword_suggestions endpoint - broader coverage via Google Autocomplete
  // Per docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live/
  const requestBody = [
    {
      keyword: seedKeyword,
      location_name: locationName,
      language_name: languageName,
      limit: 50, // Get suggestions
      include_seed_keyword: true, // Include the original keyword with its metrics
    },
  ];

  try {
    // Use keyword_suggestions endpoint for broader coverage
    const response = await fetch(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live",
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

    // Log full response structure for debugging
    console.log(`[DataForSEO] Full API response:`, JSON.stringify(data, null, 2).substring(0, 2000));
    console.log(`[DataForSEO] Response status_code: ${data.status_code}`);
    console.log(`[DataForSEO] Tasks count: ${data.tasks_count}, Errors: ${data.tasks_error}`);

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
    console.log(`[DataForSEO] Task status_code: ${task.status_code}, result_count: ${task.result_count}`);
    console.log(`[DataForSEO] Task has result: ${!!task.result}, result type: ${typeof task.result}, is array: ${Array.isArray(task.result)}`);
    console.log(`[DataForSEO] Task has data: ${!!task.data}, data type: ${typeof task.data}, is array: ${Array.isArray(task.data)}`);
    
    if (task.status_code !== 20000) {
      console.warn(`[DataForSEO] Task returned error code: ${task.status_code}`);
      console.warn(`[DataForSEO] Task error message: ${task.status_message}`);
      console.warn(`[DataForSEO] Task result count: ${task.result_count}`);
      console.warn(`[DataForSEO] Full task object:`, JSON.stringify(task, null, 2).substring(0, 1000));
      
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

    // Handle response structure per DataForSEO v3 documentation
    // For related_keywords/live endpoint, results are in task.result[].items[]
    // Per docs: https://docs.dataforseo.com/v3/dataforseo_labs-google-related_keywords-live/
    let items: any[] = [];
    let seedKeywordData: any = null;
    
    // Log the actual response structure for debugging
    console.log(`[DataForSEO] Parsing response structure...`);
    console.log(`[DataForSEO] Task result type: ${typeof task.result}, is array: ${Array.isArray(task.result)}, length: ${Array.isArray(task.result) ? task.result.length : 'N/A'}`);
    console.log(`[DataForSEO] Task data type: ${typeof task.data}, is array: ${Array.isArray(task.data)}, length: ${Array.isArray(task.data) ? task.data.length : 'N/A'}`);
    
    if (task.result && Array.isArray(task.result) && task.result.length > 0) {
      // task.result is an array of result objects
      // For related_keywords endpoint, typically there's one result object with items[] array
      // Per docs: task.result[0].items[] contains the related keywords
      const result = task.result[0] as any;
      console.log(`[DataForSEO] Task result[0] type: ${typeof result}`);
      console.log(`[DataForSEO] Task result[0] keys:`, result ? Object.keys(result) : 'null');
      console.log(`[DataForSEO] Task result[0].items_count: ${result?.items_count}`);
      console.log(`[DataForSEO] Task result[0].total_count: ${result?.total_count}`);
      
      // Standard structure per DataForSEO docs: result.items[] contains keyword items
      if (result && result.items) {
        if (Array.isArray(result.items)) {
          console.log(`[DataForSEO] Found items array in result[0].items with ${result.items.length} items`);
          items = result.items;
        } else if (result.items === null) {
          // API returned null for items (no related keywords found)
          console.warn(`[DataForSEO] API returned items: null, items_count: ${result.items_count || 0} - no related keywords found for this seed`);
          items = []; // Set to empty array to continue processing
        } else {
          console.warn(`[DataForSEO] result.items exists but is not an array: ${typeof result.items}`);
        }
      } else if (result && result.items_count === 0) {
        // Explicitly no items
        console.warn(`[DataForSEO] API returned items_count: 0 - no related keywords found for this seed`);
        items = [];
      }
      
      // Check for seed_keyword_data if include_seed_keyword was true
      // Per docs: seed_keyword_data contains the seed keyword data with same structure as items
      if (result && result.seed_keyword_data) {
        seedKeywordData = result.seed_keyword_data;
        console.log(`[DataForSEO] Found seed keyword data in response for: "${seedKeywordData.keyword || seedKeywordData.keyword_data?.keyword_info?.keyword || 'unknown'}"`);
      }
      
      // If we still don't have items, check if result itself contains keyword data
      if (items.length === 0 && result && result.keyword_data) {
        console.log(`[DataForSEO] No items array found, but result has keyword_data - might be a single result`);
        // This might be a single keyword result, not an array
        items = [result];
      }
    } else if (task.data && Array.isArray(task.data) && task.data.length > 0) {
      // Fallback: check task.data[].items[] structure (some endpoints use this)
      const dataObj = task.data[0] as any;
      console.log(`[DataForSEO] Checking task.data[0] structure...`);
      console.log(`[DataForSEO] Task data[0] keys:`, dataObj ? Object.keys(dataObj) : 'null');
      
      if (dataObj && dataObj.items && Array.isArray(dataObj.items)) {
        console.log(`[DataForSEO] Found items array in data[0].items with ${dataObj.items.length} items`);
        items = dataObj.items;
      } else if (dataObj && Array.isArray(dataObj)) {
        // dataObj is itself an array
        console.log(`[DataForSEO] Task data[0] is itself an array with ${dataObj.length} items`);
        items = dataObj;
      }
      
      // Check for seed_keyword_data in data object
      if (dataObj && dataObj.seed_keyword_data) {
        seedKeywordData = dataObj.seed_keyword_data;
        console.log(`[DataForSEO] Found seed keyword data in data object`);
      }
    }
    
    // Try one more structure: task.result might be directly an object (not array) with items
    if (items.length === 0 && task.result && !Array.isArray(task.result) && typeof task.result === 'object') {
      const result = task.result as any;
      console.log(`[DataForSEO] Checking task.result as object (not array)...`);
      console.log(`[DataForSEO] Task result keys:`, Object.keys(result));
      if (result.items && Array.isArray(result.items)) {
        console.log(`[DataForSEO] Found items array in result.items with ${result.items.length} items`);
        items = result.items;
      } else if (result.result && Array.isArray(result.result)) {
        // Sometimes nested: result.result[].items[]
        const nestedResult = result.result[0];
        if (nestedResult && nestedResult.items && Array.isArray(nestedResult.items)) {
          console.log(`[DataForSEO] Found items in nested result.result[0].items with ${nestedResult.items.length} items`);
          items = nestedResult.items;
        }
      }
      if (result.seed_keyword_data) {
        seedKeywordData = result.seed_keyword_data;
      }
    }
    
    // Final attempt: check if task.result_count > 0 but items are in a different path
    if (items.length === 0 && task.result_count > 0) {
      console.log(`[DataForSEO] Task has result_count: ${task.result_count} but no items found - checking alternative paths`);
      // Sometimes items are directly in task as an array or object
      if (Array.isArray(task)) {
        items = task as any[];
        console.log(`[DataForSEO] Task itself is an array with ${items.length} items`);
      }
    }
    
    // If no items found but seed keyword data exists, use that as a fallback
    if (items.length === 0 && seedKeywordData) {
      console.log(`[DataForSEO] No items found, but seed keyword data exists - using seed keyword as fallback`);
      const seedKeyword = seedKeywordData.keyword || seedKeywordData.keyword_data?.keyword_info?.keyword || "";
      if (seedKeyword) {
        items = [{
          keyword: seedKeyword,
          keyword_data: seedKeywordData.keyword_data || {
            keyword_info: seedKeywordData.keyword_info || seedKeywordData
          },
          ...seedKeywordData
        }];
      }
    }
    
    if (items.length === 0) {
      // No items found - this is normal if DataForSEO has no related keywords
      // Log for debugging but don't treat as error
      const result = task.result && Array.isArray(task.result) ? task.result[0] : null;
      const itemsCount = result?.items_count ?? 0;
      
      if (itemsCount === 0) {
        console.log(`[DataForSEO] API returned items_count: 0 - DataForSEO has no related keywords for this seed`);
        // This is not an error - just means no related keywords exist in their database
      } else {
        // This might be a parsing issue
        console.error(`[DataForSEO] ========== RESPONSE STRUCTURE DEBUG ==========`);
        console.error(`[DataForSEO] Task object keys:`, task ? Object.keys(task) : 'task is null');
        console.error(`[DataForSEO] Task result type: ${typeof task.result}, is array: ${Array.isArray(task.result)}`);
        if (result) {
          console.error(`[DataForSEO] Task result[0] keys:`, Object.keys(result));
          console.error(`[DataForSEO] Task result[0] items_count: ${result.items_count}, items type: ${typeof result.items}`);
        }
        console.error(`[DataForSEO] ===============================================`);
        
        warnings.push({
          type: "error",
          message: "DataForSEO API returned unexpected response structure. No keywords extracted.",
          api: "DataForSEO"
        });
      }
      
      // Return empty array - this is acceptable if no keywords exist
      return { keywords: [], warnings };
    }
    
    console.log(`[DataForSEO] Extracted ${items.length} items from response`);
    
    // Include seed keyword data if available (when include_seed_keyword=true)
    // Per docs: seed_keyword_data has the same structure as items (with keyword_data.keyword_info)
    if (seedKeywordData) {
      // Extract keyword from seed_keyword_data - it might be in keyword_data.keyword_info.keyword
      const seedKeyword = seedKeywordData.keyword || seedKeywordData.keyword_data?.keyword_info?.keyword || seedKeywordData.keyword_data?.keyword || "";
      console.log(`[DataForSEO] Including seed keyword data: "${seedKeyword}"`);
      
      if (seedKeyword) {
        // Add seed keyword to items if not already present
        const seedKeywordLower = seedKeyword.toLowerCase();
        const alreadyIncluded = items.some((item: any) => {
          const itemKeyword = item.keyword || item.keyword_data?.keyword_info?.keyword || item.keyword_data?.keyword || "";
          return itemKeyword.toLowerCase() === seedKeywordLower;
        });
        
        if (!alreadyIncluded) {
          // Add seed keyword data as first item - ensure it has the correct structure
          items.unshift({
            keyword: seedKeyword,
            keyword_data: seedKeywordData.keyword_data || {
              keyword_info: seedKeywordData.keyword_info || seedKeywordData
            },
            ...seedKeywordData
          });
          console.log(`[DataForSEO] Added seed keyword "${seedKeyword}" to items array`);
        } else {
          console.log(`[DataForSEO] Seed keyword "${seedKeyword}" already in items array`);
        }
      }
    }

    // Transform API response to our simplified format per DataForSEO v3 docs
    // Per documentation: items[].keyword_data.keyword_info contains the keyword data
    // Structure: { keyword: string, keyword_data: { keyword_info: { search_volume, cpc, competition_level, competition } } }
    console.log(`[DataForSEO] Processing ${items.length} items...`);
    if (items.length > 0) {
      console.log(`[DataForSEO] Sample item structure:`, JSON.stringify(items[0], null, 2).substring(0, 500));
    }
    
    const keywords: KeywordResult[] = items
      .map((item: any, index: number) => {
        // Per DataForSEO v3 docs for related_keywords endpoint:
        // - item.keyword: The keyword string
        // - item.keyword_data.keyword_info: Object with keyword metrics
        // - OR: item directly contains search_volume, cpc, etc.
        const keyword = item.keyword || "";
        
        if (!keyword) {
          console.warn(`[DataForSEO] Item ${index} has no keyword field:`, Object.keys(item));
          return null;
        }
        
        // Handle nested keyword_data.keyword_info structure per docs
        const keywordInfo = item.keyword_data?.keyword_info || {};
        
        // Extract search volume (can be null/0/undefined if not enough data)
        // Try keyword_data.keyword_info first, then item directly
        const searchVolume = keywordInfo.search_volume ?? item.search_volume ?? 0;
        // Extract CPC (can be null/0/undefined)
        const cpc = keywordInfo.cpc ?? item.cpc ?? 0;
        // Extract competition level ("low" | "medium" | "high")
        const competitionLevel = keywordInfo.competition_level || item.competition_level || item.competition_index || "unknown";
        // Extract competition index (0-1 scale, 0 = low, 1 = high)
        const competitionIndex = keywordInfo.competition ?? item.competition ?? item.competition_index ?? 0;
        
        return {
          keyword,
          volume: typeof searchVolume === 'number' ? searchVolume : 0,
          cpc: typeof cpc === 'number' ? cpc : 0,
          competition: typeof competitionLevel === 'string' ? competitionLevel : "unknown",
          competition_index: typeof competitionIndex === 'number' ? competitionIndex : 0,
        } as KeywordResult;
      })
      .filter((k): k is KeywordResult => k !== null && k !== undefined && typeof k.keyword === 'string' && k.keyword.length > 0); // Filter out nulls and empty keywords

    console.log(`[DataForSEO] Successfully fetched ${keywords.length} keywords from API`);
    
    // Track task cost if available
    if (task.cost) {
      warnings.push({
        type: "cost",
        message: `DataForSEO API used ${task.cost} credits for keyword research.`,
        api: "DataForSEO"
      });
    }
    
    // Enrich keywords with search volume and CPC data (if we have keywords with 0 volume)
    const needsEnrichment = keywords.some(k => k.volume === 0);
    if (needsEnrichment && keywords.length > 0) {
      console.log(`[DataForSEO] Keywords need enrichment - fetching search volume data...`);
      const { keywords: enrichedKeywords, warnings: enrichmentWarnings } = await enrichKeywordsWithMetrics(keywords, credentials, locationName, languageName);
      warnings.push(...enrichmentWarnings);
      return { keywords: enrichedKeywords, warnings };
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

  // Keep all keywords with valid keyword strings
  // Note: Some keywords might have volume=0 or null, which DataForSEO indicates as "not enough data"
  // We keep them but prioritize those with volume > 0 in sorting
  const validKeywords = keywords.filter(
    (k) => k.keyword && k.keyword.length > 0
  );

  console.log(`[DataForSEO] Filtering: ${keywords.length} total → ${validKeywords.length} with volume>0`);

  if (validKeywords.length === 0) {
    console.warn(`[DataForSEO] No valid keywords after filtering (all had zero volume)`);
    return [];
  }

  let sorted: KeywordResult[];

  if (funnelStage === "BOFU_DECISION") {
    // BOFU/PPC: Prioritize keywords with both high CPC AND volume (commercial intent)
    // Handle null/zero volume and CPC gracefully
    sorted = [...validKeywords].sort((a, b) => {
      const volA = a.volume || 0;
      const volB = b.volume || 0;
      const cpcA = a.cpc || 0;
      const cpcB = b.cpc || 0;
      
      // Prioritize keywords with volume > 0 first
      if ((volA > 0) !== (volB > 0)) {
        return volA > 0 ? -1 : 1;
      }
      
      // If both have volume, calculate composite score
      // Prefer keywords with both CPC and volume (commercial intent)
      const scoreA = (cpcA > 0 && volA > 0) 
        ? volA * Math.log(cpcA + 1) 
        : (volA > 0 ? volA * 0.3 : 0); // Lower score for volume-only keywords
      const scoreB = (cpcB > 0 && volB > 0) 
        ? volB * Math.log(cpcB + 1) 
        : (volB > 0 ? volB * 0.3 : 0);
      
      // If scores are close (within 20%), prioritize by volume
      if (scoreA > 0 && scoreB > 0 && Math.abs(scoreA - scoreB) / Math.max(scoreA, scoreB) < 0.2) {
        return volB - volA;
      }
      return scoreB - scoreA;
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

  // Return top 10 for PPC (more keywords to choose from), top 5 for other stages
  const maxKeywords = funnelStage === "BOFU_DECISION" ? 10 : 5;
  const topKeywords = sorted.slice(0, maxKeywords);
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
 * @param locationName - Location for keyword research (default: "United States")
 * @param languageName - Language for keyword research (default: "English")
 * @returns Object with keywords array and warnings (for admin display)
 */
export async function getStrategicKeywords(
  seed: string,
  funnelStage: string,
  locationName: string = "United States",
  languageName: string = "English"
): Promise<{ keywords: KeywordResult[]; warnings: APIWarning[] }> {
  try {
    // Extract clean seed keyword from input
    const seedKeyword = extractSeedKeyword(seed);
    console.log(`[getStrategicKeywords] Processing seed: "${seed}" → cleaned: "${seedKeyword}" for stage: ${funnelStage}`);

    // Fetch keywords from API
    const { keywords, warnings } = await fetchKeywordsFromAPI(seedKeyword, locationName, languageName);

    if (keywords.length === 0) {
      console.warn(`[getStrategicKeywords] No keywords returned from API for seed: "${seedKeyword}"`);
      console.warn(`[getStrategicKeywords] This could mean:`);
      console.warn(`  - Seed keyword is too niche/specific (no related keywords in DataForSEO database)`);
      console.warn(`  - Seed keyword is misspelled or invalid`);
      console.warn(`  - API returned empty results`);
      return { keywords: [], warnings };
    }

    console.log(`[getStrategicKeywords] API returned ${keywords.length} keywords for seed: "${seedKeyword}"`);

    // Apply strategic filtering based on funnel stage
    const filtered = filterKeywordsByStage(keywords, funnelStage);
    console.log(`[getStrategicKeywords] Filtered ${keywords.length} keywords to ${filtered.length} strategic keywords for ${funnelStage}`);
    
    if (filtered.length === 0 && keywords.length > 0) {
      console.warn(`[getStrategicKeywords] All ${keywords.length} keywords were filtered out by stage logic`);
      console.warn(`[getStrategicKeywords] Sample keywords that were filtered:`, keywords.slice(0, 3).map(k => `${k.keyword} (Vol: ${k.volume}, CPC: $${k.cpc})`));
    }
    
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
