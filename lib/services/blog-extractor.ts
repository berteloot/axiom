import * as cheerio from "cheerio";

const JINA_READER_URL = "https://r.jina.ai";
const JINA_API_KEY = process.env.JINA_API_KEY;

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
 * Resolve relative URLs to absolute URLs
 */
function resolveUrl(baseUrl: string, relativeUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

/**
 * Helper function for Jina Reader API calls using POST method with JSON body
 * Based on Jina Reader API documentation: https://docs.jina.ai/
 * Get your Jina AI API key for free: https://jina.ai/?sui=apikey
 */
interface JinaReaderOptions {
  format?: 'html' | 'markdown' | 'text';
  engine?: 'browser' | 'direct' | 'cf-browser-rendering';
  withLinksSummary?: boolean;
  withImagesSummary?: boolean;
  withGeneratedAlt?: boolean;
  removeSelectors?: string;
  targetSelector?: string;
  waitForSelector?: string;
  timeout?: number;
  noCache?: boolean;
}

interface JinaReaderResponse {
  code?: number;
  status?: number;
  data: {
    content: string;
    links?: Record<string, string>;
    images?: Record<string, string>;
    title?: string;
    url?: string;
    description?: string;
  };
  usage?: {
    tokens?: number;
  };
}

async function callJinaReaderAPI(
  url: string,
  options: JinaReaderOptions = {},
  retries = 2
): Promise<JinaReaderResponse> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set. Get your Jina AI API key for free: https://jina.ai/?sui=apikey");
  }

  const normalizedUrl = normalizeUrl(url);
  const {
    format = 'html',
    engine = 'browser',
    withLinksSummary = false,
    withImagesSummary = false,
    withGeneratedAlt = false,
    removeSelectors,
    targetSelector,
    waitForSelector,
    timeout = 60000,
    noCache = false,
  } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${JINA_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Return-Format': format,
        'X-Engine': engine,
      };

      if (withLinksSummary) {
        headers['X-With-Links-Summary'] = 'true';
      }
      if (withImagesSummary) {
        headers['X-With-Images-Summary'] = 'true';
      }
      if (withGeneratedAlt) {
        headers['X-With-Generated-Alt'] = 'true';
      }
      if (removeSelectors) {
        headers['X-Remove-Selector'] = removeSelectors;
      }
      if (targetSelector) {
        headers['X-Target-Selector'] = targetSelector;
      }
      if (waitForSelector) {
        headers['X-Wait-For-Selector'] = waitForSelector;
      }
      if (noCache) {
        headers['X-No-Cache'] = 'true';
      }
      if (format === 'markdown') {
        // Use specialized HTML-to-Markdown model for better quality
        headers['X-Respond-With'] = 'readerlm-v2';
      }

      const response = await fetch(`${JINA_READER_URL}/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: normalizedUrl }),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          // Rate limited - wait and retry
          const waitTime = 2000 * (attempt + 1);
          console.log(`[Jina Reader] Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        const errorText = await response.text().catch(() => '');
        console.error(`[Jina Reader] API error: ${response.status} ${response.statusText}`);
        if (errorText) {
          console.error(`[Jina Reader] Error details: ${errorText.substring(0, 200)}`);
        }

        throw new Error(`Jina API error: ${response.status} - ${response.statusText}`);
      }

      // Read response as text first, then parse JSON
      // This allows us to handle both JSON and plain text responses
      const responseText = await response.text();
      
      if (!responseText) {
        throw new Error('Empty response from Jina Reader API');
      }

      // Try to parse as JSON first
      try {
        const data: JinaReaderResponse = JSON.parse(responseText);
        
        // Validate JSON structure
        if (data && data.data && data.data.content) {
          return data;
        }
        
        // If JSON structure is invalid but we have text, use it as plain text content
        return {
          data: {
            content: responseText,
          },
        };
      } catch (parseError) {
        // If JSON parsing fails, treat the response as plain text content
        return {
          data: {
            content: responseText,
          },
        };
      }
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const isConnectionError = error instanceof Error && (
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('network') ||
        error.name === 'AbortError'
      );

      if (isConnectionError && !isLastAttempt) {
        const waitTime = 3000 * (attempt + 1);
        console.warn(`[Jina Reader] Connection error (attempt ${attempt + 1}/${retries + 1}), retrying in ${waitTime}ms...`);
        console.warn(`[Jina Reader] Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (isLastAttempt) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Jina Reader] Failed after ${retries + 1} attempts: ${errorMessage}`);
        throw error;
      }
    }
  }

  throw new Error('Failed to call Jina Reader API after retries');
}

/**
 * Fetch raw HTML from URL
 * Uses Jina Reader API if available (better for JS-heavy sites), otherwise direct fetch
 */
export async function fetchHtml(url: string): Promise<string> {
  const normalizedUrl = normalizeUrl(url);

  // If Jina API key is available, use Jina Reader for better results (handles JS-rendered pages)
  if (JINA_API_KEY) {
    try {
      const result = await callJinaReaderAPI(url, {
        format: 'html',
        engine: 'browser',
        noCache: true,
      }, 1); // Use 1 retry for speed
      return result.data.content;
    } catch (error) {
      console.warn(`[Blog Extractor] Jina fetch failed for ${url}, falling back to direct fetch:`, error);
      // Fall through to direct fetch
    }
  }

  // Fallback to direct fetch if Jina is not available or fails
  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BlogExtractor/1.0)",
      },
      signal: AbortSignal.timeout(30000), // 30 seconds for blog pages
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
 * Extract published date from HTML only (skips URL extraction)
 * Used for preview enrichment when URL-based extraction failed
 * Returns ISO date string (YYYY-MM-DD) or null if not found
 */
export function extractPublishedDateFromHtml(url: string, html: string): string | null {
  // Skip URL extraction, go straight to HTML/content extraction
  return extractPublishedDate(url, html, undefined, true);
}

/**
 * Extract published date from various sources (meta tags, structured data, content, URL)
 * Returns ISO date string (YYYY-MM-DD) or null if not found
 * Works flexibly for all kinds of websites
 */
function extractPublishedDate(url: string, html?: string, content?: string, skipUrlExtraction: boolean = false): string | null {
  const normalizedUrl = normalizeUrl(url);
  
  // 1. Try to extract from URL first (common patterns: /2024/01/, /2024-01-15/, etc.)
  if (!skipUrlExtraction) {
    const urlDateMatch = normalizedUrl.match(/\/(\d{4})[\/\-](\d{1,2})[\/\-]?(\d{1,2})?/);
    if (urlDateMatch) {
      const year = parseInt(urlDateMatch[1], 10);
      const month = parseInt(urlDateMatch[2], 10) || 1;
      const day = parseInt(urlDateMatch[3], 10) || 1;
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime()) && date <= new Date()) {
        return date.toISOString().split('T')[0];
      }
    }
  }

  // 2. Try to extract from HTML meta tags and structured data
  if (html) {
    try {
      const $ = cheerio.load(html);
      
      // Check meta tags (Open Graph, Article, etc.)
      const metaSelectors = [
        'meta[property="article:published_time"]',
        'meta[property="og:article:published_time"]',
        'meta[name="article:published_time"]',
        'meta[property="og:published_time"]',
        'meta[name="publishdate"]',
        'meta[name="pubdate"]',
        'meta[name="publication-date"]',
        'meta[name="date"]',
        'meta[name="DC.date"]',
        'meta[name="DC.Date"]',
        'time[datetime]',
        'time[pubdate]',
        '[itemprop="datePublished"]',
        '[itemprop="datepublished"]',
      ];
      
      for (const selector of metaSelectors) {
        const element = $(selector).first();
        const dateValue = element.attr('content') || element.attr('datetime') || element.text().trim();
        if (dateValue) {
          try {
            const date = new Date(dateValue);
            if (!isNaN(date.getTime()) && date <= new Date()) {
              return date.toISOString().split('T')[0];
            }
          } catch {
            // Continue to next selector
          }
        }
      }
      
      // Check JSON-LD structured data
      const jsonLdScripts = $('script[type="application/ld+json"]');
      for (let i = 0; i < jsonLdScripts.length; i++) {
        try {
          const jsonText = $(jsonLdScripts[i]).html();
          if (!jsonText) continue;
          
          const data = JSON.parse(jsonText);
          const checkDate = (obj: any): string | null => {
            if (!obj || typeof obj !== 'object') return null;
            
            // Check common datePublished fields
            const dateFields = ['datePublished', 'datepublished', 'publishedTime', 'published', 'pubDate', 'pubdate'];
            for (const field of dateFields) {
              if (obj[field]) {
                try {
                  const date = new Date(obj[field]);
                  if (!isNaN(date.getTime()) && date <= new Date()) {
                    return date.toISOString().split('T')[0];
                  }
                } catch {
                  // Continue
                }
              }
            }
            
            // Recursively check nested objects
            for (const key in obj) {
              if (typeof obj[key] === 'object' && obj[key] !== null) {
                const result = checkDate(obj[key]);
                if (result) return result;
              }
            }
            
            return null;
          };
          
          const date = checkDate(data);
          if (date) return date;
        } catch {
          // Invalid JSON, continue to next script
        }
      }
    } catch {
      // HTML parsing failed, continue with other methods
    }
  }

  // 3. Try to extract from content text (markdown or plain text)
  if (content) {
    // Look for ISO date format (YYYY-MM-DD)
    const isoDateMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoDateMatch) {
      try {
        const date = new Date(isoDateMatch[1]);
        if (!isNaN(date.getTime()) && date <= new Date()) {
          return date.toISOString().split('T')[0];
        }
      } catch {
        // Continue
      }
    }
    
    // Look for "Published Time" field (from Jina or other extractors)
    const publishedTimeMatch = content.match(/Published\s+Time[:\s]+([\d\-T:+\s]+)/i);
    if (publishedTimeMatch) {
      try {
        const date = new Date(publishedTimeMatch[1].trim());
        if (!isNaN(date.getTime()) && date <= new Date()) {
          return date.toISOString().split('T')[0];
        }
      } catch {
        // Continue
      }
    }
    
    // Look for common date patterns in text
    const datePatterns = [
      /(?:published|date|updated)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /([A-Za-z]+\s+\d{1,2},?\s+\d{4})/,
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
      /(\d{1,2}-\d{1,2}-\d{4})/,
    ];
    
    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          const date = new Date(match[1]);
          if (!isNaN(date.getTime()) && date <= new Date()) {
            return date.toISOString().split('T')[0];
          }
        } catch {
          // Continue to next pattern
        }
      }
    }
  }

  return null;
}

/**
 * Check if a URL should be excluded from extraction.
 *
 * NOTE: The extractor is used for both pure blog listings and broader "library/resources" listings.
 * For library-style listings we must NOT exclude content types like /whitepaper/, /webinar/, /brochure/, etc.
 */
function shouldExcludeUrl(url: string, baseUrl: URL): boolean {
  try {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.toLowerCase();

    // Normalize locale prefixes so pattern matching works on multi-language sites
    // Examples: /de/..., /fr/..., /en-us/... -> /...
    const stripLocalePrefix = (p: string): string => {
      // /de/... or /de-DE/... or /en-us/...
      return p.replace(/^\/(?:[a-z]{2})(?:-[a-z]{2})?\//i, "/");
    };

    const urlPathForMatch = stripLocalePrefix(urlPath);

    const basePathRaw = (baseUrl.pathname || "").toLowerCase();
    const basePath = stripLocalePrefix(basePathRaw);
    const isLibraryContext =
      basePath.includes("/library") ||
      basePath.includes("/resources") ||
      basePath.includes("/all-media") ||
      basePath.includes("/media");

    // Skip if it's the same as the listing URL or homepage
    if (url === baseUrl.href || url === `${baseUrl.protocol}//${baseUrl.host}/`) return true;

    // Skip URLs with fragments (anchors)
    if (url.includes("#")) return true;

    // Skip if URL is from a different domain (CDN, external links, etc.)
    if (
      urlObj.hostname !== baseUrl.hostname &&
      urlObj.hostname !== `www.${baseUrl.hostname}` &&
      baseUrl.hostname !== `www.${urlObj.hostname}`
    ) {
      return true;
    }

    // Skip image/media file URLs
    // In library context, allow PDFs as they are valid assets
    const binaryExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".ico",
      ".bmp",
      ".tiff",
      ".mp4",
      ".mp3",
      ".avi",
      ".mov",
      ".wmv",
      ".zip",
      ".rar",
      ".exe",
      ".dmg",
    ];
    // Only exclude PDFs in blog context, not library context
    if (!isLibraryContext && urlPath.endsWith(".pdf")) {
      return true;
    }
    if (binaryExtensions.some((ext) => urlPath.endsWith(ext))) {
      return true;
    }

    // Skip CDN/static asset hosts
    if (
      urlObj.hostname.includes("cdn.") ||
      urlObj.hostname.includes("static.") ||
      urlObj.hostname.includes("assets.")
    ) {
      return true;
    }

    // Skip URLs with query parameters that indicate filtering/listing
    const searchParams = urlObj.searchParams;
    const excludeParams = [
      "category",
      "tag",
      "author",
      "search",
      "s",
      "filter",
      "sort",
      "orderby",
      "order",
    ];
    for (const param of excludeParams) {
      if (searchParams.has(param)) {
        return true;
      }
    }

    // In blog context, also exclude obvious pagination/listing query params.
    // In library context we may still want to crawl pagination pages and still capture item URLs.
    if (!isLibraryContext) {
      const paginationParams = ["page", "paged"];
      for (const param of paginationParams) {
        if (searchParams.has(param)) return true;
      }
    }

    // Always exclude common non-content utility/admin/auth paths (applies to both blog and library)
    const alwaysExcludeStringPatterns = [
      "/category/",
      "/tag/",
      "/tags/",
      "/author/",
      "/authors/",
      "/archive/",
      "/archives/",
      "/search",
      "/sitemap",
      "/feed",
      "/rss",
      "/atom",
      "/contact",
      "/about",
      "/about-us",
      "/privacy",
      "/terms",
      "/legal",
      "/subscribe",
      "/newsletter",
      "/login",
      "/register",
      "/signup",
      "/sign-in",
      "/wp-admin",
      "/wp-content",
      "/wp-includes",
      "/.well-known",
      "/thank-you",
      "/cookie-declaration",
      "/request-pricing",
      "/homepage-",
    ];
    
    // Library-mode exclusions: only exclude true non-content paths (admin/legal/auth)
    // CRITICAL: Do NOT exclude /resources/, /library/, or content-type paths like /whitepaper/, /webinar/
    // These are the actual content assets in library mode
    // Keep exclusions minimal - let downstream classification decide what to keep
    const libraryModeExcludePatterns = [
      // Only exclude admin/auth/legal paths, not content paths
      "/wp-admin",
      "/wp-content",
      "/wp-includes",
      "/login",
      "/register",
      "/signup",
      "/sign-in",
      "/privacy",
      "/terms",
      "/legal",
      "/cookie-declaration",
    ];

    // Blog-mode exclusions (more aggressive - excludes product/service pages)
    const blogOnlyExcludePatterns = [
      "/solutions/",
      "/products/",
      "/products", // Also exclude /products without trailing slash
      "/product/",
      "/services/",
      "/service/",
      "/industries/",
      "/industry/",
      "/company/",
      "/team/",
      "/careers/",
      "/career/",
      "/jobs/",
      "/job/",
      "/pricing/",
      "/prices/",
      "/demo/",
      "/demos/",
      "/download/",
      "/downloads/",
      "/page/",
      "/pages/",
      "/news/",
      // NOTE: We intentionally do NOT exclude /resources/, /whitepaper/, /webinar/, /brochure/, etc.
      // because those are core content types in library mode.
    ];
    
    // Regex patterns for always-excluded paths
    const alwaysExcludeRegexPatterns = [
      /^\/\d+(-2)?\/$/, // Draft/unpublished posts (numeric slugs like /3467-2/)
    ];

    // Check string patterns - different logic for library vs blog context
    const stringPatterns = isLibraryContext
      ? [...alwaysExcludeStringPatterns, ...libraryModeExcludePatterns]
      : [...alwaysExcludeStringPatterns, ...blogOnlyExcludePatterns];

    for (const pattern of stringPatterns) {
      if (urlPath.includes(pattern) || urlPathForMatch.includes(pattern)) {
        return true;
      }
    }
    
    // Check regex patterns (always applied)
    for (const pattern of alwaysExcludeRegexPatterns) {
      if (pattern.test(urlPath)) {
        return true;
      }
    }
    
    // Exclude "old" pages (archived/outdated content)
    if (urlPath.includes("-old") || urlPath.includes("-tmp")) {
      return true;
    }
    
    // Exclude product/solution pages that are not library content
    // These are typically landing pages, not actual content assets
    const productPagePatterns = [
      /^\/rfxcel-[a-z-]+-traceability-[a-z]+$/i, // e.g., /rfxcel-finished-goods-traceability-rfgt/
      /^\/rfxcel-[a-z-]+-processing-[a-z]+$/i,   // e.g., /rfxcel-serialization-processing-rsp/
      /^\/rfxcel-[a-z-]+-service-[a-z]+$/i,      // e.g., /rfxcel-verification-router-service-rvrs/
      /^\/rfxcel-[a-z-]+-management-[a-z]+$/i,   // e.g., /rfxcel-compliance-management-rcm/
      /^\/rfxcel-[a-z-]+-monitoring-[a-z]+$/i,   // e.g., /rfxcel-environmental-monitoring-rem/
      /^\/rfxcel-[a-z-]+-mgt-[a-z]+$/i,          // e.g., /rfxcel-accurate-immunization-mgt-raim/
      /^\/rfxcel-[a-z-]+$/i,                     // e.g., /rfxcel-iris/
      /^\/rfxcel-code-check-[a-z-]+$/i,          // e.g., /rfxcel-code-check-dispensers-eu/
      /^\/diamind-sentry$/i,                     // e.g., /diamind-sentry/
    ];

    if (productPagePatterns.some(pattern => pattern.test(urlPathForMatch))) {
      return true;
    }
    
    // Exclude solution/feature pages (not library content)
    const solutionPagePatterns = [
      /^\/brand-protection$/i,
      /^\/edge-warehouse-solutions$/i,
      /^\/cold-chain-technology$/i,
      /^\/returnable-asset-tracking$/i,
      /^\/smart-digital-innovation$/i,
      /^\/consumer-engagement$/i,
    ];

    if (solutionPagePatterns.some(pattern => pattern.test(urlPathForMatch))) {
      return true;
    }
    
    // Exclude resource/product listing pages (not individual library items)
    if (urlPath.endsWith("-resources") || urlPath.endsWith("-products") || urlPath.endsWith("-support")) {
      return true;
    }
    
    // Exclude careers/success pages
    if (urlPath.includes("careers") || urlPath.includes("success")) {
      return true;
    }
    
    // Exclude very short paths that are likely navigation pages
    const pathSegments = urlPathForMatch.split('/').filter(seg => seg.length > 0);
    if (pathSegments.length === 1 && pathSegments[0].length < 10) {
      // Single segment, very short - likely a navigation/landing page
      return true;
    }

    // Skip date-based archive URLs (e.g., /2024/, /2024/01/)
    const dateArchivePattern = /^\/(\d{4})\/(\d{2})?\/?$/;
    if (dateArchivePattern.test(urlPathForMatch)) {
      return true;
    }

    // Skip if URL ends with common non-post endpoints
    if (
      urlPath.endsWith("/feed") ||
      urlPath.endsWith("/rss") ||
      urlPath.endsWith("/atom") ||
      urlPath.endsWith("/sitemap.xml") ||
      urlPath.endsWith("/robots.txt")
    ) {
      return true;
    }

    // Additional positive validation in blog context: exclude obvious non-content pages
    if (!isLibraryContext) {
      const nonBlogPatterns = [
        /^\/solutions\//,
        /^\/products\//,
        /^\/product\//,
        /^\/services\//,
        /^\/service\//,
        /^\/industries\//,
        /^\/industry\//,
        /^\/company\//,
        /^\/contact/,
        /^\/about/,
        /^\/pricing/,
        /^\/demo/,
        /^\/download/,
      ];

      if (nonBlogPatterns.some((pattern) => pattern.test(urlPathForMatch))) {
        return true;
      }

      // If URL has no path segments, it's likely not a blog post
      // Note: Single-segment short paths are already excluded above (line 319-323)
      if (pathSegments.length === 0) {
        return true;
      }
    }

    return false;
  } catch {
    // If URL parsing fails, exclude it to be safe
    return true;
  }
}
/**
 * Fetch listing page content using Puppeteer (for JS-driven listings with "Load more" or infinite scroll).
 * This is used as a last-resort fallback when sitemap/Jina do not return enough items.
 */
async function fetchListingPageWithPuppeteer(url: string, maxIterations = 30): Promise<string> {
  // Dynamically import puppeteer only when needed (optional dependency)
  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch (error) {
    throw new Error("Puppeteer is not available. Install it with: npm install puppeteer");
  }
  
  const normalizedUrl = normalizeUrl(url);

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (compatible; BlogExtractor/1.0)");
    await page.goto(normalizedUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Repeatedly try: click "Load more" and/or scroll to bottom.
    let lastHeight = await page.evaluate(() => document.body.scrollHeight);
    let stableCount = 0;

    for (let i = 0; i < maxIterations; i++) {
      const clicked = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]')) as Array<HTMLElement>;
        const el = candidates.find((n) => {
          const t = (n.innerText || n.textContent || "").trim().toLowerCase();
          const ariaLabel = (n.getAttribute("aria-label") || "").toLowerCase();
          const className = (n.className || "").toLowerCase();
          const id = (n.id || "").toLowerCase();
          
          // Check text content
          if (t === "load more" || t === "more" || t.includes("load more") || t.includes("show more") || t.includes("view more")) {
            return true;
          }
          
          // Check aria-label
          if (ariaLabel.includes("load more") || ariaLabel.includes("show more") || ariaLabel.includes("view more")) {
            return true;
          }
          
          // Check class names and IDs (common patterns)
          if (className.includes("load-more") || className.includes("loadmore") || 
              id.includes("load-more") || id.includes("loadmore") ||
              className.includes("show-more") || className.includes("showmore")) {
            return true;
          }
          
          return false;
        });
        if (!el) return false;
        try {
          // Check if element is visible and not disabled
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || (el as any).disabled) {
            return false;
          }
          el.click();
          return true;
        } catch {
          return false;
        }
      });

      // Always scroll a bit to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, clicked ? 2500 : 1500));

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === lastHeight) {
        stableCount++;
      } else {
        stableCount = 0;
        lastHeight = newHeight;
      }

      // If nothing changes for a few iterations, assume we reached the end.
      if (stableCount >= 3) break;
    }

    return await page.content();
  } finally {
    await browser.close();
  }
}

/**
 * Fetch listing page content using Jina Reader (handles JavaScript-rendered pages)
 * Now uses POST method with structured responses and X-With-Links-Summary for better link extraction
 * Includes retry logic for connection failures
 */
async function fetchListingPageWithJina(url: string, retries = 2): Promise<string> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set");
  }

  // Remove hash fragments before passing to Jina (e.g., #blog)
  const urlWithoutHash = url.split('#')[0];
  const normalizedUrl = normalizeUrl(urlWithoutHash);

  try {
    const result = await callJinaReaderAPI(urlWithoutHash, {
      format: 'html',
      engine: 'browser',
      withLinksSummary: true, // Get structured links for better extraction
      withGeneratedAlt: true,
      noCache: true,
      removeSelectors: "nav,footer,header,.navigation,.sidebar,.menu,.breadcrumb,.cookie-banner,.popup,.modal",
      timeout: 120000, // 120 seconds for large listing pages
    }, retries);

    const html = result.data.content;
    
    if (!html || html.trim().length < 100) {
      throw new Error("Jina returned empty or insufficient content");
    }
    
    // Log if we got structured links (for future enhancement)
    if (result.data.links) {
      console.log(`[Blog Extractor] Jina returned ${html.length} characters and ${Object.keys(result.data.links).length} structured links`);
    } else {
      console.log(`[Blog Extractor] Jina returned ${html.length} characters from listing page`);
    }
    
    return html;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Blog Extractor] Failed to fetch listing page with Jina: ${errorMessage}`);
    throw new Error(`Failed to fetch listing page with Jina: ${errorMessage}`);
  }
}

/**
 * Extract blog post URLs from markdown/text content
 */
function extractUrlsFromMarkdown(content: string, baseUrl: URL): Array<{ url: string; title: string }> {
  const blogPosts: Array<{ url: string; title: string }> = [];
  const seenUrls = new Set<string>();
  
  // Check if we're in library context
  const basePath = (baseUrl.pathname || "").toLowerCase();
  const isLibraryContext =
    basePath.includes("/library") ||
    basePath.includes("/resources") ||
    basePath.includes("/all-media") ||
    basePath.includes("/media");
  
  // Helper to derive title from URL slug if title is too short
  const deriveTitleFromSlug = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      const slug = pathParts[pathParts.length - 1] || '';
      // Convert slug to readable title (replace hyphens with spaces, capitalize)
      return slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    } catch {
      return '';
    }
  };

  // Try parsing as HTML first (Jina might return HTML despite requesting markdown)
  try {
    const $ = cheerio.load(content);
    const selectors = [
      'article a[href]',
      '.blog-post a[href]',
      '.post a[href]',
      'a[href*="/blog/"]',
      'a[href*="/post/"]',
      'a[href*="/article/"]',
      '.entry-title a',
      'h2 a[href]',
      'h3 a[href]',
      '.card a[href]',
      '[class*="blog"] a[href]',
      '[class*="post"] a[href]',
      'a[href]', // Fallback: any link
    ];

    for (const selector of selectors) {
      $(selector).each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        if (!href) return;

        try {
          const absoluteUrl = resolveUrl(baseUrl.href, href);
          if (seenUrls.has(absoluteUrl)) return;
          if (shouldExcludeUrl(absoluteUrl, baseUrl)) return;

          // Extract title - handle "Read More" links specially
          const linkText = $link.text().trim().toLowerCase();
          const genericTexts = ['read more', 'read more ›', 'read more >', 'learn more', 'view more', 'continue reading', '→', '›', '>', 'download', 'download ›'];
          
          let title = '';
          
          if (genericTexts.includes(linkText) || linkText.length < 5) {
            // Link text is generic, find title in parent elements
            const $parent = $link.closest('article, .post, .blog-post, .card, .entry, .item, [class*="blog"], [class*="post"]');
            
            // Look for heading elements first (most reliable)
            title = $parent.find('h1, h2, h3, h4, .title, .entry-title, .post-title, .blog-title, [class*="title"]').first().text().trim();
            
            // If no heading, look for strong/bold text
            if (!title || title.length < 10) {
              title = $parent.find('strong, b, .heading').first().text().trim();
            }
            
            // If still no title, try to get text from the parent container
            if (!title || title.length < 10) {
              const parentText = $parent.text().trim();
              // Extract first meaningful sentence (skip "Read More" etc.)
              const sentences = parentText.split(/[.!?]\s+/).filter(s => 
                s.length > 20 && 
                !genericTexts.some(gt => s.toLowerCase().includes(gt)) &&
                !s.toLowerCase().includes('read more')
              );
              if (sentences.length > 0) {
                title = sentences[0].substring(0, 150).trim();
              }
            }
          } else {
            // Link text is meaningful, use it as title
            title = $link.text().trim();
            if (title.length < 10) {
              // Try to find title in parent
              const $parent = $link.closest('article, .post, .blog-post, .card, .entry, .item');
              title = $parent.find('h1, h2, h3, .title, .entry-title').first().text().trim() || title;
            }
          }

          // In library context, allow shorter titles and use slug fallback
          if (isLibraryContext && (!title || title.length < 10)) {
            const slugTitle = deriveTitleFromSlug(absoluteUrl);
            if (slugTitle) {
              title = slugTitle;
            }
          }
          
          // Only add if we have a title (relaxed length check in library context)
          const minTitleLength = isLibraryContext ? 3 : 10;
          if (title && title.length >= minTitleLength && absoluteUrl.startsWith('http')) {
            blogPosts.push({ url: absoluteUrl, title });
            seenUrls.add(absoluteUrl);
          }
        } catch {
          return;
        }
      });
    }

    // If we found posts from HTML parsing, return them
    if (blogPosts.length > 0) {
      console.log(`[Blog Extractor] Extracted ${blogPosts.length} URLs from HTML content`);
      return blogPosts;
    }
  } catch {
    // Not HTML, continue with markdown parsing
  }

  // Pattern 1: Markdown links [title](url)
  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownLinkPattern.exec(content)) !== null) {
    let title = match[1].trim();
    const href = match[2].trim();
    if (!href || !title) continue;

    try {
      const absoluteUrl = resolveUrl(baseUrl.href, href);
      if (seenUrls.has(absoluteUrl)) continue;
      if (shouldExcludeUrl(absoluteUrl, baseUrl)) continue;

      // In library context, allow shorter titles and use slug fallback
      if (isLibraryContext && (!title || title.length < 10)) {
        const slugTitle = deriveTitleFromSlug(absoluteUrl);
        if (slugTitle) {
          title = slugTitle;
        }
      }
      
      const minTitleLength = isLibraryContext ? 3 : 10;
      if (title && title.length >= minTitleLength && absoluteUrl.startsWith('http')) {
        blogPosts.push({ url: absoluteUrl, title });
        seenUrls.add(absoluteUrl);
      }
    } catch {
      continue;
    }
  }

  // Pattern 2: Plain URLs in text (http:// or https://)
  const urlPattern = /https?:\/\/[^\s\)\]"']+/g;
  while ((match = urlPattern.exec(content)) !== null) {
    const url = match[0].trim();
    if (seenUrls.has(url)) continue;
    if (shouldExcludeUrl(url, baseUrl)) continue;

    // Try to find title near the URL (look for heading or text before URL)
    const urlIndex = match.index;
    const contextBefore = content.substring(Math.max(0, urlIndex - 200), urlIndex);
    
    // Look for headings or bold text near the URL
    const headingMatch = contextBefore.match(/#{1,3}\s+(.+?)(?:\n|$)/);
    const boldMatch = contextBefore.match(/\*\*(.+?)\*\*/);
    const titleMatch = headingMatch || boldMatch;
    
    let title = titleMatch ? titleMatch[1].trim() : '';
    if (!title || title.length < 10) {
      // Try to extract from surrounding text
      const textMatch = contextBefore.match(/([A-Z][^.!?]{20,100})[.!?]?\s*$/);
      if (textMatch) {
        title = textMatch[1].trim().substring(0, 100);
      }
    }

    // In library context, allow shorter titles and use slug fallback
    if (isLibraryContext && (!title || title.length < 10)) {
      const slugTitle = deriveTitleFromSlug(url);
      if (slugTitle) {
        title = slugTitle;
      }
    }
    
    const minTitleLength = isLibraryContext ? 3 : 10;
    if (title && title.length >= minTitleLength && url.startsWith('http')) {
      blogPosts.push({ url, title });
      seenUrls.add(url);
    }
  }

  return blogPosts;
}

/**
 * Try to fetch blog posts from sitemap or RSS feed
 */
async function tryFetchFromSitemapOrRSS(baseUrl: URL): Promise<Array<{ url: string; title: string }>> {
  const blogPosts: Array<{ url: string; title: string }> = [];
  const baseUrlString = `${baseUrl.protocol}//${baseUrl.host}`;

  // Try common sitemap/RSS locations (expanded for WordPress and variants)
  const feedUrls = [
    `${baseUrlString}/sitemap.xml`,
    `${baseUrlString}/sitemap_index.xml`,
    `${baseUrlString}/sitemap-index.xml`,
    `${baseUrlString}/wp-sitemap.xml`,
    `${baseUrlString}/wp-sitemap-index.xml`,
    `${baseUrlString}/blog/sitemap.xml`,
    `${baseUrlString}/feed`,
    `${baseUrlString}/rss`,
    `${baseUrlString}/blog/feed`,
    `${baseUrlString}/blog/rss`,
  ];

  for (const feedUrl of feedUrls) {
    try {
      console.log(`[Blog Extractor] Trying sitemap/RSS: ${feedUrl}`);
      const response = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BlogExtractor/1.0)" },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const content = await response.text();
        const $ = cheerio.load(content, { xmlMode: true });

        const addFromUrlset = (xml: string) => {
          const $xml = cheerio.load(xml, { xmlMode: true });
          $xml('url loc').each((_, el) => {
            const u = $xml(el).text().trim();
            if (!u) return;
            if (shouldExcludeUrl(u, baseUrl)) return;

            const slug = u.split('/').filter(Boolean).pop() || '';
            const derivedTitle = slug.replace(/[-_]+/g, ' ').trim();
            const title = derivedTitle.length >= 10 ? derivedTitle : u;

            blogPosts.push({ url: u, title });
          });
        };

        // If this is a sitemap index, follow child sitemaps.
        const sitemapLocs = $('sitemap loc')
          .map((_, el) => $(el).text().trim())
          .get()
          .filter(Boolean);

        if (sitemapLocs.length > 0) {
          // Prefer post/content sitemaps first, but still try all with a reasonable cap.
          const prioritized = sitemapLocs.sort((a, b) => {
            const aScore = /post|posts|wp-sitemap-posts|blog|news|resource|media/i.test(a) ? 0 : 1;
            const bScore = /post|posts|wp-sitemap-posts|blog|news|resource|media/i.test(b) ? 0 : 1;
            return aScore - bScore;
          });

          for (const loc of prioritized.slice(0, 25)) {
            try {
              const childResp = await fetch(loc, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; BlogExtractor/1.0)" },
                signal: AbortSignal.timeout(15000),
              });
              if (!childResp.ok) continue;
              const childXml = await childResp.text();
              addFromUrlset(childXml);
            } catch {
              continue;
            }
          }

          if (blogPosts.length > 0) {
            console.log(`[Blog Extractor] Found ${blogPosts.length} posts from sitemap index ${feedUrl}`);
            return blogPosts;
          }
        }

        // Otherwise treat as a standard urlset sitemap
        addFromUrlset(content);

        // Parse RSS feed
        $('item link, entry link[type="text/html"]').each((_, element) => {
          const url = $(element).text().trim() || $(element).attr('href') || '';
          if (url && !shouldExcludeUrl(url, baseUrl)) {
            const $item = $(element).closest('item, entry');
            const title = $item.find('title').first().text().trim() || '';
            if (title) {
              blogPosts.push({ url, title });
            }
          }
        });

        if (blogPosts.length > 0) {
          console.log(`[Blog Extractor] Found ${blogPosts.length} posts from ${feedUrl}`);
          return blogPosts;
        }
      }
    } catch (error) {
      // Continue to next feed URL
      continue;
    }
  }

  return [];
}

/**
 * Extract pagination links from HTML content
 */
function extractPaginationLinks(content: string, baseUrl: URL): string[] {
  const paginationUrls: string[] = [];
  const seenUrls = new Set<string>();
  
  try {
    const $ = cheerio.load(content);
    
    // Look for pagination links
    const paginationSelectors = [
      '.pagination a[href]',
      '.pager a[href]',
      '.page-numbers a[href]',
      'a[rel="next"]',
      'a[aria-label*="next" i]',
      'a[aria-label*="page" i]',
      'a[href*="page="]',
      'a[href*="/page/"]',
      '.load-more',
      'button[data-page]',
      '[class*="pagination"] a[href]',
      '[class*="pager"] a[href]',
    ];
    
    for (const selector of paginationSelectors) {
      $(selector).each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href') || $link.attr('data-href') || '';
        if (!href) return;
        
        try {
          const absoluteUrl = resolveUrl(baseUrl.href, href);
          // Only include URLs that look like pagination (contain page number or pagination keywords)
          // Removed /\d+\/ pattern as it's too permissive (matches years, IDs, etc.)
          if (
            absoluteUrl.includes('page=') ||
            absoluteUrl.includes('/page/') ||
            $link.text().toLowerCase().match(/^(next|more|load|page|\d+)$/)
          ) {
            if (!seenUrls.has(absoluteUrl) && absoluteUrl.startsWith('http')) {
              paginationUrls.push(absoluteUrl);
              seenUrls.add(absoluteUrl);
            }
          }
        } catch {
          // Skip invalid URLs
        }
      });
    }
  } catch (error) {
    console.warn(`[Blog Extractor] Error extracting pagination links:`, error);
  }
  
  return paginationUrls;
}

/**
 * Try to fetch multiple pages by following pagination
 */
async function fetchAllPagesWithPagination(
  initialUrl: string,
  baseUrl: URL,
  maxPages: number = 50,
  maxPosts?: number
): Promise<Array<{ url: string; title: string }>> {
  const allPosts: Array<{ url: string; title: string }> = [];
  const seenPostUrls = new Set<string>();
  const visitedPages = new Set<string>();
  const pagesToVisit = [initialUrl];
  
  let pageCount = 0;
  let consecutiveEmptyPages = 0;
  let lastPaginationPattern: string | null = null; // Track which pattern worked
  
  while (pagesToVisit.length > 0 && pageCount < maxPages) {
    // Stop early if we've reached maxPosts
    if (maxPosts !== undefined && allPosts.length >= maxPosts) {
      console.log(`[Blog Extractor] Reached maxPosts limit (${maxPosts}), stopping pagination`);
      break;
    }
    
    const currentUrl = pagesToVisit.shift()!;
    if (visitedPages.has(currentUrl)) continue;
    
    visitedPages.add(currentUrl);
    pageCount++;
    
    try {
      console.log(`[Blog Extractor] Fetching page ${pageCount}: ${currentUrl}`);
      const content = await fetchListingPageWithJina(currentUrl);
      const posts = extractUrlsFromMarkdown(content, baseUrl);
      
      // Count new posts (not duplicates)
      let newPostsCount = 0;
      for (const post of posts) {
        if (!seenPostUrls.has(post.url)) {
          // Stop if we've reached maxPosts
          if (maxPosts !== undefined && allPosts.length >= maxPosts) {
            break;
          }
          allPosts.push(post);
          seenPostUrls.add(post.url);
          newPostsCount++;
        }
      }
      
      // Stop if we've reached maxPosts
      if (maxPosts !== undefined && allPosts.length >= maxPosts) {
        console.log(`[Blog Extractor] Reached maxPosts limit (${maxPosts}) after page ${pageCount}, stopping pagination`);
        break;
      }
      
      // Extract pagination links
      const paginationLinks = extractPaginationLinks(content, baseUrl);
      for (const link of paginationLinks) {
        if (!visitedPages.has(link) && !pagesToVisit.includes(link)) {
          pagesToVisit.push(link);
        }
      }
      
      console.log(`[Blog Extractor] Page ${pageCount}: Found ${posts.length} posts (${newPostsCount} new), ${paginationLinks.length} pagination links`);
      
      // If we got 0 posts OR 0 new posts (all duplicates), increment empty page counter
      if (posts.length === 0 || newPostsCount === 0) {
        consecutiveEmptyPages++;
        // Stop after 2 consecutive pages with no new posts (likely reached the end or stuck in loop)
        if (consecutiveEmptyPages >= 2) {
          console.log(`[Blog Extractor] Found ${consecutiveEmptyPages} consecutive pages with no new posts, stopping pagination`);
          break;
        }
      } else {
        consecutiveEmptyPages = 0; // Reset counter if we found new posts
      }
      
      // If no pagination links found and we have posts, try constructing next page URL
      // Only try ONE pattern at a time, and only if we haven't found a working pattern yet
      // Also, don't construct URLs if we're getting duplicate content (no new posts)
      if (paginationLinks.length === 0 && posts.length > 0 && newPostsCount > 0) {
        const basePath = new URL(currentUrl).pathname;
        const urlObj = new URL(currentUrl);
        
        // Parse actual page number from current URL, not pageCount
        let currentPageNum: number | null = null;
        let detectedPattern: 'query' | 'path' | 'paged' | null = null;
        
        // Try query parameter: ?page=2 or ?paged=2
        const pageParam = urlObj.searchParams.get('page') || urlObj.searchParams.get('paged');
        if (pageParam) {
          currentPageNum = parseInt(pageParam, 10);
          detectedPattern = urlObj.searchParams.has('paged') ? 'paged' : 'query';
        }
        
        // Try path pattern: /page/2
        if (currentPageNum === null) {
          const pathMatch = basePath.match(/\/page\/(\d+)/);
          if (pathMatch) {
            currentPageNum = parseInt(pathMatch[1], 10);
            detectedPattern = 'path';
          }
        }
        
        // Fall back to pageCount only if we couldn't parse the URL
        if (currentPageNum === null) {
          currentPageNum = pageCount;
        }
        
        // Use detected pattern if available, otherwise use lastPaginationPattern
        const patternToUse: 'query' | 'path' | 'paged' = 
          detectedPattern || 
          (lastPaginationPattern && (lastPaginationPattern as 'query' | 'path' | 'paged')) || 
          'query';
        const nextPage = currentPageNum + 1;
        
        // Determine which pattern to try
        let nextPageUrl: string;
        if (patternToUse === 'query') {
          nextPageUrl = `${baseUrl.origin}${basePath}?page=${nextPage}`;
        } else if (patternToUse === 'path') {
          nextPageUrl = `${baseUrl.origin}${basePath}/page/${nextPage}`;
        } else if (patternToUse === 'paged') {
          nextPageUrl = `${baseUrl.origin}${basePath}?paged=${nextPage}`;
        } else {
          // Default fallback
          nextPageUrl = `${baseUrl.origin}${basePath}?page=${nextPage}`;
        }
        
        // Update lastPaginationPattern for next iteration
        lastPaginationPattern = patternToUse;
        
        if (!visitedPages.has(nextPageUrl) && !pagesToVisit.includes(nextPageUrl)) {
          pagesToVisit.push(nextPageUrl);
          console.log(`[Blog Extractor] No pagination links found, trying constructed URL: ${nextPageUrl} (parsed page ${currentPageNum} from URL)`);
        }
      } else if (paginationLinks.length > 0) {
        // Found real pagination links, clear the pattern tracking
        lastPaginationPattern = null;
      } else if (paginationLinks.length === 0 && posts.length > 0 && newPostsCount === 0) {
        // We have posts but they're all duplicates - don't construct more URLs
        console.log(`[Blog Extractor] Page has posts but all are duplicates, not constructing more URLs`);
      }
    } catch (error) {
      console.warn(`[Blog Extractor] Error fetching page ${currentUrl}:`, error);
      consecutiveEmptyPages++;
      // Stop after errors too
      if (consecutiveEmptyPages >= 2) {
        console.log(`[Blog Extractor] Too many errors, stopping pagination`);
        break;
      }
      continue;
    }
  }
  
  return allPosts;
}

/**
 * Extract blog post URLs from a blog homepage
 * Uses Jina Reader for JavaScript-rendered pages, falls back to HTML parsing
 * Also extracts published dates from URLs when available
 * 
 * @param blogUrl - The blog URL to extract from
 * @param maxPosts - Optional maximum number of posts to extract (stops early when reached)
 * @param dateRangeStart - Optional start date for filtering (ISO date string)
 * @param dateRangeEnd - Optional end date for filtering (ISO date string)
 */
export async function extractBlogPostUrls(
  blogUrl: string,
  maxPosts?: number,
  dateRangeStart?: string | null,
  dateRangeEnd?: string | null
): Promise<Array<{ url: string; title: string; publishedDate: string | null }>> {
  const baseUrl = new URL(normalizeUrl(blogUrl));
  let blogPosts: Array<{ url: string; title: string; publishedDate: string | null }> = [];
  
  // Parse date range if provided
  const startDate = dateRangeStart ? new Date(dateRangeStart) : null;
  const endDate = dateRangeEnd ? new Date(dateRangeEnd) : null;
  if (endDate) {
    endDate.setHours(23, 59, 59, 999); // Include full end day
  }
  
  // Helper function to check if a post matches date range
  const matchesDateRange = (publishedDate: string | null): boolean => {
    if (!publishedDate) {
      // Include posts without dates if date range is specified
      return true;
    }
    if (!startDate && !endDate) {
      return true;
    }
    const postDate = new Date(publishedDate);
    if (startDate && postDate < startDate) {
      return false;
    }
    if (endDate && postDate > endDate) {
      return false;
    }
    return true;
  };
  
  try {
    // First, try sitemap/RSS feeds (most reliable for getting all posts)
    try {
      const sitemapPosts = await tryFetchFromSitemapOrRSS(baseUrl);
      if (sitemapPosts.length > 0) {
        console.log(`[Blog Extractor] Found ${sitemapPosts.length} posts from sitemap/RSS`);
        for (const post of sitemapPosts) {
          // Extract date from URL first
          const publishedDate = extractPublishedDate(post.url);
          // Filter by date range if provided
          if (matchesDateRange(publishedDate)) {
            blogPosts.push({
              url: post.url,
              title: post.title,
              publishedDate,
            });
            // Stop early if we've reached maxPosts
            if (maxPosts !== undefined && blogPosts.length >= maxPosts) {
              console.log(`[Blog Extractor] Reached maxPosts limit (${maxPosts}) from sitemap, stopping`);
              break;
            }
          }
        }
      }
    } catch (error) {
      console.log(`[Blog Extractor] Sitemap/RSS fetch failed, continuing with page extraction`);
    }
    
    // If sitemap didn't work or found few posts, try Jina Reader with pagination
    // Only continue if we haven't reached maxPosts yet
    if ((maxPosts === undefined || blogPosts.length < maxPosts) && blogPosts.length < 50) {
      try {
        console.log(`[Blog Extractor] Attempting to extract with Jina Reader from ${blogUrl}...`);
        
        // Calculate how many more posts we need
        const remainingPosts = maxPosts !== undefined ? Math.max(0, maxPosts - blogPosts.length) : undefined;
        
        // Try fetching pages with pagination (respecting maxPosts)
        const paginatedPosts = await fetchAllPagesWithPagination(blogUrl, baseUrl, 50, remainingPosts);
        
        // Merge with sitemap posts (avoid duplicates) and apply date filtering
        const existingUrls = new Set(blogPosts.map(p => p.url));
        for (const post of paginatedPosts) {
          if (!existingUrls.has(post.url)) {
            // Extract date from URL
            const publishedDate = extractPublishedDate(post.url);
            // Filter by date range if provided
            if (matchesDateRange(publishedDate)) {
              blogPosts.push({
                url: post.url,
                title: post.title,
                publishedDate,
              });
              existingUrls.add(post.url);
              // Stop early if we've reached maxPosts
              if (maxPosts !== undefined && blogPosts.length >= maxPosts) {
                console.log(`[Blog Extractor] Reached maxPosts limit (${maxPosts}) during pagination, stopping`);
                break;
              }
            }
          }
        }
        
        console.log(`[Blog Extractor] Total posts found after pagination: ${blogPosts.length}`);
        
        // If we still found very few posts, try single page extraction as fallback
        // Only if we haven't reached maxPosts yet
        if ((maxPosts === undefined || blogPosts.length < maxPosts) && blogPosts.length < 20) {
          console.log(`[Blog Extractor] Trying single page extraction as fallback...`);
          const jinaContent = await fetchListingPageWithJina(blogUrl);
          
          // Log content preview for debugging
          console.log(`[Blog Extractor] Jina content preview (first 500 chars): ${jinaContent.substring(0, 500)}`);
          console.log(`[Blog Extractor] Jina content length: ${jinaContent.length} characters`);
          
          const jinaPosts = extractUrlsFromMarkdown(jinaContent, baseUrl);
          console.log(`[Blog Extractor] Single page extraction found ${jinaPosts.length} blog posts`);
          
          // Merge with existing posts and apply date filtering
          for (const post of jinaPosts) {
            if (!existingUrls.has(post.url)) {
              // Extract date from URL
              const publishedDate = extractPublishedDate(post.url);
              // Filter by date range if provided
              if (matchesDateRange(publishedDate)) {
                blogPosts.push({
                  url: post.url,
                  title: post.title,
                  publishedDate,
                });
                existingUrls.add(post.url);
                // Stop early if we've reached maxPosts
                if (maxPosts !== undefined && blogPosts.length >= maxPosts) {
                  console.log(`[Blog Extractor] Reached maxPosts limit (${maxPosts}) during single page extraction, stopping`);
                  break;
                }
              }
            }
          }
          
          // If we found very few posts, log a sample of the content to debug
          if (blogPosts.length < 20) {
            console.warn(`[Blog Extractor] Only found ${blogPosts.length} posts total, content sample:`, jinaContent.substring(0, 1000));
          }
        }
      } catch (jinaError) {
        console.warn(`[Blog Extractor] Jina extraction failed, falling back to HTML:`, jinaError);
      }
    }

    // Fallback to HTML parsing if Jina didn't find enough posts or failed
    // Only if we haven't reached maxPosts yet
    if ((maxPosts === undefined || blogPosts.length < maxPosts) && blogPosts.length < 5) {
      console.log(`[Blog Extractor] Falling back to HTML parsing (found ${blogPosts.length} posts with Jina)...`);
      const html = await fetchHtml(blogUrl);
      const $ = cheerio.load(html);
      const seenUrls = new Set(blogPosts.map(p => p.url));
      
      // Check if we're in library context
      const basePath = baseUrl.pathname.toLowerCase();
      const isLibraryContext =
        basePath.includes("/library") ||
        basePath.includes("/resources") ||
        basePath.includes("/all-media") ||
        basePath.includes("/media");
      
      // Helper to derive title from URL slug if title is too short
      const deriveTitleFromSlug = (url: string): string => {
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          const slug = pathParts[pathParts.length - 1] || '';
          // Convert slug to readable title (replace hyphens with spaces, capitalize)
          return slug
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
        } catch {
          return '';
        }
      };

      // Common selectors for blog post links
      const selectors = [
        'article a[href]',
        '.blog-post a[href]',
        '.post a[href]',
        'a[href*="/blog/"]',
        'a[href*="/post/"]',
        'a[href*="/article/"]',
        '.entry-title a',
        'h2 a[href]',
        'h3 a[href]',
        '.card a[href]',
        '[class*="blog"] a[href]',
        '[class*="post"] a[href]',
      ];

      // Try each selector
      for (const selector of selectors) {
        // Stop early if we've reached maxPosts
        if (maxPosts !== undefined && blogPosts.length >= maxPosts) {
          break;
        }
        
        $(selector).each((_, element) => {
          // Stop early if we've reached maxPosts
          if (maxPosts !== undefined && blogPosts.length >= maxPosts) {
            return false; // Break out of each loop
          }
          
          const $link = $(element);
          const href = $link.attr('href');
          if (!href) return;

          // Resolve relative URLs
          const absoluteUrl = resolveUrl(baseUrl.href, href);
          
          // Skip if we've seen this URL
          if (seenUrls.has(absoluteUrl)) return;
          
          // Use the exclusion function to filter out non-post pages
          if (shouldExcludeUrl(absoluteUrl, baseUrl)) {
            return;
          }

          // Get title from link text or nearby elements
          let title = $link.text().trim();
          if (!title || title.length < 10) {
            // Try to find title in parent or nearby elements
            title = $link.closest('article, .post, .blog-post, .card').find('h1, h2, h3, .title, .entry-title').first().text().trim() || title;
          }
          
          // In library context, allow shorter titles and use slug fallback
          if (isLibraryContext && (!title || title.length < 10)) {
            const slugTitle = deriveTitleFromSlug(absoluteUrl);
            if (slugTitle) {
              title = slugTitle;
            }
          }

          // Only add if we have a reasonable title and URL (relaxed length check in library context)
          const minTitleLength = isLibraryContext ? 3 : 10;
          if (title && title.length >= minTitleLength && absoluteUrl.startsWith('http')) {
            // Extract date from URL
            const publishedDate = extractPublishedDate(absoluteUrl);
            // Filter by date range if provided
            if (matchesDateRange(publishedDate)) {
              blogPosts.push({ 
                url: absoluteUrl, 
                title,
                publishedDate,
              });
              seenUrls.add(absoluteUrl);
              // Stop early if we've reached maxPosts
              if (maxPosts !== undefined && blogPosts.length >= maxPosts) {
                return false; // Break out of each loop
              }
            }
          }
        });
      }
    }

    // Last resort: JS-rendered listings (ONLY for library context - too expensive for regular blogs)
    // Only run Puppeteer if:
    // 1. We're in library context (path includes /library, /resources, /all-media, /media)
    // 2. We found fewer posts than expected (likely JS-driven infinite scroll)
    const basePath = baseUrl.pathname.toLowerCase();
    const isLibraryContext = basePath.includes("/library") || 
                             basePath.includes("/resources") || 
                             basePath.includes("/all-media") || 
                             basePath.includes("/media");
    
    if (isLibraryContext && blogPosts.length < 50) {
      try {
        console.log(`[Blog Extractor] Library context detected - attempting Puppeteer extraction (found ${blogPosts.length} posts so far)...`);
        const renderedHtml = await fetchListingPageWithPuppeteer(blogUrl, 30);
        const renderedPosts = extractUrlsFromMarkdown(renderedHtml, baseUrl);

        const existingUrls = new Set(blogPosts.map((p) => p.url));
        for (const post of renderedPosts) {
          if (!existingUrls.has(post.url)) {
            blogPosts.push({
              url: post.url,
              title: post.title,
              publishedDate: null, // Will be extracted later from URL
            });
            existingUrls.add(post.url);
          }
        }

        console.log(`[Blog Extractor] Puppeteer extraction added ${renderedPosts.length} items; total is now ${blogPosts.length}`);
      } catch (error) {
        console.warn(`[Blog Extractor] Puppeteer extraction failed:`, error);
      }
    } else if (!isLibraryContext && blogPosts.length < 5) {
      // For non-library contexts, only use Puppeteer as absolute last resort with very low threshold
      try {
        console.log(`[Blog Extractor] Very few posts found (${blogPosts.length}) - attempting Puppeteer as last resort...`);
        const renderedHtml = await fetchListingPageWithPuppeteer(blogUrl, 30);
        const renderedPosts = extractUrlsFromMarkdown(renderedHtml, baseUrl);

        const existingUrls = new Set(blogPosts.map((p) => p.url));
        for (const post of renderedPosts) {
          if (!existingUrls.has(post.url)) {
            blogPosts.push({
              url: post.url,
              title: post.title,
              publishedDate: null, // Will be extracted later from URL
            });
            existingUrls.add(post.url);
          }
        }

        console.log(`[Blog Extractor] Puppeteer extraction added ${renderedPosts.length} items; total is now ${blogPosts.length}`);
      } catch (error) {
        console.warn(`[Blog Extractor] Puppeteer extraction failed:`, error);
      }
    }

    // Remove duplicates and enrich with published dates from URLs
    const uniquePostsMap = new Map<string, { url: string; title: string; publishedDate: string | null }>();
    
    for (const post of blogPosts) {
      if (!uniquePostsMap.has(post.url)) {
        // Extract published date from URL (fast extraction from URL patterns)
        const publishedDate = extractPublishedDate(post.url);
        uniquePostsMap.set(post.url, {
          url: post.url,
          title: post.title,
          publishedDate,
        });
      }
    }
    
    const uniquePosts = Array.from(uniquePostsMap.values());

    console.log(`[Blog Extractor] Found ${uniquePosts.length} blog posts from ${blogUrl}`);
    
    return uniquePosts;
  } catch (error) {
    console.error("[Blog Extractor] Error extracting blog posts:", error);
    throw error instanceof Error 
      ? new Error(`Failed to extract blog posts: ${error.message}`)
      : new Error("Failed to extract blog posts: Unknown error");
  }
}

/**
 * Fetch blog post content using Jina Reader
 */
export async function fetchBlogPostContent(url: string): Promise<string> {
  const result = await fetchBlogPostContentWithDate(url);
  return result.content;
}

/**
 * Fetch blog post content and extract published date
 * Returns both content and published date (if found)
 * Now uses POST method with structured responses and X-Respond-With: readerlm-v2 for better markdown conversion
 */
export async function fetchBlogPostContentWithDate(url: string): Promise<{ content: string; publishedDate: string | null }> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set");
  }

  try {
    const normalizedUrl = normalizeUrl(url);
    
    // Use improved Jina Reader API with POST method and structured responses
    const result = await callJinaReaderAPI(url, {
      format: 'markdown',
      engine: 'browser',
      withGeneratedAlt: true,
      noCache: true,
      removeSelectors: "nav,footer,header,.navigation,.sidebar,.menu,.breadcrumb,.social-share,.related-posts,.comments,.newsletter,.subscribe,.cookie-banner,.popup,.modal",
      targetSelector: "article,main,.post-content,.entry-content,.article-content,.blog-post,.post-body,.content-main",
      timeout: 60000, // 60 seconds for full content
    });

    const content = result.data.content;

    if (!content || content.trim().length < 100) {
      throw new Error("Could not extract meaningful content from the blog post");
    }

    // Try to fetch HTML for date extraction (in parallel or as fallback)
    let html: string | undefined;
    let publishedDate: string | null = null;
    
    try {
      // First try to extract from content (Jina might include "Published Time" field)
      publishedDate = extractPublishedDate(normalizedUrl, undefined, content);
      
      // If not found in content, try fetching HTML for meta tags/structured data
      if (!publishedDate) {
        html = await fetchHtml(normalizedUrl).catch(() => undefined);
        if (html) {
          publishedDate = extractPublishedDate(normalizedUrl, html, content);
        }
      }
      
      if (publishedDate) {
        console.log(`[Blog Extractor] Extracted published date: ${publishedDate} from ${url}`);
      } else {
        console.log(`[Blog Extractor] No published date found for ${url}`);
      }
    } catch (dateError) {
      // Date extraction failed, but content is still valid
      console.warn(`[Blog Extractor] Failed to extract published date from ${url}:`, dateError);
    }

    // Log content length for debugging
    console.log(`[Blog Extractor] Fetched ${content.length} characters from ${url}`);
    
    return { content, publishedDate };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch blog post content: ${error.message}`);
    }
    throw new Error("Failed to fetch blog post content: Unknown error");
  }
}
