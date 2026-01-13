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
    
    // Skip URLs with query parameters that indicate filtering/listing
    const searchParams = urlObj.searchParams;
    const excludeParams = ['category', 'tag', 'author', 'page', 'paged', 'search', 's', 'filter', 'sort', 'orderby', 'order'];
    for (const param of excludeParams) {
      if (searchParams.has(param)) {
        return true;
      }
    }
    
    // Skip common non-post URL patterns
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
    
    return false;
  } catch {
    // If URL parsing fails, exclude it to be safe
    return true;
  }
}

/**
 * Extract blog post URLs from a blog homepage
 * Looks for common blog post link patterns
 */
export async function extractBlogPostUrls(blogUrl: string): Promise<Array<{ url: string; title: string }>> {
  try {
    const html = await fetchHtml(blogUrl);
    const $ = cheerio.load(html);
    const baseUrl = new URL(normalizeUrl(blogUrl));
    
    const blogPosts: Array<{ url: string; title: string }> = [];
    const seenUrls = new Set<string>();

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
        "X-With-Generated-Alt": "true",
      },
      signal: AbortSignal.timeout(30000), // 30 seconds
    });

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status} - ${response.statusText}`);
    }

    const content = await response.text();

    if (!content || content.trim().length < 100) {
      throw new Error("Could not extract meaningful content from the blog post");
    }

    return content;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch blog post content: ${error.message}`);
    }
    throw new Error("Failed to fetch blog post content: Unknown error");
  }
}
