import * as cheerio from "cheerio";
import { 
  generateSeoAudit, 
  type SeoAuditContext, 
  type PageAnalysis, 
  type DataQualityInput, 
  type SearchQueryData 
} from "@/lib/ai/seo-audit";
import { testBrandConsistency } from "@/lib/ai/brand-consistency";
import { prisma } from "@/lib/prisma";

const JINA_READER_URL = "https://r.jina.ai";
const JINA_API_KEY = process.env.JINA_API_KEY;
const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

// Simple in-memory cache with max size (URL -> { result, timestamp })
const cache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_SIZE = 100; // Prevent unbounded memory growth

/**
 * Stable JSON stringify for cache keys - ensures consistent key ordering
 */
function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => `"${k}":${stableStringify(obj[k])}`).join(",") + "}";
}

/**
 * Prune cache if it exceeds max size (LRU-style: remove oldest entries)
 */
function pruneCache(): void {
  if (cache.size <= CACHE_MAX_SIZE) return;
  
  // Convert to array, sort by timestamp, remove oldest
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  
  const toRemove = entries.slice(0, cache.size - CACHE_MAX_SIZE);
  for (const [key] of toRemove) {
    cache.delete(key);
  }
}

/**
 * Normalize URL (add protocol if missing)
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }
  return normalized;
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
 * Find account by URL domain - tries to match URL hostname against BrandContext.websiteUrl or Account.website
 * Returns accountId if found, null otherwise
 */
async function findAccountByUrl(url: string): Promise<string | null> {
  try {
    const hostname = safeHostname(url);
    if (!hostname) return null;

    // First, try exact match against all BrandContexts with websiteUrl
    const allBrandContexts = await prisma.brandContext.findMany({
      where: {
        websiteUrl: {
          not: null,
        },
      },
      select: {
        accountId: true,
        websiteUrl: true,
      },
    });

    // Exact match first
    for (const bc of allBrandContexts) {
      if (bc.websiteUrl) {
        const bcHostname = safeHostname(bc.websiteUrl);
        if (bcHostname === hostname) {
          return bc.accountId;
        }
      }
    }

    // Try partial match - check if hostname contains or is contained in website URL
    // This handles cases like blog.example.com matching example.com
    for (const bc of allBrandContexts) {
      if (bc.websiteUrl) {
        const bcHostname = safeHostname(bc.websiteUrl);
        if (bcHostname && (hostname.includes(bcHostname) || bcHostname.includes(hostname))) {
          return bc.accountId;
        }
      }
    }

    // Fallback: Try to find Account with matching website
    const allAccounts = await prisma.account.findMany({
      where: {
        website: {
          not: null,
        },
      },
      select: {
        id: true,
        website: true,
      },
    });

    for (const account of allAccounts) {
      if (account.website) {
        const accountHostname = safeHostname(account.website);
        if (accountHostname === hostname || (accountHostname && (hostname.includes(accountHostname) || accountHostname.includes(hostname)))) {
          return account.id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding account by URL:", error);
    return null;
  }
}

/**
 * Fetch content from Jina Reader with retry logic
 */
async function fetchJinaContent(url: string, retries = 2): Promise<string> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set");
  }

  const normalizedUrl = normalizeUrl(url);
  const jinaUrl = `${JINA_READER_URL}/${normalizedUrl}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(jinaUrl, {
        headers: {
          Authorization: `Bearer ${JINA_API_KEY}`,
          Accept: "text/plain",
          "X-With-Generated-Alt": "true",
        },
        // Add timeout
        signal: AbortSignal.timeout(30000), // 30 seconds
      });

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          // Rate limited - wait and retry
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
          continue;
        }
        throw new Error(`Jina API error: ${response.status} - ${response.statusText}`);
      }

      const content = await response.text();

      if (!content || content.trim().length < 50) {
        throw new Error("Could not extract meaningful content from the website");
      }

      return content;
    } catch (error) {
      if (attempt === retries) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch from Jina: ${error.message}`);
        }
        throw new Error("Failed to fetch from Jina: Unknown error");
      }
      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw new Error("Failed to fetch from Jina after retries");
}

/**
 * Fetch raw HTML from URL
 */
async function fetchHtml(url: string): Promise<string> {
  const normalizedUrl = normalizeUrl(url);

  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SEOAuditBot/1.0)",
      },
      signal: AbortSignal.timeout(15000), // 15 seconds
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} - ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch HTML: ${error.message}`);
    }
    throw new Error("Failed to fetch HTML: Unknown error");
  }
}

/**
 * Count words in text content
 */
function countWords(text: string): number {
  return text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

/**
 * Parse DOM and extract structured data
 */
function parseDom(html: string, pageUrl: string): PageAnalysis["domData"] {
  const $ = cheerio.load(html);

  // Extract title
  const title = $("title").first().text().trim() || null;

  // Extract meta description
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || null;

  // Extract canonical
  const canonical =
    $('link[rel="canonical"]').attr("href")?.trim() || null;

  // Extract robots meta variants
  const robotsMeta =
    $('meta[name="robots"]').attr("content")?.trim() || null;
  const googlebotMeta =
    $('meta[name="googlebot"]').attr("content")?.trim() || null;
  const bingbotMeta =
    $('meta[name="bingbot"]').attr("content")?.trim() || null;

  // Extract viewport meta
  const viewport =
    $('meta[name="viewport"]').attr("content")?.trim() || null;

  // Extract Open Graph tags
  const openGraph = {
    title: $('meta[property="og:title"]').attr("content")?.trim() || null,
    description: $('meta[property="og:description"]').attr("content")?.trim() || null,
    image: $('meta[property="og:image"]').attr("content")?.trim() || null,
    url: $('meta[property="og:url"]').attr("content")?.trim() || null,
    type: $('meta[property="og:type"]').attr("content")?.trim() || null,
    siteName: $('meta[property="og:site_name"]').attr("content")?.trim() || null,
  };

  // Extract Twitter Card tags
  const twitterCard = {
    card: $('meta[name="twitter:card"]').attr("content")?.trim() || null,
    title: $('meta[name="twitter:title"]').attr("content")?.trim() || null,
    description: $('meta[name="twitter:description"]').attr("content")?.trim() || null,
    image: $('meta[name="twitter:image"]').attr("content")?.trim() || null,
    site: $('meta[name="twitter:site"]').attr("content")?.trim() || null,
    creator: $('meta[name="twitter:creator"]').attr("content")?.trim() || null,
  };

  // Extract hreflang tags for international SEO
  const hreflangTags: Array<{ hreflang: string; href: string }> = [];
  $('link[rel="alternate"][hreflang]').each((_: number, el: cheerio.Element) => {
    const hreflang = $(el).attr("hreflang")?.trim();
    const href = $(el).attr("href")?.trim();
    if (hreflang && href) {
      hreflangTags.push({ hreflang, href });
    }
  });

  // Extract headings (H1-H3)
  const headings: Array<{ level: number; text: string }> = [];
  $("h1, h2, h3").each((_: number, el: cheerio.Element) => {
    const tag = ((el as any).tagName || (el as any).name || "").toLowerCase();
    const level = tag && /^h[1-6]$/.test(tag) ? parseInt(tag.slice(1), 10) : 0;
    const text = $(el).text().trim();
    if (text && level) {
      headings.push({ level, text });
    }
  });

  // Calculate word count from body text
  const bodyText = $("body").text() || "";
  const wordCount = countWords(bodyText);

  const internalLinks: Array<{ href: string; anchorText: string }> = [];
  const externalLinks: Array<{ href: string; anchorText: string }> = [];

  // Resolve relative URLs against the actual page URL (not a placeholder).
  const normalizedPageUrl = normalizeUrl(pageUrl);
  let pageHostname = "";
  try {
    pageHostname = new URL(normalizedPageUrl).hostname.replace(/^www\./, "");
  } catch {
    pageHostname = "";
  }

  const baseHref = $("base").attr("href") || "";
  let baseForResolve = normalizedPageUrl;
  try {
    baseForResolve = baseHref ? new URL(baseHref, normalizedPageUrl).toString() : normalizedPageUrl;
  } catch {
    baseForResolve = normalizedPageUrl;
  }

  $("a[href]").each((_: number, el: cheerio.Element) => {
    const hrefRaw = $(el).attr("href");
    if (!hrefRaw) return;

    // Anchor text can be empty for icon links; fall back to aria-label/title.
    const anchorText =
      $(el).text().trim() ||
      $(el).attr("aria-label")?.trim() ||
      $(el).attr("title")?.trim() ||
      "";

    // Ignore non-navigational schemes.
    const href = hrefRaw.trim();
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }

    try {
      const resolved = new URL(href, baseForResolve);
      const hrefNormalized = resolved.toString();
      const linkHostname = resolved.hostname.replace(/^www\./, "");
      const isInternal = !!pageHostname && linkHostname === pageHostname;

      if (isInternal) {
        internalLinks.push({ href: hrefNormalized, anchorText });
      } else {
        externalLinks.push({ href: hrefNormalized, anchorText });
      }
    } catch {
      // If parsing fails but it is clearly a relative path, treat as internal.
      if (href.startsWith("/") || href.startsWith("./") || href.startsWith("../") || href.startsWith("#")) {
        internalLinks.push({ href, anchorText });
      }
    }
  });

  // Extract images with extended data
  const images: PageAnalysis["domData"]["images"] = [];
  let imagesWithoutAlt = 0;
  let imagesWithoutDimensions = 0;

  $("img").each((_: number, el: cheerio.Element) => {
    const $el = $(el);
    const src = $el.attr("src") || $el.attr("data-src") || $el.attr("data-lazy-src") || null;
    const alt = $el.attr("alt") || null;
    const width = $el.attr("width") || null;
    const height = $el.attr("height") || null;
    const loading = $el.attr("loading") || null;
    const srcset = $el.attr("srcset") || $el.attr("data-srcset") || null;
    
    // Check for lazy loading patterns
    const hasLazySrc = !!($el.attr("data-src") || $el.attr("data-lazy-src") || $el.attr("data-srcset"));

    if (src) {
      images.push({
        src,
        alt,
        width,
        height,
        loading,
        hasLazySrc,
        srcset,
      });

      if (!alt || alt.trim() === "") {
        imagesWithoutAlt++;
      }
      if (!width || !height) {
        imagesWithoutDimensions++;
      }
    }
  });

  // Extract JSON-LD schema blocks
  const schemaJsonLd: Array<Record<string, any>> = [];
  let schemaParseErrors = 0;
  
  $('script[type="application/ld+json"]').each((_: number, el: cheerio.Element) => {
    try {
      const content = $(el).html();
      if (content) {
        const parsed = JSON.parse(content);
        schemaJsonLd.push(parsed);
      }
    } catch {
      // Invalid JSON-LD - count as error
      schemaParseErrors++;
    }
  });

  return {
    title,
    metaDescription,
    canonical,
    robotsMeta,
    googlebotMeta,
    bingbotMeta,
    viewport,
    openGraph,
    twitterCard,
    hreflangTags,
    headings,
    wordCount,
    internalLinks,
    externalLinks,
    images,
    imagesWithoutAlt,
    imagesWithoutDimensions,
    schemaJsonLd,
    schemaParseErrors,
  };
}

/**
 * Fetch related search queries from DataForSEO
 * Uses keyword_suggestions endpoint to find what users are actually searching for
 */
async function fetchSearchQueries(
  seedKeyword: string,
  locationName: string = "United States",
  languageName: string = "English"
): Promise<{ queries: SearchQueryData[]; available: boolean }> {
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    console.log("[SEO Audit] DataForSEO credentials not configured - skipping search query research");
    return { queries: [], available: false };
  }

  console.log(`[SEO Audit] Fetching search queries for: "${seedKeyword}"`);

  const credentials = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString("base64");

  try {
    // Use keyword_suggestions for broader coverage
    const response = await fetch(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keyword: seedKeyword,
            location_name: locationName,
            language_name: languageName,
            limit: 30, // Get top 30 related queries
            include_seed_keyword: true,
          },
        ]),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      console.warn(`[SEO Audit] DataForSEO API error: ${response.status}`);
      return { queries: [], available: true }; // Available but failed
    }

    const data = await response.json();
    
    if (data.status_code !== 20000) {
      console.warn(`[SEO Audit] DataForSEO returned error: ${data.status_message}`);
      return { queries: [], available: true };
    }

    const task = data.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      console.warn("[SEO Audit] DataForSEO task failed");
      return { queries: [], available: true };
    }

    // Extract items from various response structures
    let items: any[] = [];
    if (task.result?.[0]?.items) {
      items = task.result[0].items;
    } else if (task.data?.[0]?.items) {
      items = task.data[0].items;
    }

    if (!items || items.length === 0) {
      console.log("[SEO Audit] No related queries found");
      return { queries: [], available: true };
    }

    // Transform to our format, prioritizing by search volume
    const queries: SearchQueryData[] = items
      .map((item: any) => {
        const keyword = item.keyword || item.keyword_data?.keyword_info?.keyword;
        const searchVolume = item.search_volume ?? item.keyword_data?.keyword_info?.search_volume ?? 0;
        const cpc = item.cpc ?? item.keyword_data?.keyword_info?.cpc ?? 0;
        const competition = item.competition_level ?? item.keyword_data?.keyword_info?.competition_level ?? "unknown";
        
        if (!keyword) return null;
        
        return {
          query: keyword,
          searchVolume,
          cpc,
          competition,
          isQuestion: /^(what|how|why|when|where|who|which|can|do|does|is|are|should|would|could)\s/i.test(keyword),
        };
      })
      .filter((q: SearchQueryData | null): q is SearchQueryData => q !== null)
      .sort((a: SearchQueryData, b: SearchQueryData) => b.searchVolume - a.searchVolume)
      .slice(0, 20); // Top 20 by volume

    console.log(`[SEO Audit] Found ${queries.length} related search queries`);
    if (queries.length > 0) {
      console.log(`[SEO Audit] Top query: "${queries[0].query}" (${queries[0].searchVolume} monthly searches)`);
    }

    return { queries, available: true };
  } catch (error) {
    console.error("[SEO Audit] Error fetching search queries:", error);
    return { queries: [], available: true }; // Service available but request failed
  }
}

/**
 * Extract a seed keyword from page content for search query research
 */
function extractSeedKeyword(
  title: string | null,
  h1: string | null,
  targetKeyword?: string
): string {
  // Priority: user-provided target keyword > H1 > title
  if (targetKeyword && targetKeyword.trim()) {
    return targetKeyword.trim();
  }
  
  if (h1 && h1.trim()) {
    // Clean up H1 - remove common patterns
    let cleaned = h1.trim()
      .replace(/^(how to|guide to|the ultimate|complete guide|everything about)\s*/i, "")
      .replace(/\s*(\|.*|\-.*|:.*|–.*)$/, "") // Remove suffix separators
      .trim();
    if (cleaned.length > 3 && cleaned.length < 80) {
      return cleaned;
    }
  }
  
  if (title && title.trim()) {
    // Clean up title - remove site name suffixes
    let cleaned = title.trim()
      .replace(/\s*(\|.*|\-.*|–.*|::.*)$/, "")
      .trim();
    if (cleaned.length > 3 && cleaned.length < 80) {
      return cleaned;
    }
  }
  
  return "";
}

/**
 * Main SEO audit service
 */
export interface AuditOptions {
  url: string;
  context?: SeoAuditContext;
  enableSiteCrawl?: boolean; // Not implemented in Phase 1
  accountId?: string; // Required for brand consistency analysis
  includeBrandConsistency?: boolean; // Whether to include brand consistency analysis
  includeSearchQueries?: boolean; // Whether to fetch related search queries from DataForSEO
  location?: string; // Location for search query research (default: "United States")
  language?: string; // Language for search query research (default: "English")
}

export interface AuditResult {
  success: boolean;
  data?: any;
  errors?: Array<{ stage: "jina" | "fetch" | "parse" | "analyze"; message: string }>;
}

/**
 * Create empty DOM data structure for fallback scenarios
 */
function createEmptyDomData(): PageAnalysis["domData"] {
  return {
    title: null,
    metaDescription: null,
    canonical: null,
    robotsMeta: null,
    googlebotMeta: null,
    bingbotMeta: null,
    viewport: null,
    openGraph: {
      title: null,
      description: null,
      image: null,
      url: null,
      type: null,
      siteName: null,
    },
    twitterCard: {
      card: null,
      title: null,
      description: null,
      image: null,
      site: null,
      creator: null,
    },
    hreflangTags: [],
    headings: [],
    wordCount: 0,
    internalLinks: [],
    externalLinks: [],
    images: [],
    imagesWithoutAlt: 0,
    imagesWithoutDimensions: 0,
    schemaJsonLd: [],
    schemaParseErrors: 0,
  };
}

export async function auditSeoPage(
  options: AuditOptions
): Promise<AuditResult> {
  const { url, context } = options;
  const errors: Array<{ stage: "jina" | "fetch" | "parse" | "analyze"; message: string }> = [];

  // Track data quality throughout the pipeline
  const dataQuality: DataQualityInput = {
    htmlAvailable: false,
    jinaContentLength: 0,
    domParseSuccess: false,
    contentTruncated: false,
    limitations: [],
  };

  // Check cache with stable key
  const cacheKey = `${url}-${stableStringify(context || {})}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { success: true, data: cached.result };
  }

  try {
    // Step 1: Fetch Jina content
    let jinaContent: string;
    try {
      jinaContent = await fetchJinaContent(url);
      dataQuality.jinaContentLength = jinaContent.length;
    } catch (error) {
      errors.push({
        stage: "jina",
        message: error instanceof Error ? error.message : "Failed to fetch from Jina",
      });
      dataQuality.limitations.push("Jina content fetch failed");
      throw error;
    }

    // Step 2: Fetch raw HTML
    let html: string;
    try {
      html = await fetchHtml(url);
      dataQuality.htmlAvailable = true;
    } catch (error) {
      errors.push({
        stage: "fetch",
        message: error instanceof Error ? error.message : "Failed to fetch HTML",
      });
      dataQuality.limitations.push("HTML fetch failed - structure analysis limited");
      // Continue with Jina content only if HTML fetch fails
      html = "";
    }

    // Step 3: Parse DOM
    let domData: PageAnalysis["domData"];
    try {
      if (html) {
        domData = parseDom(html, url);
        dataQuality.domParseSuccess = true;
      } else {
        // Fallback if HTML fetch failed
        domData = createEmptyDomData();
        errors.push({
          stage: "parse",
          message: "HTML fetch failed, using Jina content only",
        });
      }
    } catch (error) {
      errors.push({
        stage: "parse",
        message: error instanceof Error ? error.message : "Failed to parse DOM",
      });
      dataQuality.limitations.push("DOM parse failed - structure analysis unavailable");
      // Use minimal DOM data
      domData = createEmptyDomData();
    }

    // Step 4: Fetch search queries (if enabled)
    let searchQueries: import("@/lib/ai/seo-audit").SearchQueryData[] = [];
    if (options.includeSearchQueries !== false) { // Default to true
      try {
        // Extract seed keyword from page content
        const h1Text = domData.headings.find(h => h.level === 1)?.text || null;
        const seedKeyword = extractSeedKeyword(domData.title, h1Text, context?.target_keyword);
        
        if (seedKeyword) {
          console.log(`[SEO Audit] Using seed keyword: "${seedKeyword}"`);
          const queryResult = await fetchSearchQueries(
            seedKeyword,
            options.location || "United States",
            options.language || "English"
          );
          searchQueries = queryResult.queries;
          
          if (!queryResult.available) {
            dataQuality.limitations.push("DataForSEO not configured - using inferred primary query");
          } else if (searchQueries.length === 0) {
            dataQuality.limitations.push("No related search queries found for this topic");
          }
        } else {
          console.log("[SEO Audit] Could not extract seed keyword from page content");
          dataQuality.limitations.push("Could not extract seed keyword - using inferred primary query");
        }
      } catch (error) {
        console.error("[SEO Audit] Error fetching search queries:", error);
        // Continue without search queries - not a critical failure
      }
    }

    // Step 5: Generate audit with AI
    const analysis: PageAnalysis = {
      jinaContent,
      html,
      domData,
    };

    let auditResult: Awaited<ReturnType<typeof generateSeoAudit>>;
    try {
      auditResult = await generateSeoAudit(url, analysis, context, dataQuality, searchQueries);
    } catch (error) {
      errors.push({
        stage: "analyze",
        message: error instanceof Error ? error.message : "Failed to generate audit",
      });
      throw error;
    }

    // Add brand consistency analysis if requested
    // IMPORTANT: Brand consistency only runs for URLs that match an account in the database.
    // For third-party URLs (like analyzing a competitor's blog), we skip brand consistency
    // because we don't have their canonical brand context to compare against.
    if (options.includeBrandConsistency) {
      try {
        // Try to find account from URL - only run brand consistency if we find a matching account
        const accountIdForBrandCheck = await findAccountByUrl(url);
        
        if (accountIdForBrandCheck) {
          console.log(`[SEO Audit] Found account ${accountIdForBrandCheck} for URL ${url} based on domain match - running brand consistency`);
          const brandConsistency = await testBrandConsistency(accountIdForBrandCheck);
          auditResult.brand_consistency = brandConsistency;
        } else {
          // No matching account found - this is a third-party URL
          // Skip brand consistency (don't fallback to user's selected account)
          console.log(`[SEO Audit] No matching account found for URL ${url} - skipping brand consistency (third-party URL)`);
          // Add informational note (not an error, just info)
          auditResult.brand_consistency_skipped = {
            reason: "third_party_url",
            message: "Brand consistency analysis skipped. This URL does not match any account in your system. Brand consistency is only available when auditing your own website URLs.",
          };
        }
      } catch (error) {
        console.error("Error generating brand consistency analysis:", error);
        errors.push({
          stage: "analyze",
          message: `Brand consistency analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
        // Continue without brand consistency if it fails
      }
    }

    // Add any errors that occurred during processing
    if (errors.length > 0) {
      auditResult.errors = [...(auditResult.errors || []), ...errors];
    }

    // Cache the result and prune if needed
    cache.set(cacheKey, {
      result: auditResult,
      timestamp: Date.now(),
    });
    pruneCache();

    return {
      success: true,
      data: auditResult,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      errors: errors.length > 0 ? errors : [
        {
          stage: "analyze",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      ],
    };
  }
}
