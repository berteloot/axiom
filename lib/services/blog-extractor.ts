import * as cheerio from "cheerio";

const JINA_READER_URL = "https://r.jina.ai/";
const JINA_API_KEY = process.env.JINA_API_KEY;
const JINA_MIN_DELAY_MS = 1500;
let lastJinaRequestTime = 0;
let jinaQueue: Promise<void> = Promise.resolve();

// Circuit breaker for Jina API
let jinaFailureCount = 0;
let jinaLastFailureTime = 0;
let jinaCircuitBreakerOpenTime: number | null = null;
const JINA_CIRCUIT_BREAKER_THRESHOLD = 3;
const JINA_CIRCUIT_BREAKER_RESET_MS = 60000; // 1 minute

function isJinaCircuitBreakerOpen(): boolean {
  if (jinaFailureCount >= JINA_CIRCUIT_BREAKER_THRESHOLD) {
    // If circuit breaker was just opened, record the time
    if (jinaCircuitBreakerOpenTime === null) {
      jinaCircuitBreakerOpenTime = Date.now();
      logger.warn('Jina circuit breaker opened', { failureCount: jinaFailureCount });
    }
    
    // Check if enough time has passed to reset
    const timeSinceOpen = Date.now() - jinaCircuitBreakerOpenTime;
    if (timeSinceOpen >= JINA_CIRCUIT_BREAKER_RESET_MS) {
      // Reset circuit breaker after timeout
      jinaFailureCount = 0;
      jinaCircuitBreakerOpenTime = null;
      logger.info('Jina circuit breaker reset after timeout', { timeSinceOpenMs: timeSinceOpen });
      return false;
    }
    return true; // Circuit breaker is still open
  }
  return false;
}

function recordJinaFailure(): void {
  jinaFailureCount++;
  jinaLastFailureTime = Date.now();
  if (jinaFailureCount >= JINA_CIRCUIT_BREAKER_THRESHOLD && jinaCircuitBreakerOpenTime === null) {
    jinaCircuitBreakerOpenTime = Date.now();
    logger.warn('Jina circuit breaker opened', { failureCount: jinaFailureCount });
  }
}

function recordJinaSuccess(): void {
  if (jinaFailureCount > 0) {
    jinaFailureCount = 0;
    jinaCircuitBreakerOpenTime = null;
    logger.info('Jina circuit breaker closed after successful request');
  }
}

// Track direct fetch failures per domain to skip enrichment when site is blocking
const directFetchFailures = new Map<string, number>();
const DIRECT_FETCH_FAILURE_THRESHOLD = 3;

function recordDirectFetchFailure(url: string): void {
  try {
    const domain = new URL(url).hostname;
    const count = (directFetchFailures.get(domain) || 0) + 1;
    directFetchFailures.set(domain, count);
    if (count === DIRECT_FETCH_FAILURE_THRESHOLD) {
      logger.warn('Direct fetch failures threshold reached for domain', { domain, count });
    }
  } catch { /* ignore invalid URLs */ }
}

function isDirectFetchBlocked(url: string): boolean {
  try {
    const domain = new URL(url).hostname;
    return (directFetchFailures.get(domain) || 0) >= DIRECT_FETCH_FAILURE_THRESHOLD;
  } catch {
    return false;
  }
}

/**
 * Configuration for blog extractor
 * Centralizes all magic numbers and hard-coded values
 */
interface ExtractorConfig {
  validation: {
    minWordCount: number;
    minTitleLength: number;
    libraryMinTitleLength: number;
    slugDerivedMinTitleLength: number;
  };
  pagination: {
    maxPages: number;
    defaultConcurrency: number;
    validationConcurrency: number;
  };
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  timeouts: {
    fetchHtml: number;
    jinaReader: number;
    jinaListingPage: number;
    puppeteer: number;
  };
  puppeteer: {
    maxIterations: number;
    scrollDelayMs: number;
    stableCountThreshold: number;
  };
}

const DEFAULT_CONFIG: ExtractorConfig = {
  validation: {
    minWordCount: 250,
    minTitleLength: 10,
    libraryMinTitleLength: 5,
    slugDerivedMinTitleLength: 3, // Allow shorter titles when derived from slug
  },
  pagination: {
    maxPages: 50,
    defaultConcurrency: 5,
    validationConcurrency: 5,
  },
  retry: {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
  },
  timeouts: {
    fetchHtml: 30000,
    jinaReader: 60000,
    jinaListingPage: 120000,
    puppeteer: 60000,
  },
  puppeteer: {
    maxIterations: 30,
    scrollDelayMs: 1000,
    stableCountThreshold: 3,
  },
};

/**
 * Structured logger for blog extractor
 * Provides consistent logging format with levels
 */
class BlogExtractorLogger {
  private context: string;

  constructor(context: string = 'Blog Extractor') {
    this.context = context;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any) {
    const logEntry = {
      level,
      context: this.context,
      message,
      timestamp: new Date().toISOString(),
      ...(data && { data }),
    };
    if (level === 'error') {
      console.error(JSON.stringify(logEntry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(logEntry));
    } else if (level === 'info') {
      console.log(JSON.stringify(logEntry));
    } else {
      // debug level - only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log(JSON.stringify(logEntry));
      }
    }
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | any, data?: any) {
    const errorData = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...data,
        }
      : { error, ...data };
    this.log('error', message, errorData);
  }
}

// Create default logger instance
const logger = new BlogExtractorLogger();

/**
 * Named regex patterns for URL and date extraction
 * Makes patterns reusable and easier to maintain
 */
const URL_PATTERNS = {
  DATE_IN_URL: /\/(\d{4})[\/\-](\d{1,2})[\/\-]?(\d{1,2})?/,
  ISO_DATE: /(\d{4}-\d{2}-\d{2})/,
  PUBLISHED_TIME: /Published\s+Time[:\s]+([\d\-T:+\s]+)/i,
  NUMERIC_SLUG: /^\/\d+(-2)?\/?$/, // Draft/unpublished posts (numeric slugs like /3467-2/)
} as const;

/**
 * Normalize URL (add protocol if missing)
 */
function normalizeUrl(url: string): string {
  let normalized = sanitizeUrl(url);
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }
  return normalized;
}

/**
 * Remove trailing punctuation from URLs (common in text/markdown)
 */
function sanitizeUrl(url: string): string {
  let cleaned = url.trim();
  cleaned = cleaned.replace(/[)\],.;:!?]+$/g, "");
  return cleaned;
}

/**
 * Resolve relative URLs to absolute URLs
 */
function resolveUrl(baseUrl: string, relativeUrl: string): string {
  try {
    return sanitizeUrl(new URL(relativeUrl, baseUrl).href);
  } catch {
    return sanitizeUrl(relativeUrl);
  }
}

/**
 * Derive a readable title from a URL slug
 * Converts "steel-crates-rfid-and-real-savings" -> "Steel Crates Rfid And Real Savings"
 * Critical for sites with image-only links (like ACSIS)
 * 
 * @param url - The URL to extract the slug from
 * @returns A readable title derived from the URL slug, or empty string if slug is invalid
 */
export function deriveTitleFromSlug(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    const slug = pathParts[pathParts.length - 1] || '';
    
    // Skip if slug looks like a date or numeric ID
    if (/^\d+$/.test(slug) || /^\d{4}-\d{2}-\d{2}$/.test(slug)) {
      return '';
    }
    
    // Convert slug to readable title
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  } catch {
    return '';
  }
}

/**
 * Helper function for Jina Reader API calls using POST method with JSON body
 * Based on Jina Reader API documentation: https://docs.jina.ai/
 * Get your Jina AI API key for free: https://jina.ai/?sui=apikey
 */
interface JinaReaderOptions {
  format?: 'html' | 'markdown' | 'text' | 'screenshot' | 'pageshot';
  engine?: 'browser' | 'direct' | 'cf-browser-rendering';
  withLinksSummary?: boolean | 'all';
  withImagesSummary?: boolean | 'all';
  withGeneratedAlt?: boolean;
  removeSelectors?: string;
  targetSelector?: string;
  waitForSelector?: string;
  timeout?: number;
  noCache?: boolean;
  cacheTolerance?: number;
  useReaderLM?: boolean;
  withIframe?: boolean;
  withShadowDom?: boolean;
  proxy?: string | 'auto';
  locale?: string;
  viewport?: { width: number; height: number };
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const enqueueJinaRequest = async <T>(task: () => Promise<T>): Promise<T> => {
  const run = async () => {
    const now = Date.now();
    const waitMs = Math.max(0, JINA_MIN_DELAY_MS - (now - lastJinaRequestTime));
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastJinaRequestTime = Date.now();
    return task();
  };

  const result = jinaQueue.then(run, run);
  jinaQueue = result.then(() => undefined, () => undefined);
  return result;
};

async function callJinaReaderAPI(
  url: string,
  options: JinaReaderOptions = {},
  retries = 2
): Promise<JinaReaderResponse> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set. Get your Jina AI API key for free: https://jina.ai/?sui=apikey");
  }

  // Check circuit breaker
  if (isJinaCircuitBreakerOpen()) {
    logger.warn('Jina circuit breaker is open, skipping API call', { url });
    throw new Error('Jina service temporarily unavailable (circuit breaker open)');
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
    cacheTolerance,
    useReaderLM = false,
    withIframe = false,
    withShadowDom = false,
    proxy,
    locale,
    viewport,
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
        headers['X-With-Links-Summary'] = withLinksSummary === 'all' ? 'all' : 'true';
      }
      if (withImagesSummary) {
        headers['X-With-Images-Summary'] = withImagesSummary === 'all' ? 'all' : 'true';
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
      if (cacheTolerance !== undefined) {
        headers['X-Cache-Tolerance'] = String(cacheTolerance);
      }
      if (useReaderLM) {
        headers['X-Respond-With'] = 'readerlm-v2';
      }
      if (withIframe) {
        headers['X-With-Iframe'] = 'true';
      }
      if (withShadowDom) {
        headers['X-With-Shadow-Dom'] = 'true';
      }
      if (proxy) {
        if (proxy === 'auto') {
          headers['X-Proxy-Country'] = 'auto';
        } else {
          headers['X-Proxy'] = proxy;
        }
      }
      if (locale) {
        headers['X-Locale'] = locale;
      }

      const body: Record<string, unknown> = { url: normalizedUrl };
      if (viewport) {
        body.viewport = viewport;
      }

      const response = await enqueueJinaRequest(() =>
        fetch(JINA_READER_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        })
      );

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          // Rate limited - wait and retry
          const waitTime = Math.min(
            DEFAULT_CONFIG.retry.baseDelayMs * (attempt + 1),
            DEFAULT_CONFIG.retry.maxDelayMs
          );
          console.log(`[Jina Reader] Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        if (response.status === 503 && attempt < retries) {
          // Service unavailable - use exponential backoff with longer delays
          const backoff = Math.min(
            DEFAULT_CONFIG.retry.baseDelayMs * Math.pow(3, attempt + 1),
            60000 // Max 60 seconds
          );
          logger.warn('Jina service unavailable (503), backing off', { attempt: attempt + 1, backoffMs: backoff });
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        if (response.status === 422 && attempt < retries && proxy === 'auto') {
          // 422 means site blocked - try again without proxy
          logger.warn('Jina returned 422 (site blocked) with proxy, retrying without proxy', { url: normalizedUrl, attempt: attempt + 1 });
          // Remove proxy for next attempt - create new options without proxy
          const retryOptions = { ...options, proxy: undefined };
          // Use remaining retries
          const remainingRetries = retries - attempt - 1;
          if (remainingRetries >= 0) {
            return callJinaReaderAPI(url, retryOptions, remainingRetries);
          }
        }

        const errorText = await response.text().catch(() => '');
        console.error(`[Jina Reader] API error: ${response.status} ${response.statusText}`);
        if (errorText) {
          console.error(`[Jina Reader] Error details: ${errorText.substring(0, 200)}`);
        }

        // Record failure for circuit breaker (only on last attempt or non-retryable errors)
        if (attempt === retries || (response.status !== 429 && response.status !== 503)) {
          recordJinaFailure();
        }

        throw new Error(`Jina API error: ${response.status} - ${response.statusText}`);
      }

      // Record success to reset circuit breaker
      recordJinaSuccess();

      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      if (rateLimitRemaining && parseInt(rateLimitRemaining, 10) < 10) {
        logger.warn('Jina Reader rate limit low', { remaining: rateLimitRemaining, url: normalizedUrl });
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

        if (data?.code && data.code !== 200) {
          throw new Error(`Jina API returned error code: ${data.code}`);
        }

        if (data?.usage?.tokens) {
          logger.debug('Jina Reader token usage', { url: normalizedUrl, tokens: data.usage.tokens });
        }

        if (data?.data) {
          return data;
        }

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
        recordJinaFailure();
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
export async function fetchHtml(url: string, options?: { useJina?: boolean }): Promise<string> {
  const normalizedUrl = normalizeUrl(url);
  const useJina = options?.useJina ?? true;

  // If Jina API key is available, use Jina Reader for better results (handles JS-rendered pages)
  if (useJina && JINA_API_KEY) {
    try {
      const result = await callJinaReaderAPI(url, {
        format: 'html',
        engine: 'browser',
        noCache: true,
        proxy: 'auto', // Use Jina's location-based proxy for better access
      }, 1); // Use 1 retry for speed
      return result.data.content;
    } catch (error) {
      console.warn(`[Blog Extractor] Jina fetch failed for ${url}, falling back to direct fetch:`, error);
      // Fall through to direct fetch
    }
  }

  // Fallback to direct fetch if Jina is not available or fails
  try {
    // Build referer from target URL (same origin)
    const urlObj = new URL(normalizedUrl);
    const referer = `${urlObj.protocol}//${urlObj.host}/`;

    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Referer": referer,
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
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

const MONTH_NAME_PATTERN =
  '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

function extractDateFromText(text: string): string | null {
  if (!text) return null;

  const patterns = [
    // "11 Aug 2025" or "11 August 2025"
    new RegExp(`(\\d{1,2})\\.?\\s+${MONTH_NAME_PATTERN}\\s*,?\\s+(\\d{4})`, 'i'),
    // "Aug 11, 2025" or "August 11, 2025"
    new RegExp(`${MONTH_NAME_PATTERN}\\s+(\\d{1,2})[\\.,]?\\s+(\\d{4})`, 'i'),
    // "2025-09-11" or "2025/09/11"
    /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
    // "09/11/2025" or "09-11-2025"
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let dateStr = match[1];
    if (match.length >= 4) {
      if (/^\d{1,2}$/.test(match[1])) {
        dateStr = `${match[1]} ${match[2]} ${match[3]}`;
      } else {
        dateStr = `${match[1]} ${match[2]}, ${match[3]}`;
      }
    }

    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime()) && date <= new Date()) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // Continue to next pattern
    }
  }

  return null;
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
  if (html && typeof html === "string" && html.trim().length > 0) {
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
      
      // Check visible text content for dates (common in blog posts)
      // Check header/hero area first (dates are often near the top)
      const headerText = $('header, .hero, .post-header, .entry-header, .article-header, article > *:lt(5), main > *:lt(5)').text().trim();
      const headerDate = extractDateFromText(headerText);
      if (headerDate) return headerDate;

      // Look in common date container elements
      const dateContainerSelectors = [
        '.published-date',
        '.post-date',
        '.entry-date',
        '.article-date',
        '.date',
        '[class*="date"]',
        '[class*="published"]',
        'time',
        '.byline',
        '.meta',
        '[class*="meta"]',
        '.post-meta',
        '.breadcrumb + *',
        'h1 + *',
      ];
      
      for (const selector of dateContainerSelectors) {
        const elements = $(selector);
        for (let i = 0; i < Math.min(elements.length, 5); i++) {
          const text = $(elements[i]).text().trim();
          if (!text) continue;

          const extractedDate = extractDateFromText(text);
          if (extractedDate) return extractedDate;
        }
      }
      
      // As a last resort, check the main content area for date patterns
      const mainContent = $('article, .post, .blog-post, .entry, main, [role="main"]').first();
      if (mainContent.length > 0) {
        const contentText = mainContent.text();
        // Look for date patterns near the beginning of content (where dates usually appear)
        const first500Chars = contentText.substring(0, 500);
        const extractedDate = extractDateFromText(first500Chars);
        if (extractedDate) return extractedDate;
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

// --- Per-URL validation/enrichment (prevents solution/landing pages being treated as blog posts) ---

type PageValidation = {
  isArticle: boolean;
  schemaTypes: string[];
  publishedDate: string | null;
  title: string | null;
};

function normalizeSchemaType(t: unknown): string[] {
  if (!t) return [];
  if (Array.isArray(t)) return t.map(String).map((s) => s.toLowerCase());
  return [String(t).toLowerCase()];
}

function collectJsonLdTypes(json: any, acc: Set<string>) {
  if (!json) return;

  // Arrays of objects
  if (Array.isArray(json)) {
    for (const item of json) collectJsonLdTypes(item, acc);
    return;
  }

  // Graph
  if (json['@graph'] && Array.isArray(json['@graph'])) {
    for (const item of json['@graph']) collectJsonLdTypes(item, acc);
  }

  // Direct type
  const types = normalizeSchemaType(json['@type']);
  for (const t of types) acc.add(t);

  // Recurse shallowly
  for (const k of Object.keys(json)) {
    const v = json[k];
    if (v && typeof v === 'object') {
      // Avoid deep recursion into huge blobs; ld+json typically small
      collectJsonLdTypes(v, acc);
    }
  }
}

function extractTitleFromHtml($: cheerio.Root): string | null {
  const og = $('meta[property="og:title"], meta[name="og:title"]').attr('content')?.trim();
  if (og) return og;
  const tw = $('meta[name="twitter:title"]').attr('content')?.trim();
  if (tw) return tw;
  const h1 = $('h1').first().text().trim();
  if (h1 && h1.length >= 5) return h1;
  const t = $('title').first().text().trim();
  if (t) return t;
  return null;
}

function getMainTextWordCount($: cheerio.Root): number {
  // Prefer <article> then <main>, else body.
  const node = $('article').first();
  const text = (node.length ? node.text() : ($('main').first().text() || $('body').text() || '')).replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}

function validateAndExtractFromHtml(url: string, html: string): PageValidation {
  if (!html || typeof html !== "string" || html.trim().length === 0) {
    // Return default validation if HTML is invalid
    return { isArticle: true, schemaTypes: [], publishedDate: null, title: null };
  }
  const $ = cheerio.load(html);

  // 1) Schema types (best signal)
  const types = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    const jsonText = $(el).html();
    if (!jsonText) return;
    try {
      const parsed = JSON.parse(jsonText);
      collectJsonLdTypes(parsed, types);
    } catch {
      // ignore invalid JSON-LD
    }
  });

  const schemaTypes = Array.from(types);

  const articleTypes = new Set([
    'blogposting',
    'newsarticle',
    'article',
    'report',
    'techarticle',
  ]);

  const nonArticleTypes = new Set([
    // Common for solution/landing pages
    'product',
    'service',
    'organization',
    'corporation',
    'localbusiness',
    'softwareapplication',
    'webpage',
    'collectionpage',
    'faqpage',
    'contactpage',
    'aboutpage',
    'itemlist',
  ]);

  const hasArticleType = schemaTypes.some((t) => articleTypes.has(t));
  const hasNonArticleType = schemaTypes.some((t) => nonArticleTypes.has(t));
  const isHubSpotBlog =
    $('script.hsq-set-content-id[data-content-id="blog-post"], script[data-content-id="blog-post"]').length > 0 ||
    $('script').toArray().some((el) => {
      const scriptText = $(el).html() || '';
      return /setContentType["\s]*\(["']\s*blog-post["']\s*\)/i.test(scriptText);
    });

  // 2) Date (use existing robust extractor but skip URL-based inference)
  const publishedDate = extractPublishedDate(url, html, undefined, true);

  // 3) Heuristic fallback: long-form content + a date signal
  const wordCount = getMainTextWordCount($);
  const hasTimeTag = $('time[datetime], time[pubdate], [itemprop="datePublished"], meta[property="article:published_time"], meta[name="publishdate"], meta[name="pubdate"]').length > 0;

  // Conservative decision rule:
  // - Accept if explicit Article schema exists
  // - Reject only if explicit non-article schema exists
  // - Otherwise use lenient heuristics (many blogs don't have schema)
  let isArticle = false;
  if (hasArticleType || isHubSpotBlog) {
    isArticle = true;
  } else if (hasNonArticleType && wordCount < 100) {
    // Only reject if BOTH non-article schema AND very short content
    isArticle = false;
  } else {
    // No clear schema - be lenient
    // Accept if there's any signal this might be a blog post
    const hasMinimalContent = wordCount >= 100;
    const hasDateSignal = publishedDate !== null || hasTimeTag;
    const urlHasSlug = url.split('/').filter(Boolean).pop()?.includes('-') || false;
    
    // Accept if: has date, OR has decent content, OR URL looks like a blog post slug
    isArticle = hasDateSignal || hasMinimalContent || urlHasSlug;
  }

  return {
    isArticle,
    schemaTypes,
    publishedDate,
    title: extractTitleFromHtml($),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const concurrency = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: concurrency }).map(async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;

      results[current] = await fn(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
}

async function filterAndEnrichCandidates(
  candidates: Array<{ url: string; title: string; publishedDate: string | null }>,
  concurrency = 5
): Promise<Array<{ url: string; title: string; publishedDate: string | null }>> {
  // Validate each URL by fetching its HTML and confirming it is an article-like page.
  const validations = await mapWithConcurrency(candidates, concurrency, async (c) => {
    try {
      const html = await fetchHtml(c.url).catch(() => "");
      if (!html || typeof html !== "string" || html.trim().length === 0) {
        // If HTML fetch failed or returned invalid content, keep the candidate
        logger.warn('Validation failed, keeping candidate', { url: c.url, error: "Failed to fetch HTML or empty response" });
        return { 
          candidate: c, 
          validation: { isArticle: true, schemaTypes: [], publishedDate: c.publishedDate, title: null } as PageValidation,
          validationSucceeded: false 
        };
      }
      const v = validateAndExtractFromHtml(c.url, html);
      return { candidate: c, validation: v, validationSucceeded: true };
    } catch (e) {
      // If we cannot fetch/parse, keep the candidate (we can't be certain it's not an article)
      // Mark validation as failed so we know to keep it
      logger.warn('Validation failed, keeping candidate', { url: c.url, error: e instanceof Error ? e.message : String(e) });
      return { 
        candidate: c, 
        validation: { isArticle: true, schemaTypes: [], publishedDate: c.publishedDate, title: null } as PageValidation,
        validationSucceeded: false 
      };
    }
  });

  const kept: Array<{ url: string; title: string; publishedDate: string | null }> = [];

  for (const row of validations) {
    const { candidate, validation, validationSucceeded } = row;

    // Keep candidates if:
    // 1) Validation succeeded and confirmed it's an article, OR
    // 2) Validation failed (network error, etc.) - we can't be certain it's not an article
    if (validationSucceeded && !validation.isArticle) {
      // Only drop if validation succeeded AND confirmed it's NOT an article
      logger.debug('Dropping non-article', { url: candidate.url, schemaTypes: validation.schemaTypes });
      continue;
    }

    // Prefer extracted title/date when available
    const title = (validation.title && validation.title.length >= 5) ? validation.title : candidate.title;
    const publishedDate = validation.publishedDate || candidate.publishedDate;

    kept.push({ url: candidate.url, title, publishedDate });
  }

  return kept;
}

async function enrichDatesOnly(
  posts: Array<{ url: string; title: string; publishedDate: string | null }>,
  concurrency = 5
): Promise<Array<{ url: string; title: string; publishedDate: string | null }>> {
  return mapWithConcurrency(posts, concurrency, async (post) => {
    if (post.publishedDate) return post;

    try {
      const html = await fetchHtml(post.url);
      const extractedDate = extractPublishedDate(post.url, html, undefined, true);
      return { ...post, publishedDate: extractedDate };
    } catch (e) {
      logger.warn('Date enrichment failed', { url: post.url, error: e instanceof Error ? e.message : String(e) });
      return post;
    }
  });
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

    // If base URL is not localized, exclude localized paths (e.g., /de/, /fr/)
    const baseLocaleMatch = basePathRaw.match(/^\/([a-z]{2})(?:-[a-z]{2})?\//i);
    const urlLocaleMatch = urlPath.match(/^\/([a-z]{2})(?:-[a-z]{2})?\//i);
    if (!baseLocaleMatch && urlLocaleMatch) return true;
    if (baseLocaleMatch && urlLocaleMatch && baseLocaleMatch[0].toLowerCase() !== urlLocaleMatch[0].toLowerCase()) {
      return true;
    }

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
      "/diamind-solutions",
      "/products/",
      "/products", // Also exclude /products without trailing slash
      "/product/",
      "/services/",
      "/service/",
      "/industries/",
      "/industry/",
      "/partners/",
      "/publications/",
      "/podcast",
      "/webinar",
      "/webinars",
      "/event",
      "/events",
      "/case-study",
      "/case-studies",
      "/customer-success",
      "/success-stories",
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
      URL_PATTERNS.NUMERIC_SLUG, // Draft/unpublished posts (numeric slugs like /3467-2/)
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
      proxy: 'auto', // Use Jina's location-based proxy for better access
      removeSelectors: "nav,footer,header,.navigation,.sidebar,.menu,.breadcrumb,.cookie-banner,.popup,.modal",
      timeout: DEFAULT_CONFIG.timeouts.jinaListingPage,
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
function extractUrlsFromMarkdown(content: string, baseUrl: URL): Array<{ url: string; title: string; publishedDate: string | null }> {
  const blogPosts: Array<{ url: string; title: string; publishedDate: string | null }> = [];
  const seenUrls = new Set<string>();
  
  // Check if we're in library context
  const basePath = (baseUrl.pathname || "").toLowerCase();
  const isLibraryContext =
    basePath.includes("/library") ||
    basePath.includes("/resources") ||
    basePath.includes("/all-media") ||
    basePath.includes("/media");
  

  // Try parsing as HTML first (Jina might return HTML despite requesting markdown)
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return blogPosts;
  }
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
            
            // If link text is empty or too short, try image alt text (for image-only links)
            if (!title || title.length < 5) {
              const imgAlt = $link.find('img').attr('alt')?.trim();
              if (imgAlt && imgAlt.length >= 5) {
                title = imgAlt;
              }
            }
            
            // If still no title, try parent container
            if (!title || title.length < 5) {
              const $parent = $link.closest('article, .post, .blog-post, .card, .entry, .item, [class*="blog"], [class*="post"]');
              title = $parent.find('h1, h2, h3, h4, .title, .entry-title, .post-title').first().text().trim() || title;
            }
          }

          // CRITICAL: If still no title, derive from URL slug (for ALL contexts, not just library)
          // This handles image-only links like ACSIS blog where links contain only <img> tags
          let isSlugDerived = false;
          if (!title || title.length < 5) {
            const slugTitle = deriveTitleFromSlug(absoluteUrl);
            if (slugTitle && slugTitle.length >= DEFAULT_CONFIG.validation.slugDerivedMinTitleLength) {
              title = slugTitle;
              isSlugDerived = true;
              logger.debug('Derived title from URL slug', { url: absoluteUrl, title });
            }
          }
          
          // Use lower minimum length for slug-derived titles
          const minTitleLength = isSlugDerived 
            ? 3  // Slug-derived titles just need to be non-empty
            : (isLibraryContext ? DEFAULT_CONFIG.validation.libraryMinTitleLength : DEFAULT_CONFIG.validation.minTitleLength);
          
          const $parentForDate = $link.closest('article, .post, .blog-post, .card, .entry, .item, [class*="blog"], [class*="post"]');
          const parentText = ($parentForDate.length ? $parentForDate : $link.parent()).text().trim();
          const publishedDate = extractDateFromText(parentText);

          if (title && title.length >= minTitleLength && absoluteUrl.startsWith('http')) {
            blogPosts.push({ url: absoluteUrl, title, publishedDate });
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

      // If title is too short or empty, derive from URL slug (for ALL contexts)
      let isSlugDerived = false;
      if (!title || title.length < 5) {
        const slugTitle = deriveTitleFromSlug(absoluteUrl);
        if (slugTitle && slugTitle.length >= DEFAULT_CONFIG.validation.slugDerivedMinTitleLength) {
          title = slugTitle;
          isSlugDerived = true;
        }
      }
      
      // Use lower minimum length for slug-derived titles
      const minTitleLength = isSlugDerived 
        ? DEFAULT_CONFIG.validation.slugDerivedMinTitleLength
        : (isLibraryContext ? DEFAULT_CONFIG.validation.libraryMinTitleLength : DEFAULT_CONFIG.validation.minTitleLength);
      
      if (title && title.length >= minTitleLength && absoluteUrl.startsWith('http')) {
        blogPosts.push({ url: absoluteUrl, title, publishedDate: null });
        seenUrls.add(absoluteUrl);
      }
    } catch {
      continue;
    }
  }

  // Pattern 2: Plain URLs in text (http:// or https://)
  const urlPattern = /https?:\/\/[^\s\)\]"']+/g;
  while ((match = urlPattern.exec(content)) !== null) {
    const url = sanitizeUrl(match[0]);
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

    // If still no title, derive from URL slug (for ALL contexts)
    let isSlugDerived = false;
    if (!title || title.length < 5) {
      const slugTitle = deriveTitleFromSlug(url);
      if (slugTitle && slugTitle.length >= 3) {
        title = slugTitle;
        isSlugDerived = true;
      }
    }
    
    // Use lower minimum length for slug-derived titles
    const minTitleLength = isSlugDerived 
      ? 3  // Slug-derived titles just need to be non-empty
      : (isLibraryContext ? DEFAULT_CONFIG.validation.libraryMinTitleLength : DEFAULT_CONFIG.validation.minTitleLength);
    
    if (title && title.length >= minTitleLength && url.startsWith('http')) {
      blogPosts.push({ url, title, publishedDate: null });
      seenUrls.add(url);
    }
  }

  return blogPosts;
}

/**
 * Try to fetch blog posts from sitemap or RSS feed
 */
async function tryFetchFromSitemapOrRSS(baseUrl: URL): Promise<Array<{ url: string; title: string; publishedDate: string | null }>> {
  const blogPosts: Array<{ url: string; title: string; publishedDate: string | null }> = [];
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
          $xml('url').each((_, el) => {
            const u = $xml(el).find('loc').text().trim();
            if (!u) return;
            if (shouldExcludeUrl(u, baseUrl)) return;

            const lastmodText = $xml(el).find('lastmod').text().trim();
            let publishedDate: string | null = null;
            if (lastmodText) {
              const lastmodDate = new Date(lastmodText);
              if (!isNaN(lastmodDate.getTime()) && lastmodDate <= new Date()) {
                publishedDate = lastmodDate.toISOString().split('T')[0];
              }
            }

            // Use slug-derived title as primary fallback
            const derivedTitle = deriveTitleFromSlug(u);
            const title = derivedTitle && derivedTitle.length >= DEFAULT_CONFIG.validation.slugDerivedMinTitleLength 
              ? derivedTitle 
              : u;

            blogPosts.push({ url: u, title, publishedDate });
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
              const pubDateText = $item.find('pubDate, published, updated, dc\\:date').first().text().trim();
              let publishedDate: string | null = null;
              if (pubDateText) {
                const pubDate = new Date(pubDateText);
                if (!isNaN(pubDate.getTime()) && pubDate <= new Date()) {
                  publishedDate = pubDate.toISOString().split('T')[0];
                }
              }

              blogPosts.push({ url, title, publishedDate });
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

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return paginationUrls;
  }

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
  maxPages: number = DEFAULT_CONFIG.pagination.maxPages,
  maxPosts?: number
): Promise<Array<{ url: string; title: string; publishedDate: string | null }>> {
  const allPosts: Array<{ url: string; title: string; publishedDate: string | null }> = [];
  const seenPostUrls = new Set<string>();
  const visitedPages = new Set<string>();
  const pagesToVisit = [initialUrl];
  
  let pageCount = 0;
  let consecutiveEmptyPages = 0;
  let lastPaginationPattern: 'query' | 'path' | 'paged' | null = null; // Track which pattern worked
  
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
          lastPaginationPattern ||
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
  logger.info('Starting extraction', { blogUrl, maxPosts, dateRangeStart, dateRangeEnd });
  const baseUrl = new URL(normalizeUrl(blogUrl));
  let blogPosts: Array<{ url: string; title: string; publishedDate: string | null }> = [];
  const basePath = baseUrl.pathname.replace(/\/+$/, '').toLowerCase();
  const isPathScoped = basePath.length > 1;
  
  // Check if URL is a single article (not a listing page)
  // Single articles can be:
  // 1. Under a listing path like /blog/slug, /resources/slug
  // 2. At root level with a long hyphenated slug like /my-article-title
  const listingPaths = ['blog', 'blogs', 'resources', 'articles', 'news', 'insights', 'posts', 'library', 'media'];
  const pathParts = basePath.split('/').filter(p => p);
  
  // Check for /blog/slug or /resources/slug pattern
  const isUnderListingPath = pathParts.length >= 2 && 
    listingPaths.includes(pathParts[0]) && 
    pathParts[pathParts.length - 1].includes('-') &&
    pathParts[pathParts.length - 1].length > 10;
  
  // Check for root-level blog post like /my-article-title-here
  // These are long slugs with multiple hyphens, not short paths like /about or /contact
  const isRootLevelArticle = pathParts.length === 1 &&
    pathParts[0].includes('-') &&
    pathParts[0].length > 20 &&  // Long slug
    (pathParts[0].match(/-/g) || []).length >= 3 && // Multiple hyphens (like word separators)
    !['contact-us', 'about-us', 'privacy-policy', 'terms-conditions', 'terms-of-service'].includes(pathParts[0]);
  
  const isSingleArticleUrl = isUnderListingPath || isRootLevelArticle;
  
  if (isSingleArticleUrl) {
    logger.info('Detected single article URL, returning directly', { blogUrl });
    // Derive title from URL slug
    const slug = pathParts[pathParts.length - 1];
    const title = slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim() || 'Blog Post';
    
    // Try to extract published date from the URL or fetch HTML
    let publishedDate = extractPublishedDate(blogUrl);
    
    return [{
      url: blogUrl,
      title,
      publishedDate,
    }];
  }
  
  const isBlogListingPage = baseUrl.pathname.toLowerCase().includes('/blog');

  const filterPostsByPath = (
    posts: Array<{ url: string; title: string; publishedDate: string | null }>
  ): Array<{ url: string; title: string; publishedDate: string | null }> => {
    if (!isPathScoped) return posts;
    
    // Get just the base listing path (e.g., /resources from /resources/some-article)
    // This ensures we filter to posts under the same section, not requiring exact match
    const baseListingPath = '/' + pathParts[0]; // e.g., /resources, /blog
    
    const scoped = posts.filter((post) => {
      try {
        const postPath = new URL(post.url).pathname.replace(/\/+$/, '').toLowerCase();
        // Match posts under the same listing section
        return postPath === basePath || 
               postPath.startsWith(`${basePath}/`) ||
               postPath.startsWith(`${baseListingPath}/`);
      } catch {
        return false;
      }
    });
    
    if (scoped.length > 0) {
      logger.info('Scoped extraction to base path', { basePath, baseListingPath, before: posts.length, after: scoped.length });
      return scoped;
    }
    
    // BUG FIX: Return empty array instead of ALL posts when no matches found
    // This prevents returning random posts when a specific URL was requested
    logger.warn('No posts matched the requested path, returning empty', { basePath, baseListingPath, totalPosts: posts.length });
    return [];
  };
  
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
      const scopedSitemapPosts = filterPostsByPath(sitemapPosts);
      if (scopedSitemapPosts.length > 0) {
        logger.info('Found posts from sitemap/RSS', { count: scopedSitemapPosts.length, blogUrl });
        let filteredByDateRange = 0;
        for (const post of scopedSitemapPosts) {
          const publishedDate = post.publishedDate || extractPublishedDate(post.url);
          // Filter by date range if provided
          if (matchesDateRange(publishedDate)) {
            blogPosts.push({
              url: post.url,
              title: post.title,
              publishedDate,
            });
            // Stop early if we've reached maxPosts
            if (maxPosts !== undefined && blogPosts.length >= maxPosts) {
              logger.info('Reached maxPosts limit from sitemap', { maxPosts, blogUrl });
              break;
            }
          } else {
            filteredByDateRange++;
          }
        }
        if (filteredByDateRange > 0) {
          logger.info('Posts filtered by date range', { 
            filtered: filteredByDateRange, 
            kept: blogPosts.length,
            dateRange: { start: dateRangeStart, end: dateRangeEnd }
          });
        }
        
        // If we got enough posts from sitemap and it's a blog listing page, trust sitemap data and skip validation
        if (isBlogListingPage && blogPosts.length > 0 && 
            (maxPosts === undefined || blogPosts.length >= maxPosts || scopedSitemapPosts.length >= 50)) {
          logger.info('Trusting sitemap data for blog listing page, skipping validation and pagination', { 
            count: blogPosts.length, 
            blogUrl 
          });
          // Apply date filtering and return early
          const finalPosts = maxPosts !== undefined ? blogPosts.slice(0, maxPosts) : blogPosts;
          logger.info('Extraction complete (sitemap only)', {
            candidates: scopedSitemapPosts.length,
            validated: finalPosts.length,
            returning: finalPosts.length,
            blogUrl
          });
          return finalPosts;
        }
      }
    } catch (error) {
      logger.warn('Sitemap/RSS fetch failed, continuing with page extraction', { 
        error: error instanceof Error ? error.message : String(error),
        blogUrl 
      });
    }
    
    // If sitemap didn't work or found few posts, try Jina Reader with pagination.
    // For explicit blog listing pages, always attempt listing pagination to avoid sitemap noise.
    const shouldTryPagination = isBlogListingPage || blogPosts.length < 50;
    if ((maxPosts === undefined || blogPosts.length < maxPosts) && shouldTryPagination) {
      try {
        console.log(`[Blog Extractor] Attempting to extract with Jina Reader from ${blogUrl}...`);
        
        // Calculate how many more posts we need
        const remainingPosts = maxPosts !== undefined ? Math.max(0, maxPosts - blogPosts.length) : undefined;
        
        // Try fetching pages with pagination (respecting maxPosts)
        const paginatedPosts = await fetchAllPagesWithPagination(blogUrl, baseUrl, 50, remainingPosts);

        // If this is a blog listing page and pagination found posts, prefer listing-derived results
        if (isBlogListingPage && paginatedPosts.length > 0) {
          blogPosts = [];
        }

        // Merge with sitemap posts (avoid duplicates) and apply date filtering
        const existingUrls = new Set(blogPosts.map(p => p.url));
        for (const post of paginatedPosts) {
          if (!existingUrls.has(post.url)) {
            // Prefer listing-page date if present, otherwise fall back to URL patterns
            const publishedDate = post.publishedDate || extractPublishedDate(post.url);
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
              // Prefer listing-page date if present, otherwise fall back to URL patterns
              const publishedDate = post.publishedDate || extractPublishedDate(post.url);
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
      const html = await fetchHtml(blogUrl).catch(() => "");
      if (html && typeof html === "string" && html.trim().length > 0) {
        const $ = cheerio.load(html);
        const seenUrls = new Set(blogPosts.map(p => p.url));
        
        // Check if we're in library context
        const basePath = baseUrl.pathname.toLowerCase();
        const isLibraryContext =
          basePath.includes("/library") ||
          basePath.includes("/resources") ||
          basePath.includes("/all-media") ||
          basePath.includes("/media");

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
        let totalLinksFound = 0;
        let totalLinksExcluded = 0;
        
        for (const selector of selectors) {
          // Stop early if we've reached maxPosts
          if (maxPosts !== undefined && blogPosts.length >= maxPosts) {
            break;
          }
          
          const linksForSelector = $(selector).length;
          if (linksForSelector > 0) {
            console.log(`[Blog Extractor] Selector "${selector}" found ${linksForSelector} links`);
          }
          
          $(selector).each((_, element) => {
            totalLinksFound++;
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
              totalLinksExcluded++;
              return;
            }

            // Get title from link text or nearby elements
            let title = $link.text().trim();
            
            // If link text is empty or too short, try image alt text (for image-only links like ACSIS)
            if (!title || title.length < 5) {
              const imgAlt = $link.find('img').attr('alt')?.trim();
              if (imgAlt && imgAlt.length >= 5) {
                title = imgAlt;
              }
            }
            
            // If still no title, try parent container elements
            if (!title || title.length < 5) {
              const $parent = $link.closest('article, .post, .blog-post, .card, .entry, .item, [class*="blog"], [class*="post"]');
              title = $parent.find('h1, h2, h3, h4, .title, .entry-title, .post-title').first().text().trim() || title;
            }
            
            // CRITICAL: If still no title, derive from URL slug (for ALL contexts, not just library)
            // This handles image-only links like ACSIS blog where links contain only <img> tags
            let isSlugDerived = false;
            if (!title || title.length < 5) {
              const slugTitle = deriveTitleFromSlug(absoluteUrl);
              if (slugTitle && slugTitle.length >= DEFAULT_CONFIG.validation.slugDerivedMinTitleLength) {
                title = slugTitle;
                isSlugDerived = true;
                logger.debug('Derived title from URL slug', { url: absoluteUrl, title });
              }
            }

            // Use lower minimum length for slug-derived titles (they're always valid if derived from URL)
            // For extracted titles, use the standard minimum
            const minTitleLength = isSlugDerived 
              ? DEFAULT_CONFIG.validation.slugDerivedMinTitleLength
              : (isLibraryContext ? DEFAULT_CONFIG.validation.libraryMinTitleLength : DEFAULT_CONFIG.validation.minTitleLength);
            
            if (title && title.length >= minTitleLength && absoluteUrl.startsWith('http')) {
              const $parentForDate = $link.closest('article, .post, .blog-post, .card, .entry, .item, [class*="blog"], [class*="post"]');
              const parentText = ($parentForDate.length ? $parentForDate : $link.parent()).text().trim();
              const listingDate = extractDateFromText(parentText);
              const publishedDate = listingDate || extractPublishedDate(absoluteUrl);
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
        
        if (totalLinksFound > 0) {
          console.log(`[Blog Extractor] Single-page extraction: Found ${totalLinksFound} total links, excluded ${totalLinksExcluded}, kept ${blogPosts.length} posts`);
        } else {
          console.warn(`[Blog Extractor] Single-page extraction: No links found with any selector. Page might require JavaScript rendering.`);
        }
      } else {
        console.warn(`[Blog Extractor] Failed to fetch HTML for fallback parsing, skipping HTML extraction`);
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
              publishedDate: post.publishedDate || null,
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
              publishedDate: post.publishedDate || null,
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
        // Prefer listing-page dates, fall back to URL patterns
        const publishedDate = post.publishedDate || extractPublishedDate(post.url);
        uniquePostsMap.set(post.url, {
          url: post.url,
          title: post.title,
          publishedDate,
        });
      }
    }
    
    const uniquePosts = filterPostsByPath(Array.from(uniquePostsMap.values()));

    logger.info('Found candidates before validation', { count: uniquePosts.length, blogUrl });
    
    if (uniquePosts.length === 0) {
      logger.warn('No posts found', {
        blogUrl,
        possibleReasons: [
          'The page structure doesn\'t match expected selectors',
          'All links were excluded by shouldExcludeUrl',
          'The page requires JavaScript rendering (try Jina/Puppeteer)',
          'The URL is not a blog listing page'
        ]
      });
    }

    // Validate/enrich candidates by fetching each page and confirming it is an article-like page.
    // Skip validation for explicit blog listing pages to avoid false negatives
    const beforeCount = uniquePosts.length;

    let validated: Array<{ url: string; title: string; publishedDate: string | null }>;

    const concurrency = DEFAULT_CONFIG.pagination.validationConcurrency;

    // Skip validation if Jina circuit breaker is open (service is down)
    const shouldSkipValidation = isJinaCircuitBreakerOpen() && isBlogListingPage;

    if (isBlogListingPage && uniquePosts.length > 0) {
      // For blog listing pages, trust the extraction but still enrich dates when missing
      const missingDates = uniquePosts.filter((post) => !post.publishedDate).length;
      if (shouldSkipValidation) {
        logger.info('Skipping validation for blog listing page (Jina circuit breaker open)', { blogUrl, candidateCount: beforeCount, missingDates });
        validated = uniquePosts; // Trust sitemap/extraction results
      } else {
        logger.info('Skipping validation for blog listing page', { blogUrl, candidateCount: beforeCount, missingDates });
        validated = await enrichDatesOnly(uniquePosts, concurrency);
      }
    } else {
      // For other pages, validate candidates
      // Increase concurrency if Jina is down to speed up direct fetch attempts
      const effectiveConcurrency = isJinaCircuitBreakerOpen() ? Math.min(concurrency * 2, 10) : concurrency;
      validated = await filterAndEnrichCandidates(uniquePosts, effectiveConcurrency);
    }

    // Respect maxPosts after validation (validation may drop many non-articles)
    const finalPosts = maxPosts !== undefined ? validated.slice(0, maxPosts) : validated;

    logger.info('Extraction complete', {
      candidates: beforeCount,
      validated: validated.length,
      returning: finalPosts.length,
      blogUrl
    });

    return finalPosts;
  } catch (error) {
    logger.error('Error extracting blog posts', error instanceof Error ? error : new Error(String(error)), { blogUrl });
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract blog posts: ${errorMessage}`);
  }
}

/**
 * Clean up Jina Reader markdown output to extract just the article content
 * Removes navigation, footer, and other non-article content
 */
function cleanupJinaMarkdown(markdown: string): string {
  if (!markdown || markdown.length < 100) {
    return markdown;
  }

  const lines = markdown.split('\n');
  
  // Patterns that indicate navigation/header/footer content (to skip)
  const skipPatterns = [
    /^\[.*\]\(https?:\/\/[^\)]+\)$/, // Links that are just navigation
    /^!\[Image \d+:.*tracker.*\]/i, // Tracking pixels
    /^\*\s+\[/,                       // Bullet point navigation links
    /^#{1,6}\s+(About Us|Contact|Careers|Solutions|Industries|Products|Resources|News|Events)\s*$/i,
    /^(About Us|Contact Us|Apply Now|Get Started)\s*$/i,
    /©\s*\d{4}/,                      // Copyright notices
    /All rights reserved/i,
    /^Terms and Privacy/i,
    /^\[Contact Us\]/i,
    /^\[Apply Now\]/i,
    /^NEW PRODUCT/i,
  ];

  // Find where the actual article starts (look for main heading)
  let articleStartIndex = -1;
  let articleEndIndex = lines.length;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Main article heading patterns:
    // - "# Title" or "## Title" with substantial text
    // - "Title\n=====" (setext heading)
    if (articleStartIndex === -1) {
      // Check for setext-style heading (line followed by ===)
      if (i < lines.length - 1 && /^={3,}$/.test(lines[i + 1]?.trim())) {
        // Check if this looks like an article title (not navigation)
        const titleLine = line;
        if (titleLine.length > 20 && !skipPatterns.some(p => p.test(titleLine))) {
          articleStartIndex = i;
          continue;
        }
      }
      
      // Check for atx-style heading (# Title)
      const headingMatch = line.match(/^(#{1,2})\s+(.+)$/);
      if (headingMatch) {
        const title = headingMatch[2];
        // Article titles are usually longer and not navigation
        if (title.length > 20 && !skipPatterns.some(p => p.test(title))) {
          articleStartIndex = i;
          continue;
        }
      }
    }
    
    // Find where article ends (footer starts)
    if (articleStartIndex !== -1) {
      // Footer indicators
      if (/^#{1,6}\s+(About Us|Contact|Resources)\s*$/i.test(line) && i > articleStartIndex + 10) {
        // Check if this is in a footer context (multiple nav-like items nearby)
        let navItemCount = 0;
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
          if (/^\*\s+\[/.test(lines[j]) || /^\[.*\]\(/.test(lines[j])) {
            navItemCount++;
          }
        }
        if (navItemCount >= 3) {
          articleEndIndex = i;
          break;
        }
      }
      
      // Copyright/legal footer
      if (/©\s*\d{4}|All rights reserved/i.test(line)) {
        articleEndIndex = i;
        break;
      }
    }
  }
  
  // If we found article boundaries, extract just that portion
  if (articleStartIndex !== -1) {
    const articleLines = lines.slice(articleStartIndex, articleEndIndex);
    
    // Clean up the extracted article
    const cleanedLines: string[] = [];
    for (const line of articleLines) {
      const trimmed = line.trim();
      
      // Skip empty image alt text lines
      if (/^!\[Image \d+:.*\]\(/.test(trimmed) && trimmed.includes('small image')) {
        continue;
      }
      
      // Skip navigation-like patterns
      if (skipPatterns.some(p => p.test(trimmed))) {
        continue;
      }
      
      cleanedLines.push(line);
    }
    
    const result = cleanedLines.join('\n').trim();
    
    // Only return cleaned version if it has substantial content
    if (result.length > 200) {
      return result;
    }
  }
  
  // Fallback: return original but with obvious noise removed
  const fallbackLines = lines.filter(line => {
    const trimmed = line.trim();
    // Remove tracking pixels and very short navigation
    if (/^!\[Image \d+:.*tracker/i.test(trimmed)) return false;
    if (/^NEW PRODUCT/i.test(trimmed)) return false;
    return true;
  });
  
  return fallbackLines.join('\n').trim();
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

    const extractTextFromHtml = (html: string | null | undefined): string => {
      if (!html || typeof html !== "string") {
        return "";
      }
      const $ = cheerio.load(html);
      
      // Remove non-content elements aggressively
      const removeSelectors = [
        'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
        'nav', 'header', 'footer', 'aside',
        '.nav', '.navigation', '.navbar', '.menu', '.header', '.footer', '.sidebar',
        '.social-share', '.share-buttons', '.social-links',
        '.related-posts', '.related-articles', '.recommended',
        '.comments', '.comment-section', '#comments',
        '.newsletter', '.subscribe', '.subscription',
        '.cookie-banner', '.cookie-notice', '.gdpr',
        '.popup', '.modal', '.overlay',
        '.breadcrumb', '.breadcrumbs',
        '.author-bio', '.author-box',
        '.tags', '.tag-list', '.categories',
        '.pagination', '.pager',
        '.advertisement', '.ad', '.ads', '[class*="ad-"]',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
        '.hello-bar', '[class*="hello-bar"]',
      ];
      
      removeSelectors.forEach(selector => {
        try {
          $(selector).remove();
        } catch { /* ignore invalid selectors */ }
      });
      
      // Try to find the main content area
      const contentSelectors = [
        'article .content', 'article .post-content', 'article .entry-content',
        'article', 
        'main .content', 'main .post-content', 'main .entry-content',
        'main',
        '.post-content', '.entry-content', '.article-content', 
        '.blog-post', '.post-body', '.content-main',
        '.page-content', '.main-content',
        '[role="main"]',
        '#content', '#main-content', '#article-content',
      ];
      
      let contentNode = null;
      for (const selector of contentSelectors) {
        const node = $(selector).first();
        if (node.length && node.text().trim().length > 200) {
          contentNode = node;
          break;
        }
      }
      
      // If no content node found, try body but with more aggressive cleanup
      if (!contentNode || !contentNode.length) {
        contentNode = $('body');
      }
      
      // Extract text with some structure preservation
      let text = '';
      
      // Get headings and paragraphs with structure
      contentNode.find('h1, h2, h3, h4, h5, h6, p, li, blockquote').each((_, el) => {
        const $el = $(el);
        const tagName = ('tagName' in el ? el.tagName : '').toLowerCase();
        const elText = $el.text().trim();
        
        if (!elText || elText.length < 3) return;
        
        // Skip if text looks like navigation or generic UI elements
        const lowerText = elText.toLowerCase();
        if (lowerText.includes('read more') || 
            lowerText.includes('learn more') ||
            lowerText.includes('contact us') ||
            lowerText.includes('apply now') ||
            lowerText.includes('get started') ||
            lowerText.includes('sign up') ||
            lowerText.includes('subscribe') ||
            lowerText.includes('© ') ||
            lowerText.includes('all rights reserved')) {
          return;
        }
        
        if (tagName.startsWith('h')) {
          const level = parseInt(tagName[1], 10) || 2;
          text += '\n\n' + '#'.repeat(level) + ' ' + elText + '\n\n';
        } else if (tagName === 'li') {
          text += '- ' + elText + '\n';
        } else if (tagName === 'blockquote') {
          text += '\n> ' + elText + '\n\n';
        } else {
          text += elText + '\n\n';
        }
      });
      
      // If structured extraction failed, fall back to plain text
      if (text.trim().length < 200) {
        text = contentNode.text().replace(/\s+/g, ' ').trim();
      }
      
      return text.trim();
    };

    let content = '';
    let htmlForDate: string | undefined;
    let skipJinaHtml = false;
    let jinaError: Error | null = null;

    // Check if domain is blocking direct fetch before attempting
    const domainIsBlocked = isDirectFetchBlocked(url);

    // Use improved Jina Reader API with POST method and structured responses
    // Try with proxy first (auto uses location-based proxy)
    try {
      const result = await callJinaReaderAPI(url, {
        format: 'markdown',
        engine: 'browser',
        withGeneratedAlt: true,
        noCache: true,
        proxy: 'auto', // Use Jina's location-based proxy for better access
        removeSelectors: "nav,footer,header,.navigation,.sidebar,.menu,.breadcrumb,.social-share,.related-posts,.comments,.newsletter,.subscribe,.cookie-banner,.popup,.modal",
        targetSelector: "article,main,.post-content,.entry-content,.article-content,.blog-post,.post-body,.content-main",
        timeout: DEFAULT_CONFIG.timeouts.jinaReader,
      });

      content = result.data.content || '';
      
      // Post-process Jina markdown to extract just the article content
      content = cleanupJinaMarkdown(content);
    } catch (jinaErr) {
      jinaError = jinaErr instanceof Error ? jinaErr : new Error(String(jinaErr));
      const errorMessage = jinaError.message;
      
      // Handle 422 errors (No content available) - already retried without proxy in callJinaReaderAPI
      // If we still get 422, try direct fetch as fallback
      const is422Error = errorMessage.includes('422') || errorMessage.includes('No content available');
      
      if (is422Error) {
        logger.warn('Jina returned 422 (no content) even after retry, will try direct fetch', { url });
        skipJinaHtml = false; // Still try direct fetch even if Jina failed
      } else {
        logger.warn(`[Blog Extractor] Jina content fetch failed for ${url}, falling back to HTML:`, errorMessage);
        skipJinaHtml = true;
      }
    }

    // Try simple Jina GET request if content is insufficient (works better for JS-rendered sites)
    if ((!content || content.trim().length < 100) && JINA_API_KEY && !isJinaCircuitBreakerOpen()) {
      try {
        logger.info('Trying simple Jina GET request', { url });
        const jinaGetResponse = await fetch(`https://r.jina.ai/${normalizedUrl}`, {
          headers: {
            'Authorization': `Bearer ${JINA_API_KEY}`,
            'Accept': 'text/plain',
          },
          signal: AbortSignal.timeout(60000),
        });
        
        if (jinaGetResponse.ok) {
          const jinaText = await jinaGetResponse.text();
          if (jinaText && jinaText.length > 200) {
            content = jinaText;
            logger.info('Simple Jina GET request succeeded', { url, contentLength: content.length });
          }
        } else {
          logger.warn('Simple Jina GET request failed', { url, status: jinaGetResponse.status });
        }
      } catch (jinaGetError) {
        logger.warn('Simple Jina GET request error', { url, error: jinaGetError instanceof Error ? jinaGetError.message : String(jinaGetError) });
      }
    }
    
    // Try direct fetch if content is still insufficient and domain is not blocked
    if ((!content || content.trim().length < 100) && !domainIsBlocked) {
      try {
        const html = await fetchHtml(normalizedUrl, { useJina: !skipJinaHtml }).catch(() => "");
        htmlForDate = html;
        const extractedText = extractTextFromHtml(html);
        if (extractedText && extractedText.trim().length >= 100) {
          content = extractedText;
        }
      } catch (fetchError) {
        recordDirectFetchFailure(url);
        logger.warn('Direct fetch failed', { url, error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
      }
    } else if (domainIsBlocked) {
      logger.info('Skipping direct fetch (domain is blocked)', { url });
    }

    // If we still don't have content, provide a minimal fallback instead of throwing
    if (!content || content.trim().length < 100) {
      const fallbackTitle = deriveTitleFromSlug(url) || new URL(normalizedUrl).pathname.split('/').pop() || 'Blog Post';
      content = `# ${fallbackTitle}\n\nContent extraction failed for this blog post.\n\nURL: ${normalizedUrl}\n\n${jinaError ? `Jina Error: ${jinaError.message}\n\n` : ''}${domainIsBlocked ? 'Note: Direct fetch is blocked for this domain.\n\n' : ''}Please visit the URL directly to view the content.`;
      logger.warn('Using fallback content due to extraction failure', { url, jinaError: jinaError?.message, domainBlocked: domainIsBlocked });
    }

    // Try to fetch HTML for date extraction (in parallel or as fallback)
    let publishedDate: string | null = null;
    
    try {
      // First try to extract from content (Jina might include "Published Time" field)
      publishedDate = extractPublishedDate(normalizedUrl, undefined, content);
      
      // If not found in content, try fetching HTML for meta tags/structured data
      // Only if domain is not blocked
      if (!publishedDate && !domainIsBlocked) {
        const html = htmlForDate || await fetchHtml(normalizedUrl, { useJina: !skipJinaHtml }).catch(() => undefined);
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
    // This catch block should rarely be hit now since we provide fallback content
    // But keep it for any unexpected errors
    if (error instanceof Error) {
      throw new Error(`Failed to fetch blog post content: ${error.message}`);
    }
    throw new Error("Failed to fetch blog post content: Unknown error");
  }
}
