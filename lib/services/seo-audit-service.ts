import * as cheerio from "cheerio";
import { generateSeoAudit, type SeoAuditContext, type PageAnalysis } from "@/lib/ai/seo-audit";
import { testBrandConsistency } from "@/lib/ai/brand-consistency";

const JINA_READER_URL = "https://r.jina.ai";
const JINA_API_KEY = process.env.JINA_API_KEY;

// Simple in-memory cache (URL -> { result, timestamp })
const cache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
 * Parse DOM and extract structured data
 */
function parseDom(html: string): PageAnalysis["domData"] {
  const $ = cheerio.load(html);

  // Extract title
  const title = $("title").first().text().trim() || null;

  // Extract meta description
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || null;

  // Extract canonical
  const canonical =
    $('link[rel="canonical"]').attr("href")?.trim() || null;

  // Extract robots meta
  const robotsMeta =
    $('meta[name="robots"]').attr("content")?.trim() || null;

  // Extract headings (H1-H3)
  const headings: Array<{ level: number; text: string }> = [];
  $("h1, h2, h2, h3, h3").each((_, el) => {
    const level = parseInt(el.tagName.charAt(1), 10);
    const text = $(el).text().trim();
    if (text) {
      headings.push({ level, text });
    }
  });

  // Extract links
  const internalLinks: Array<{ href: string; anchorText: string }> = [];
  const externalLinks: Array<{ href: string; anchorText: string }> = [];
  const baseUrl = $('base').attr('href') || '';

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const anchorText = $(el).text().trim();
    if (!href || !anchorText) return;

    // Determine if internal or external
    try {
      const url = new URL(href, baseUrl || 'https://example.com');
      const isInternal = url.hostname === new URL(baseUrl || url.href).hostname || href.startsWith('/');
      if (isInternal) {
        internalLinks.push({ href, anchorText });
      } else {
        externalLinks.push({ href, anchorText });
      }
    } catch {
      // Relative URL - treat as internal
      if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
        internalLinks.push({ href, anchorText });
      }
    }
  });

  // Extract images
  const images: Array<{ src: string; alt: string | null }> = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    const alt = $(el).attr("alt") || null;
    if (src) {
      images.push({ src, alt });
    }
  });

  // Extract JSON-LD schema blocks
  const schemaJsonLd: Array<Record<string, any>> = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (content) {
        const parsed = JSON.parse(content);
        schemaJsonLd.push(parsed);
      }
    } catch (e) {
      // Invalid JSON-LD - skip
    }
  });

  return {
    title,
    metaDescription,
    canonical,
    robotsMeta,
    headings,
    internalLinks,
    externalLinks,
    images,
    schemaJsonLd,
  };
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
}

export interface AuditResult {
  success: boolean;
  data?: any;
  errors?: Array<{ stage: string; message: string }>;
}

export async function auditSeoPage(
  options: AuditOptions
): Promise<AuditResult> {
  const { url, context } = options;
  const errors: Array<{ stage: string; message: string }> = [];

  // Check cache
  const cacheKey = `${url}-${JSON.stringify(context || {})}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { success: true, data: cached.result };
  }

  try {
    // Step 1: Fetch Jina content
    let jinaContent: string;
    try {
      jinaContent = await fetchJinaContent(url);
    } catch (error) {
      errors.push({
        stage: "jina",
        message: error instanceof Error ? error.message : "Failed to fetch from Jina",
      });
      throw error;
    }

    // Step 2: Fetch raw HTML
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (error) {
      errors.push({
        stage: "fetch",
        message: error instanceof Error ? error.message : "Failed to fetch HTML",
      });
      // Continue with Jina content only if HTML fetch fails
      html = "";
    }

    // Step 3: Parse DOM
    let domData: PageAnalysis["domData"];
    try {
      if (html) {
        domData = parseDom(html);
      } else {
        // Fallback if HTML fetch failed
        domData = {
          title: null,
          metaDescription: null,
          canonical: null,
          robotsMeta: null,
          headings: [],
          internalLinks: [],
          externalLinks: [],
          images: [],
          schemaJsonLd: [],
        };
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
      // Use minimal DOM data
      domData = {
        title: null,
        metaDescription: null,
        canonical: null,
        robotsMeta: null,
        headings: [],
        internalLinks: [],
        externalLinks: [],
        images: [],
        schemaJsonLd: [],
      };
    }

    // Step 4: Generate audit with AI
    const analysis: PageAnalysis = {
      jinaContent,
      html,
      domData,
    };

    let auditResult;
    try {
      auditResult = await generateSeoAudit(url, analysis, context);
    } catch (error) {
      errors.push({
        stage: "analyze",
        message: error instanceof Error ? error.message : "Failed to generate audit",
      });
      throw error;
    }

    // Add brand consistency analysis if requested and accountId is provided
    if (options.includeBrandConsistency && options.accountId) {
      try {
        const brandConsistency = await testBrandConsistency(options.accountId);
        auditResult.brand_consistency = brandConsistency;
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

    // Cache the result
    cache.set(cacheKey, {
      result: auditResult,
      timestamp: Date.now(),
    });

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
