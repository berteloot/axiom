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
 * Check if a URL should be excluded from blog post extraction
 */
function shouldExcludeUrl(url: string, baseUrl: URL): boolean {
  try {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.toLowerCase();
    
    // Skip if it's the same as the blog URL or homepage
    if (url === baseUrl.href || url === `${baseUrl.protocol}//${baseUrl.host}/`) return true;
    
    // Skip URLs with fragments (anchors)
    if (url.includes('#')) return true;
    
    // Skip if URL is from a different domain (CDN, external links, etc.)
    if (urlObj.hostname !== baseUrl.hostname && urlObj.hostname !== `www.${baseUrl.hostname}` && baseUrl.hostname !== `www.${urlObj.hostname}`) {
      return true;
    }
    
    // Skip image/media file URLs
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.pdf', '.mp4', '.mp3', '.avi', '.mov', '.wmv', '.zip', '.rar', '.exe', '.dmg'];
    if (imageExtensions.some(ext => urlPath.toLowerCase().endsWith(ext))) {
      return true;
    }
    
    // Skip CDN URLs
    if (urlObj.hostname.includes('cdn.') || urlObj.hostname.includes('static.') || urlObj.hostname.includes('assets.')) {
      return true;
    }
    
    // Skip URLs with query parameters that indicate filtering/listing
    const searchParams = urlObj.searchParams;
    const excludeParams = ['category', 'tag', 'author', 'page', 'paged', 'search', 's', 'filter', 'sort', 'orderby', 'order'];
    for (const param of excludeParams) {
      if (searchParams.has(param)) {
        return true;
      }
    }
    
    // Skip common non-post URL patterns (expanded list)
    const excludePatterns = [
      '/category/',
      '/tag/',
      '/tags/',
      '/author/',
      '/authors/',
      '/page/',
      '/pages/',
      '/archive/',
      '/archives/',
      '/search',
      '/sitemap',
      '/feed',
      '/rss',
      '/atom',
      '/contact',
      '/about',
      '/about-us',
      '/privacy',
      '/terms',
      '/legal',
      '/subscribe',
      '/newsletter',
      '/login',
      '/register',
      '/signup',
      '/sign-in',
      '/wp-admin',
      '/wp-content',
      '/wp-includes',
      '/.well-known',
      '/solutions/',
      '/products/',
      '/product/',
      '/services/',
      '/service/',
      '/industries/',
      '/industry/',
      '/company/',
      '/team/',
      '/careers/',
      '/career/',
      '/jobs/',
      '/job/',
      '/pricing/',
      '/prices/',
      '/demo/',
      '/demos/',
      '/download/',
      '/downloads/',
      '/resources/',
      '/resource/',
      '/library',
      '/whitepaper/',
      '/whitepapers/',
      '/webinar/',
      '/webinars/',
      '/video/',
      '/videos/',
      '/news/',
      '/publication/',
      '/publications/',
      '/customer-story/',
      '/customer-stories/',
      '/case-study/',
      '/case-studies/',
      '/brochure/',
      '/brochures/',
    ];
    
    // Check if URL path contains any exclude pattern
    if (excludePatterns.some(pattern => urlPath.includes(pattern))) {
      return true;
    }
    
    // Skip date-based archive URLs (e.g., /2024/, /2024/01/)
    const dateArchivePattern = /^\/(\d{4})\/(\d{2})?\/?$/;
    if (dateArchivePattern.test(urlPath)) {
      return true;
    }
    
    // Skip if URL ends with common non-post extensions or paths
    if (urlPath.endsWith('/feed') || 
        urlPath.endsWith('/rss') || 
        urlPath.endsWith('/atom') ||
        urlPath.endsWith('/sitemap.xml') ||
        urlPath.endsWith('/robots.txt')) {
      return true;
    }
    
    // Additional positive validation: exclude obvious non-blog pages
    // Skip if URL looks like a product/solution page (common patterns)
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
    
    if (nonBlogPatterns.some(pattern => pattern.test(urlPath))) {
      return true;
    }
    
    // If URL is very short (just root or one segment), it's likely not a blog post
    const pathSegments = urlPath.split('/').filter(seg => seg.length > 0);
    if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0].length < 5)) {
      return true;
    }
    
    return false;
  } catch {
    // If URL parsing fails, exclude it to be safe
    return true;
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
          Accept: "text/plain",
          "X-Respond-With": "markdown",
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

          let title = $link.text().trim();
          if (!title || title.length < 10) {
            title = $link.closest('article, .post, .blog-post, .card, h2, h3').find('h1, h2, h3, .title, .entry-title').first().text().trim() || title;
          }

          if (title.length >= 10 && absoluteUrl.startsWith('http')) {
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
 * Extract blog post URLs from a blog homepage
 * Uses Jina Reader for JavaScript-rendered pages, falls back to HTML parsing
 */
export async function extractBlogPostUrls(blogUrl: string): Promise<Array<{ url: string; title: string }>> {
  const baseUrl = new URL(normalizeUrl(blogUrl));
  let blogPosts: Array<{ url: string; title: string }> = [];
  
  try {
    // Try Jina Reader first (handles JavaScript-rendered SPAs)
    try {
      console.log(`[Blog Extractor] Attempting to extract with Jina Reader from ${blogUrl}...`);
      const jinaContent = await fetchListingPageWithJina(blogUrl);
      blogPosts = extractUrlsFromMarkdown(jinaContent, baseUrl);
      console.log(`[Blog Extractor] Jina extraction found ${blogPosts.length} blog posts`);
    } catch (jinaError) {
      console.warn(`[Blog Extractor] Jina extraction failed, falling back to HTML:`, jinaError);
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
