/**
 * Firecrawl API Client
 * Alternative scraping provider with better anti-bot capabilities and LLM-optimized output
 * 
 * This is a standalone module that can be used as an alternative to Jina Reader.
 * Toggle via SCRAPING_PROVIDER environment variable ('jina' | 'firecrawl')
 * 
 * Documentation: https://docs.firecrawl.dev/introduction
 * 
 * FREE TIER LIMITS:
 * - 500 credits total (1 credit = 1 page scrape)
 * - 2 concurrent requests max
 */

import FirecrawlApp from '@mendable/firecrawl-js';

// ============================================================================
// Configuration
// ============================================================================

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const SCRAPING_PROVIDER = process.env.SCRAPING_PROVIDER || 'jina';

// FREE TIER RATE LIMITS - Be conservative to avoid hitting limits
const FIRECRAWL_CONCURRENT_LIMIT = 2; // Free tier max
const FIRECRAWL_DELAY_MS = 1000; // 1 second between requests to be safe
const FIRECRAWL_DEFAULT_TIMEOUT = 30000;

// Credit tracking (approximate - resets monthly)
let estimatedCreditsUsed = 0;
const FIRECRAWL_CREDIT_WARNING_THRESHOLD = 400; // Warn at 80% of free tier
const FIRECRAWL_CREDIT_LIMIT = 500; // Free tier limit

// Request queue for rate limiting
let lastFirecrawlRequestTime = 0;
let firecrawlQueue: Promise<void> = Promise.resolve();
let activeRequests = 0;

// Circuit breaker configuration
let firecrawlFailureCount = 0;
let firecrawlCircuitBreakerOpenTime: number | null = null;
const FIRECRAWL_CIRCUIT_BREAKER_THRESHOLD = 3;
const FIRECRAWL_CIRCUIT_BREAKER_RESET_MS = 60000; // 1 minute

// Initialize Firecrawl client (only if API key is set)
const firecrawl = FIRECRAWL_API_KEY 
  ? new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY }) 
  : null;

if (!FIRECRAWL_API_KEY) {
  console.warn('[Firecrawl] API key not configured. Firecrawl features will be unavailable.');
}

// ============================================================================
// Types
// ============================================================================

/**
 * Result from scraping a single URL
 */
export interface FirecrawlScrapeResult {
  /** Markdown content */
  content: string;
  /** Page title */
  title: string | null;
  /** Meta description */
  description: string | null;
  /** Published date (YYYY-MM-DD format) */
  publishedDate: string | null;
  /** Final URL after redirects */
  url: string;
  /** Raw HTML if requested */
  html?: string;
}

/**
 * Result from crawling multiple pages
 */
export interface FirecrawlCrawlResult {
  urls: Array<{
    url: string;
    title: string;
    publishedDate: string | null;
  }>;
  totalFound: number;
  creditsUsed: number;
}

/**
 * Result for blog post content (matches Jina interface)
 */
export interface FirecrawlBlogPostResult {
  content: string;
  publishedDate: string | null;
}

/**
 * Custom error class for Firecrawl errors
 */
export class FirecrawlError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'FirecrawlError';
  }
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Structured logger for Firecrawl operations
 * Outputs JSON for compatibility with Render dashboard logs
 */
function logFirecrawl(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>
) {
  const logEntry = {
    level,
    context: 'Firecrawl',
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
  } else if (process.env.NODE_ENV === 'development') {
    console.log(JSON.stringify(logEntry));
  }
}

// ============================================================================
// Credit Tracking
// ============================================================================

/**
 * Track credit usage and warn if approaching limit
 */
function trackCreditUsage(credits: number = 1): void {
  estimatedCreditsUsed += credits;
  
  if (estimatedCreditsUsed >= FIRECRAWL_CREDIT_LIMIT) {
    logFirecrawl('error', 'Credit limit reached! Operations will fail.', {
      creditsUsed: estimatedCreditsUsed,
      limit: FIRECRAWL_CREDIT_LIMIT,
    });
  } else if (estimatedCreditsUsed >= FIRECRAWL_CREDIT_WARNING_THRESHOLD) {
    logFirecrawl('warn', 'Approaching credit limit', {
      creditsUsed: estimatedCreditsUsed,
      limit: FIRECRAWL_CREDIT_LIMIT,
      remaining: FIRECRAWL_CREDIT_LIMIT - estimatedCreditsUsed,
    });
  }
}

/**
 * Get estimated credits remaining
 */
export function getEstimatedCreditsRemaining(): number {
  return Math.max(0, FIRECRAWL_CREDIT_LIMIT - estimatedCreditsUsed);
}

/**
 * Reset credit counter (call at start of month or when needed)
 */
export function resetCreditCounter(): void {
  estimatedCreditsUsed = 0;
  logFirecrawl('info', 'Credit counter reset');
}

// ============================================================================
// Circuit Breaker
// ============================================================================

function isFirecrawlCircuitBreakerOpen(): boolean {
  if (firecrawlFailureCount >= FIRECRAWL_CIRCUIT_BREAKER_THRESHOLD) {
    if (firecrawlCircuitBreakerOpenTime === null) {
      firecrawlCircuitBreakerOpenTime = Date.now();
      logFirecrawl('warn', 'Firecrawl circuit breaker opened', {
        failureCount: firecrawlFailureCount,
      });
    }

    const timeSinceOpen = Date.now() - firecrawlCircuitBreakerOpenTime;
    if (timeSinceOpen >= FIRECRAWL_CIRCUIT_BREAKER_RESET_MS) {
      firecrawlFailureCount = 0;
      firecrawlCircuitBreakerOpenTime = null;
      logFirecrawl('info', 'Firecrawl circuit breaker reset after timeout', {
        timeSinceOpenMs: timeSinceOpen,
      });
      return false;
    }
    return true;
  }
  return false;
}

function recordFirecrawlFailure(): void {
  firecrawlFailureCount++;
  if (
    firecrawlFailureCount >= FIRECRAWL_CIRCUIT_BREAKER_THRESHOLD &&
    firecrawlCircuitBreakerOpenTime === null
  ) {
    firecrawlCircuitBreakerOpenTime = Date.now();
    logFirecrawl('warn', 'Firecrawl circuit breaker opened', {
      failureCount: firecrawlFailureCount,
    });
  }
}

function recordFirecrawlSuccess(): void {
  if (firecrawlFailureCount > 0) {
    firecrawlFailureCount = 0;
    firecrawlCircuitBreakerOpenTime = null;
    logFirecrawl('info', 'Firecrawl circuit breaker closed after successful request');
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enqueue a Firecrawl request with rate limiting
 * Respects free tier limit of 2 concurrent requests
 */
async function enqueueFirecrawlRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = async () => {
    // Wait if too many concurrent requests (free tier = 2 max)
    while (activeRequests >= FIRECRAWL_CONCURRENT_LIMIT) {
      await sleep(100);
    }

    // Enforce minimum delay between requests
    const now = Date.now();
    const waitMs = Math.max(0, FIRECRAWL_DELAY_MS - (now - lastFirecrawlRequestTime));
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastFirecrawlRequestTime = Date.now();
    activeRequests++;

    try {
      return await task();
    } finally {
      activeRequests--;
    }
  };

  // Chain requests through queue
  const result = firecrawlQueue.then(run);
  firecrawlQueue = result.then(
    () => {},
    () => {}
  );
  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract published date from Firecrawl metadata
 */
function extractDateFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;

  // Check common date fields in order of preference
  const dateFields = [
    'publishedTime',
    'published_time',
    'article:published_time',
    'og:article:published_time',
    'datePublished',
    'date',
    'pubDate',
    'publishDate',
    'created',
    'createdAt',
  ];

  for (const field of dateFields) {
    const value = metadata[field];
    if (value && typeof value === 'string') {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Retry wrapper for Firecrawl operations
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if it's a non-retryable error
      if (error instanceof FirecrawlError && !error.retryable) {
        throw error;
      }

      if (attempt <= maxRetries) {
        logFirecrawl('warn', `Attempt ${attempt} failed, retrying...`, {
          error: lastError.message,
          nextAttempt: attempt + 1,
          delayMs: delayMs * attempt,
        });
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError;
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Check if Firecrawl is properly configured
 */
export function isFirecrawlConfigured(): boolean {
  return firecrawl !== null;
}

/**
 * Check if Firecrawl is the active scraping provider
 */
export function isFirecrawlActive(): boolean {
  return SCRAPING_PROVIDER === 'firecrawl' && isFirecrawlConfigured();
}

/**
 * Check if Firecrawl is available (alias for isFirecrawlConfigured)
 */
export function isFirecrawlAvailable(): boolean {
  return isFirecrawlConfigured();
}

/**
 * Scrape a single URL and return markdown content
 * This is the primary function for extracting blog post content
 * 
 * Cost: 1 credit per scrape
 */
export async function scrapeWithFirecrawl(url: string): Promise<FirecrawlScrapeResult> {
  if (!firecrawl) {
    throw new FirecrawlError(
      'Firecrawl API key not configured. Get your API key from https://www.firecrawl.dev/',
      'ERR::CONFIG::MISSING_API_KEY',
      500,
      false
    );
  }

  if (isFirecrawlCircuitBreakerOpen()) {
    throw new FirecrawlError(
      'Firecrawl circuit breaker is open due to repeated failures',
      'ERR::CIRCUIT_BREAKER::OPEN',
      503,
      true
    );
  }

  // Check credit limit before making request
  if (estimatedCreditsUsed >= FIRECRAWL_CREDIT_LIMIT) {
    throw new FirecrawlError(
      `Credit limit reached (${FIRECRAWL_CREDIT_LIMIT} credits). Wait for monthly reset or upgrade plan.`,
      'ERR::CREDITS::LIMIT_REACHED',
      429,
      false
    );
  }

  logFirecrawl('info', 'Scraping URL with Firecrawl', { 
    url,
    creditsRemaining: getEstimatedCreditsRemaining(),
  });

  try {
    const result = await withRetry(() =>
      enqueueFirecrawlRequest(async () => {
        const response = await firecrawl.scrapeUrl(url, {
          formats: ['markdown'],
          onlyMainContent: true, // Exclude headers, footers, navs - key advantage over Jina
          waitFor: 2000, // Wait for JS to render
          timeout: FIRECRAWL_DEFAULT_TIMEOUT,
        });

        return response;
      })
    );

    // Type assertion for the result
    const scrapeResult = result as {
      success: boolean;
      error?: string;
      markdown?: string;
      metadata?: Record<string, unknown>;
    };

    if (!scrapeResult.success) {
      throw new FirecrawlError(
        scrapeResult.error || 'Scrape failed',
        'ERR::SCRAPE::FAILED',
        500,
        true
      );
    }

    // Track credit usage
    trackCreditUsage(1);
    recordFirecrawlSuccess();

    const metadata = scrapeResult.metadata || {};
    
    logFirecrawl('info', 'Scrape successful', {
      url,
      contentLength: scrapeResult.markdown?.length || 0,
      title: metadata.title as string || null,
      creditsUsed: estimatedCreditsUsed,
    });

    return {
      content: scrapeResult.markdown || '',
      title: (metadata.title as string) || null,
      description: (metadata.description as string) || null,
      publishedDate: extractDateFromMetadata(metadata),
      url: (metadata.sourceURL as string) || (metadata.url as string) || url,
    };
  } catch (error) {
    recordFirecrawlFailure();
    
    logFirecrawl('error', 'Scrape failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof FirecrawlError) {
      throw error;
    }

    throw new FirecrawlError(
      error instanceof Error ? error.message : String(error),
      'ERR::SCRAPE::UNKNOWN',
      500,
      true
    );
  }
}

/**
 * Quickly get all URLs from a website without full content extraction
 * Much faster than crawl - useful for discovering blog post URLs
 * 
 * Cost: 1 credit
 */
export async function mapWithFirecrawl(
  baseUrl: string,
  options?: {
    search?: string;
    includePaths?: string[];
    excludePaths?: string[];
    limit?: number;
  }
): Promise<string[]> {
  if (!firecrawl) {
    throw new FirecrawlError(
      'Firecrawl API key not configured',
      'ERR::CONFIG::MISSING_API_KEY',
      500,
      false
    );
  }

  if (isFirecrawlCircuitBreakerOpen()) {
    throw new FirecrawlError(
      'Firecrawl circuit breaker is open',
      'ERR::CIRCUIT_BREAKER::OPEN',
      503,
      true
    );
  }

  // Check credit limit
  if (estimatedCreditsUsed >= FIRECRAWL_CREDIT_LIMIT) {
    throw new FirecrawlError(
      'Credit limit reached',
      'ERR::CREDITS::LIMIT_REACHED',
      429,
      false
    );
  }

  logFirecrawl('info', 'Mapping URLs with Firecrawl', { 
    baseUrl, 
    search: options?.search,
    limit: options?.limit,
  });

  try {
    const result = await withRetry(() =>
      enqueueFirecrawlRequest(async () => {
        const response = await firecrawl.mapUrl(baseUrl, {
          search: options?.search,
          limit: options?.limit || 100,
        });

        return response;
      })
    );

    // Type assertion
    const mapResult = result as {
      success: boolean;
      error?: string;
      links?: string[];
    };

    if (!mapResult.success) {
      throw new FirecrawlError(
        mapResult.error || 'Map failed',
        'ERR::MAP::FAILED',
        500,
        true
      );
    }

    // Track credit usage (map costs 1 credit)
    trackCreditUsage(1);
    recordFirecrawlSuccess();

    const links = mapResult.links || [];

    // Filter by include/exclude paths if specified
    let filteredLinks = links;

    if (options?.includePaths?.length) {
      filteredLinks = filteredLinks.filter(link => {
        const path = new URL(link).pathname;
        return options.includePaths!.some(pattern => {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(path);
        });
      });
    }

    if (options?.excludePaths?.length) {
      filteredLinks = filteredLinks.filter(link => {
        const path = new URL(link).pathname;
        return !options.excludePaths!.some(pattern => {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(path);
        });
      });
    }

    logFirecrawl('info', 'Map complete', {
      baseUrl,
      urlsFound: links.length,
      urlsAfterFilter: filteredLinks.length,
      creditsUsed: estimatedCreditsUsed,
    });

    return filteredLinks;
  } catch (error) {
    recordFirecrawlFailure();
    
    logFirecrawl('error', 'Map failed', {
      baseUrl,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof FirecrawlError) {
      throw error;
    }

    throw new FirecrawlError(
      error instanceof Error ? error.message : String(error),
      'ERR::MAP::UNKNOWN',
      500,
      true
    );
  }
}

/**
 * Crawl a website to discover and scrape blog post content
 * 
 * WARNING: This can use many credits quickly!
 * Cost: 1 credit per page crawled
 * 
 * @param baseUrl - Starting URL for crawl
 * @param options - Crawl options including limit
 */
export async function crawlWithFirecrawl(
  baseUrl: string,
  options?: {
    maxPages?: number;
    includePaths?: string[];
    excludePaths?: string[];
  }
): Promise<FirecrawlCrawlResult> {
  if (!firecrawl) {
    throw new FirecrawlError(
      'Firecrawl API key not configured',
      'ERR::CONFIG::MISSING_API_KEY',
      500,
      false
    );
  }

  // Be very conservative with crawl on free tier
  const maxPages = Math.min(options?.maxPages || 10, 20); // Cap at 20 for free tier
  
  // Check if we have enough credits
  const creditsNeeded = maxPages;
  if (estimatedCreditsUsed + creditsNeeded > FIRECRAWL_CREDIT_LIMIT) {
    throw new FirecrawlError(
      `Not enough credits for crawl. Need ~${creditsNeeded}, have ${getEstimatedCreditsRemaining()}`,
      'ERR::CREDITS::INSUFFICIENT',
      429,
      false
    );
  }

  logFirecrawl('warn', 'Starting crawl - this will use multiple credits', {
    baseUrl,
    maxPages,
    estimatedCost: maxPages,
    creditsRemaining: getEstimatedCreditsRemaining(),
  });

  try {
    const result = await withRetry(() =>
      enqueueFirecrawlRequest(async () => {
        const response = await firecrawl.crawlUrl(baseUrl, {
          limit: maxPages,
          scrapeOptions: {
            formats: ['markdown'],
            onlyMainContent: true,
          },
          excludePaths: options?.excludePaths || [
            '/tag/*',
            '/category/*',
            '/author/*',
            '/page/*',
            '/search/*',
          ],
        });

        return response;
      })
    );

    // Type assertion
    const crawlResult = result as {
      success: boolean;
      error?: string;
      data?: Array<{
        url?: string;
        markdown?: string;
        metadata?: Record<string, unknown>;
      }>;
    };

    if (!crawlResult.success) {
      throw new FirecrawlError(
        crawlResult.error || 'Crawl failed',
        'ERR::CRAWL::FAILED',
        500,
        true
      );
    }

    const pages = crawlResult.data || [];
    const creditsUsed = pages.length;
    
    // Track credit usage
    trackCreditUsage(creditsUsed);
    recordFirecrawlSuccess();

    const urls = pages.map(page => ({
      url: page.metadata?.sourceURL as string || page.metadata?.url as string || page.url || '',
      title: (page.metadata?.title as string) || '',
      publishedDate: extractDateFromMetadata(page.metadata),
    }));

    logFirecrawl('info', 'Crawl complete', {
      baseUrl,
      pagesFound: urls.length,
      creditsUsed,
      totalCreditsUsed: estimatedCreditsUsed,
    });

    return {
      urls,
      totalFound: urls.length,
      creditsUsed,
    };
  } catch (error) {
    recordFirecrawlFailure();
    
    logFirecrawl('error', 'Crawl failed', {
      baseUrl,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof FirecrawlError) {
      throw error;
    }

    throw new FirecrawlError(
      error instanceof Error ? error.message : String(error),
      'ERR::CRAWL::UNKNOWN',
      500,
      true
    );
  }
}

// ============================================================================
// High-Level Functions (Drop-in replacements for Jina)
// ============================================================================

/**
 * Fetch blog post content with Firecrawl
 * This mirrors the Jina fetchBlogPostContentWithDate function signature
 * 
 * Cost: 1 credit
 */
export async function fetchBlogPostContentWithFirecrawl(url: string): Promise<FirecrawlBlogPostResult> {
  const result = await scrapeWithFirecrawl(url);
  return {
    content: result.content,
    publishedDate: result.publishedDate,
  };
}

/**
 * Extract blog post URLs using Firecrawl
 * Uses map for quick URL discovery (1 credit) instead of crawling each page
 * 
 * Cost: 1 credit for map + 1 credit per URL scraped for metadata
 * 
 * @param blogUrl - Base blog URL to discover posts from
 * @param maxPosts - Maximum posts to return (be conservative on free tier!)
 */
export async function extractBlogPostUrlsWithFirecrawl(
  blogUrl: string,
  maxPosts: number = 10 // Default to 10 for free tier
): Promise<Array<{ url: string; title: string; publishedDate: string | null }>> {
  // First, use map for quick URL discovery (1 credit)
  const urls = await mapWithFirecrawl(blogUrl, {
    limit: Math.min(maxPosts * 2, 50), // Get more URLs than needed for filtering
    excludePaths: ['/tag/*', '/category/*', '/author/*', '/page/*', '/search/*'],
  });

  // Filter to likely blog post URLs (exclude listing pages)
  const postUrls = urls.filter(url => {
    try {
      const path = new URL(url).pathname;
      const segments = path.split('/').filter(Boolean);
      // Exclude short paths (likely listing pages) and very short slugs
      return segments.length >= 2 && segments[segments.length - 1].length > 10;
    } catch {
      return false;
    }
  });

  // Limit to maxPosts to conserve credits
  const limitedUrls = postUrls.slice(0, maxPosts);

  logFirecrawl('info', 'Extracting blog post metadata', {
    totalUrlsFound: urls.length,
    postUrlsFiltered: postUrls.length,
    urlsToScrape: limitedUrls.length,
    estimatedCredits: limitedUrls.length + 1, // +1 for map
  });

  // Scrape each URL to get title and date (1 credit per URL)
  const posts: Array<{ url: string; title: string; publishedDate: string | null }> = [];

  for (const url of limitedUrls) {
    try {
      const result = await scrapeWithFirecrawl(url);
      posts.push({
        url,
        title: result.title || '',
        publishedDate: result.publishedDate,
      });
    } catch (error) {
      logFirecrawl('warn', 'Failed to scrape post, using URL-derived title', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Still include the URL with minimal info (no credit used)
      posts.push({
        url,
        title: url.split('/').pop()?.replace(/-/g, ' ') || '',
        publishedDate: null,
      });
    }
  }

  return posts;
}

// ============================================================================
// Provider Helper
// ============================================================================

/**
 * Get the current scraping provider setting
 */
export function getScrapingProvider(): 'jina' | 'firecrawl' {
  return SCRAPING_PROVIDER as 'jina' | 'firecrawl';
}
