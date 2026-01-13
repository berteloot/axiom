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
 * Fetch raw HTML from URL
 */
async function fetchHtml(url: string): Promise<string> {
  const normalizedUrl = normalizeUrl(url);

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
 * Check if a URL should be excluded from extraction.
 *
 * NOTE: The extractor is used for both pure blog listings and broader "library/resources" listings.
 * For library-style listings we must NOT exclude content types like /whitepaper/, /webinar/, /brochure/, etc.
 */
function shouldExcludeUrl(url: string, baseUrl: URL): boolean {
  try {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.toLowerCase();

    const basePath = (baseUrl.pathname || "").toLowerCase();
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
      ".pdf",
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

    // Always exclude common non-content utility/admin paths
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
      "/solutions/",
      "/customers/",
      "/event/",
      "/book-a-demo/",
      "/thank-you",
      "/cookie-declaration",
      "/request-pricing",
      "/homepage-",
      // Navigation/landing pages
      "/overview",
      "/products",
      "/resources",
      // Industry/audience landing pages (not library content)
      "/pharmacies/",
      "/wholesale-distributors/",
      "/repackagers/",
      "/manufacturers/",
      "/distributors/",
      "/growers-shippers/",
      "/contract-manufacturing-packaging-organizations-cmos-cpos/",
      // Product/solution landing pages (not library content)
      "/food-and-beverage/",
      "/cpg-manufacturers/",
      "/government-usa/",
      "/consumer-goods-products/",
      "/pharmaceuticals-overview/",
      "/f-b-overview/",
      "/government-overview/",
      "/consumer-goods-overview/",
      "/pharmaceuticals/",
      "/3pl/",
      "/aim/",
    ];
    
    // Regex patterns for always-excluded paths
    const alwaysExcludeRegexPatterns = [
      /^\/\d+(-2)?\/$/, // Draft/unpublished posts (numeric slugs like /3467-2/)
    ];

    // Blog-only exclusions (too aggressive for library listings)
    const blogOnlyExcludePatterns = [
      "/solutions/",
      "/products/",
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
      // NOTE: We intentionally do NOT exclude /resources/, /whitepaper/, /webinar/, /brochure/, etc.
      // because those are core content types in library mode.
    ];

    // Check string patterns
    const stringPatterns = isLibraryContext
      ? alwaysExcludeStringPatterns
      : [...alwaysExcludeStringPatterns, ...blogOnlyExcludePatterns, "/page/", "/pages/", "/news/"];
      
    for (const pattern of stringPatterns) {
      if (urlPath.includes(pattern)) {
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
      /^\/rfxcel-[a-z-]+-processing-[a-z]+$/i,     // e.g., /rfxcel-serialization-processing-rsp/
      /^\/rfxcel-[a-z-]+-service-[a-z]+$/i,       // e.g., /rfxcel-verification-router-service-rvrs/
      /^\/rfxcel-[a-z-]+-management-[a-z]+$/i,   // e.g., /rfxcel-compliance-management-rcm/
      /^\/rfxcel-[a-z-]+-monitoring-[a-z]+$/i,    // e.g., /rfxcel-environmental-monitoring-rem/
      /^\/rfxcel-[a-z-]+-mgt-[a-z]+$/i,          // e.g., /rfxcel-accurate-immunization-mgt-raim/
      /^\/rfxcel-[a-z-]+-traceability-[a-z]+$/i, // e.g., /rfxcel-ingredients-traceability-rit/
      /^\/rfxcel-[a-z-]+$/i,                      // e.g., /rfxcel-iris/
      /^\/rfxcel-code-check-[a-z-]+$/i,          // e.g., /rfxcel-code-check-dispensers-eu/
      /^\/diamind-sentry$/i,                     // e.g., /diamind-sentry/
    ];
    
    if (productPagePatterns.some(pattern => pattern.test(urlPath))) {
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
    
    if (solutionPagePatterns.some(pattern => pattern.test(urlPath))) {
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
    const pathSegments = urlPath.split('/').filter(seg => seg.length > 0);
    if (pathSegments.length === 1 && pathSegments[0].length < 10) {
      // Single segment, very short - likely a navigation/landing page
      return true;
    }

    // Skip date-based archive URLs (e.g., /2024/, /2024/01/)
    const dateArchivePattern = /^\/(\d{4})\/(\d{2})?\/?$/;
    if (dateArchivePattern.test(urlPath)) {
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

      if (nonBlogPatterns.some((pattern) => pattern.test(urlPath))) {
        return true;
      }

      // If URL is very short, it's likely not a blog post
      const pathSegments = urlPath.split("/").filter((seg) => seg.length > 0);
      if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0].length < 5)) {
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
 * Includes retry logic for connection failures
 */
async function fetchListingPageWithJina(url: string, retries = 2): Promise<string> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set");
  }

  // Remove hash fragments before passing to Jina (e.g., #blog)
  const urlWithoutHash = url.split('#')[0];
  const normalizedUrl = normalizeUrl(urlWithoutHash);
  
  // Jina Reader expects the URL to be properly encoded
  // The URL should be appended directly, not encoded in the path
  const jinaUrl = `${JINA_READER_URL}/${normalizedUrl}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[Blog Extractor] Fetching listing page with Jina (attempt ${attempt + 1}/${retries + 1}): ${jinaUrl}`);
      
      const response = await fetch(jinaUrl, {
        headers: {
          Authorization: `Bearer ${JINA_API_KEY}`,
          Accept: "text/html", // Request HTML for better structure parsing
          "X-Respond-With": "html", // Request HTML format for better link extraction
          "X-With-Generated-Alt": "true",
          "X-No-Cache": "true",
          // Remove page chrome but keep content links
          "X-Remove-Selector": "nav,footer,header,.navigation,.sidebar,.menu,.breadcrumb,.cookie-banner,.popup,.modal",
        },
        signal: AbortSignal.timeout(120000), // 120 seconds for large listing pages
      });

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          // Rate limited - wait and retry
          const waitTime = 2000 * (attempt + 1);
          console.log(`[Blog Extractor] Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
        
        const errorText = await response.text().catch(() => '');
        console.error(`[Blog Extractor] Jina API error: ${response.status} ${response.statusText}`);
        if (errorText) {
          console.error(`[Blog Extractor] Error details: ${errorText.substring(0, 200)}`);
        }
        
        throw new Error(`Jina API error: ${response.status} - ${response.statusText}`);
      }

      const content = await response.text();
      
      if (!content || content.trim().length < 100) {
        throw new Error("Jina returned empty or insufficient content");
      }
      
      console.log(`[Blog Extractor] Jina returned ${content.length} characters from listing page`);
      
      return content;
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
        console.warn(`[Blog Extractor] Connection error (attempt ${attempt + 1}/${retries + 1}), retrying in ${waitTime}ms...`);
        console.warn(`[Blog Extractor] Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (isLastAttempt) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Blog Extractor] Failed after ${retries + 1} attempts: ${errorMessage}`);
        throw new Error(`Failed to fetch listing page with Jina after ${retries + 1} attempts: ${errorMessage}`);
      }
    }
  }

  throw new Error("Failed to fetch listing page with Jina after retries");
}

/**
 * Extract blog post URLs from markdown/text content
 */
function extractUrlsFromMarkdown(content: string, baseUrl: URL): Array<{ url: string; title: string }> {
  const blogPosts: Array<{ url: string; title: string }> = [];
  const seenUrls = new Set<string>();

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

          // Only add if we have a good title
          if (title && title.length >= 10 && absoluteUrl.startsWith('http')) {
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
    const title = match[1].trim();
    const href = match[2].trim();
    if (!href || !title) continue;

    try {
      const absoluteUrl = resolveUrl(baseUrl.href, href);
      if (seenUrls.has(absoluteUrl)) continue;
      if (shouldExcludeUrl(absoluteUrl, baseUrl)) continue;

      if (title.length >= 10 && absoluteUrl.startsWith('http')) {
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

    if (title.length >= 10 && url.startsWith('http')) {
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
          if (
            absoluteUrl.includes('page=') ||
            absoluteUrl.includes('/page/') ||
            absoluteUrl.match(/\/\d+\//) || // URL contains a number segment
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
  maxPages: number = 50
): Promise<Array<{ url: string; title: string }>> {
  const allPosts: Array<{ url: string; title: string }> = [];
  const seenPostUrls = new Set<string>();
  const visitedPages = new Set<string>();
  const pagesToVisit = [initialUrl];
  
  let pageCount = 0;
  
  while (pagesToVisit.length > 0 && pageCount < maxPages) {
    const currentUrl = pagesToVisit.shift()!;
    if (visitedPages.has(currentUrl)) continue;
    
    visitedPages.add(currentUrl);
    pageCount++;
    
    try {
      console.log(`[Blog Extractor] Fetching page ${pageCount}: ${currentUrl}`);
      const content = await fetchListingPageWithJina(currentUrl);
      const posts = extractUrlsFromMarkdown(content, baseUrl);
      
      // Add new posts
      for (const post of posts) {
        if (!seenPostUrls.has(post.url)) {
          allPosts.push(post);
          seenPostUrls.add(post.url);
        }
      }
      
      // Extract pagination links
      const paginationLinks = extractPaginationLinks(content, baseUrl);
      for (const link of paginationLinks) {
        if (!visitedPages.has(link) && !pagesToVisit.includes(link)) {
          pagesToVisit.push(link);
        }
      }
      
      console.log(`[Blog Extractor] Page ${pageCount}: Found ${posts.length} posts, ${paginationLinks.length} pagination links`);
      
      // If no pagination links found and we have posts, try constructing next page URL
      if (paginationLinks.length === 0 && posts.length > 0 && pageCount === 1) {
        // Try common pagination patterns
        const basePath = new URL(currentUrl).pathname;
        for (let page = 2; page <= 10; page++) {
          const nextPageUrls = [
            `${baseUrl.origin}${basePath}?page=${page}`,
            `${baseUrl.origin}${basePath}/page/${page}`,
            `${baseUrl.origin}${basePath}page/${page}`,
            `${baseUrl.origin}${basePath}?paged=${page}`,
          ];
          
          for (const nextUrl of nextPageUrls) {
            if (!visitedPages.has(nextUrl) && !pagesToVisit.includes(nextUrl)) {
              pagesToVisit.push(nextUrl);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[Blog Extractor] Error fetching page ${currentUrl}:`, error);
      continue;
    }
  }
  
  return allPosts;
}

/**
 * Extract blog post URLs from a blog homepage
 * Uses Jina Reader for JavaScript-rendered pages, falls back to HTML parsing
 */
export async function extractBlogPostUrls(blogUrl: string): Promise<Array<{ url: string; title: string }>> {
  const baseUrl = new URL(normalizeUrl(blogUrl));
  let blogPosts: Array<{ url: string; title: string }> = [];
  
  try {
    // First, try sitemap/RSS feeds (most reliable for getting all posts)
    try {
      const sitemapPosts = await tryFetchFromSitemapOrRSS(baseUrl);
      if (sitemapPosts.length > 0) {
        console.log(`[Blog Extractor] Found ${sitemapPosts.length} posts from sitemap/RSS`);
        blogPosts = sitemapPosts;
      }
    } catch (error) {
      console.log(`[Blog Extractor] Sitemap/RSS fetch failed, continuing with page extraction`);
    }
    
    // If sitemap didn't work or found few posts, try Jina Reader with pagination
    if (blogPosts.length < 50) {
      try {
        console.log(`[Blog Extractor] Attempting to extract with Jina Reader from ${blogUrl}...`);
        
        // Try fetching all pages with pagination
        const paginatedPosts = await fetchAllPagesWithPagination(blogUrl, baseUrl, 50);
        
        // Merge with sitemap posts (avoid duplicates)
        const existingUrls = new Set(blogPosts.map(p => p.url));
        for (const post of paginatedPosts) {
          if (!existingUrls.has(post.url)) {
            blogPosts.push(post);
            existingUrls.add(post.url);
          }
        }
        
        console.log(`[Blog Extractor] Total posts found after pagination: ${blogPosts.length}`);
        
        // If we still found very few posts, try single page extraction as fallback
        if (blogPosts.length < 20) {
          console.log(`[Blog Extractor] Trying single page extraction as fallback...`);
          const jinaContent = await fetchListingPageWithJina(blogUrl);
          
          // Log content preview for debugging
          console.log(`[Blog Extractor] Jina content preview (first 500 chars): ${jinaContent.substring(0, 500)}`);
          console.log(`[Blog Extractor] Jina content length: ${jinaContent.length} characters`);
          
          const jinaPosts = extractUrlsFromMarkdown(jinaContent, baseUrl);
          console.log(`[Blog Extractor] Single page extraction found ${jinaPosts.length} blog posts`);
          
          // Merge with existing posts
          for (const post of jinaPosts) {
            if (!existingUrls.has(post.url)) {
              blogPosts.push(post);
              existingUrls.add(post.url);
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
    if (blogPosts.length < 5) {
      console.log(`[Blog Extractor] Falling back to HTML parsing (found ${blogPosts.length} posts with Jina)...`);
      const html = await fetchHtml(blogUrl);
      const $ = cheerio.load(html);
      const seenUrls = new Set(blogPosts.map(p => p.url));

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
        $(selector).each((_, element) => {
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

          // Only add if we have a reasonable title and URL
          if (title && title.length >= 10 && absoluteUrl.startsWith('http')) {
            blogPosts.push({ url: absoluteUrl, title });
            seenUrls.add(absoluteUrl);
          }
        });
      }
    }

    // Last resort: JS-rendered listings (common for /library/ and some /resources/ pages)
    if (blogPosts.length < 50) {
      try {
        console.log(`[Blog Extractor] Attempting Puppeteer extraction (found ${blogPosts.length} posts so far)...`);
        const renderedHtml = await fetchListingPageWithPuppeteer(blogUrl, 30);
        const renderedPosts = extractUrlsFromMarkdown(renderedHtml, baseUrl);

        const existingUrls = new Set(blogPosts.map((p) => p.url));
        for (const post of renderedPosts) {
          if (!existingUrls.has(post.url)) {
            blogPosts.push(post);
            existingUrls.add(post.url);
          }
        }

        console.log(`[Blog Extractor] Puppeteer extraction added ${renderedPosts.length} items; total is now ${blogPosts.length}`);
      } catch (error) {
        console.warn(`[Blog Extractor] Puppeteer extraction failed:`, error);
      }
    }

    // Remove duplicates and sort
    const uniquePosts = Array.from(
      new Map(blogPosts.map(post => [post.url, post])).values()
    );

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
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set");
  }

  try {
    const normalizedUrl = normalizeUrl(url);
    const jinaUrl = `${JINA_READER_URL}/${normalizedUrl}`;
    
    const response = await fetch(jinaUrl, {
      headers: {
        Authorization: `Bearer ${JINA_API_KEY}`,
        Accept: "text/plain",
        "X-Respond-With": "markdown", // Request full markdown content
        "X-With-Generated-Alt": "true",
        "X-No-Cache": "true", // Get fresh content
        // Remove navigation, footer, header, sidebar, and other page chrome
        "X-Remove-Selector": "nav,footer,header,.navigation,.sidebar,.menu,.breadcrumb,.social-share,.related-posts,.comments,.newsletter,.subscribe,.cookie-banner,.popup,.modal",
        // Target main article content areas
        "X-Target-Selector": "article,main,.post-content,.entry-content,.article-content,.blog-post,.post-body,.content-main",
      },
      signal: AbortSignal.timeout(60000), // 60 seconds for full content
    });

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status} - ${response.statusText}`);
    }

    const content = await response.text();

    if (!content || content.trim().length < 100) {
      throw new Error("Could not extract meaningful content from the blog post");
    }

    // Log content length for debugging
    console.log(`[Blog Extractor] Fetched ${content.length} characters from ${url}`);
    
    // Return full content (no truncation for blog posts)
    return content;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch blog post content: ${error.message}`);
    }
    throw new Error("Failed to fetch blog post content: Unknown error");
  }
}
