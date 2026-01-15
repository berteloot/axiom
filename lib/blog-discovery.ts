/**
 * PHASE 1: Blog URL Discovery
 * 
 * Discovers blog post URLs using cheap/free methods in order of cost:
 * 1. Sitemap parsing (FREE)
 * 2. RSS feed parsing (FREE)
 * 3. Firecrawl Map endpoint (CHEAP - ~1 credit, just URLs)
 * 
 * Returns URLs with basic metadata (NO content scraping)
 */

import * as cheerio from 'cheerio';

export interface DiscoveredUrl {
  url: string;
  title: string;
  publishedDate: string | null;
}

export interface DiscoveryResult {
  urls: DiscoveredUrl[];
  discoveryMethod: 'sitemap' | 'rss' | 'firecrawl-map' | 'firecrawl-crawl';
  creditsUsed: number;
  fallbackRequired?: boolean;
}

/**
 * Derive title from URL slug
 */
export function deriveTitleFromSlug(url: string): string {
  try {
    const urlObj = new URL(url);
    const slug = urlObj.pathname.split('/').filter(p => p).pop() || '';
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim() || 'Blog Post';
  } catch {
    return 'Blog Post';
  }
}

/**
 * Extract date from URL pattern (e.g., /2024/01/15/article-name)
 */
function extractDateFromUrl(url: string): string | null {
  const patterns = [
    /\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//,
    /\/(\d{4})-(\d{1,2})-(\d{1,2})\//,
    /\/(\d{4})(\d{2})(\d{2})\//,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10)
      );
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
  }

  return null;
}

/**
 * Process a single sitemap URL entry - filters out category/archive pages
 */
function processSitemapUrl(loc: string, el: cheerio.Cheerio<cheerio.Element>): DiscoveredUrl | null {
  try {
    const urlObj = new URL(loc);
    const path = urlObj.pathname.toLowerCase();
    const pathSegments = path.split('/').filter(p => p);
    
    // Exclude category/archive pages (single segment paths)
    // Examples to exclude: /news/, /resources/, /blog/ (if it's just the category)
    if (pathSegments.length <= 1) {
      return null; // Category/archive page, not a post
    }
    
    // Exclude pagination pages
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (/^page[-_]?\d+$/i.test(lastSegment) || /^\d+$/.test(lastSegment)) {
      return null; // Pagination page
    }
    
    // Exclude feed/RSS/sitemap URLs
    if (
      path.endsWith('/feed') ||
      path.endsWith('/rss') ||
      path.endsWith('/atom') ||
      path.endsWith('/sitemap.xml')
    ) {
      return null;
    }
    
    // Only include URLs that look like blog posts
    // Must have a slug (descriptive last segment with hyphens)
    const hasSlug = lastSegment.includes('-') && lastSegment.length > 15;
    
    // Or must be in a blog-related path
    const isBlogPath = 
      path.includes('/blog/') ||
      path.includes('/post/') ||
      path.includes('/article/') ||
      path.includes('/news/') ||
      path.includes('/resources/');
    
    if (!hasSlug && !isBlogPath) {
      return null; // Doesn't look like a blog post
    }
    
    // Additional check: exclude if it's just a category name (e.g., /blog/news/ or /blog/resources/)
    // A real post would have: /blog/news/article-title or /resources/article-title
    if (isBlogPath && pathSegments.length === 2) {
      // Only 2 segments like /blog/news or /resources/article
      // If the second segment is short and has no hyphens, it's likely a category
      if (lastSegment.length < 15 && !lastSegment.includes('-')) {
        return null; // Likely a category page
      }
    }
    
    const lastmod = el.find('lastmod').text().trim();
    const publishedDate = lastmod
      ? new Date(lastmod).toISOString().split('T')[0]
      : extractDateFromUrl(loc);

    return {
      url: loc,
      title: deriveTitleFromSlug(loc),
      publishedDate,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch URLs from sitemap.xml
 */
async function fetchUrlsFromSitemap(blogUrl: string): Promise<DiscoveredUrl[]> {
  try {
    const urlObj = new URL(blogUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    
    // Try common sitemap locations
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/wp-sitemap.xml`, // WordPress
      `${baseUrl}/sitemap-blog.xml`,
    ];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await fetch(sitemapUrl, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) continue;

        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        const urls: DiscoveredUrl[] = [];

        // Check if this is a sitemap index (points to other sitemaps)
        const isSitemapIndex = $('sitemapindex').length > 0;
        
        if (isSitemapIndex) {
          // Follow sitemap index entries to get actual sitemaps
          const sitemapRefs: string[] = [];
          $('sitemapindex > sitemap').each((_, el) => {
            const sitemapLoc = $(el).find('loc').text().trim();
            if (sitemapLoc) {
              sitemapRefs.push(sitemapLoc);
            }
          });
          
          // Fetch each referenced sitemap
          for (const sitemapRef of sitemapRefs.slice(0, 10)) { // Limit to 10 to avoid too many requests
            try {
              const refResponse = await fetch(sitemapRef, {
                signal: AbortSignal.timeout(10000),
              });
              if (refResponse.ok) {
                const refXml = await refResponse.text();
                const $ref = cheerio.load(refXml, { xmlMode: true });
                
                $ref('urlset > url').each((_, el) => {
                  const loc = $ref(el).find('loc').text().trim();
                  if (!loc) return;
                  
                  const discovered = processSitemapUrl(loc, $ref(el));
                  if (discovered) {
                    urls.push(discovered);
                  }
                });
              }
            } catch (e) {
              console.log(`[Discovery] Failed to fetch sitemap reference ${sitemapRef}:`, e);
            }
          }
        } else {
          // Regular sitemap - parse URLs directly
          $('urlset > url').each((_, el) => {
            const loc = $(el).find('loc').text().trim();
            if (!loc) return;
            
            const discovered = processSitemapUrl(loc, $(el));
            if (discovered) {
              urls.push(discovered);
            }
          });
        }

        if (urls.length > 0) {
          console.log(`[Discovery] Found ${urls.length} URLs from sitemap: ${sitemapUrl}`);
          return urls;
        }
      } catch (e) {
        // Try next sitemap location
        continue;
      }
    }

    return [];
  } catch (error) {
    console.log('[Discovery] Sitemap fetch failed:', error);
    return [];
  }
}

/**
 * Fetch URLs from RSS feed
 */
async function fetchUrlsFromRSS(blogUrl: string): Promise<DiscoveredUrl[]> {
  try {
    const urlObj = new URL(blogUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    
    // Try common RSS feed locations
    const rssUrls = [
      `${baseUrl}/feed`,
      `${baseUrl}/rss`,
      `${baseUrl}/rss.xml`,
      `${baseUrl}/feed.xml`,
      `${baseUrl}/blog/feed`,
      `${baseUrl}/blog/rss`,
      `${blogUrl}/feed`,
      `${blogUrl}/rss`,
    ];

    for (const rssUrl of rssUrls) {
      try {
        const response = await fetch(rssUrl, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) continue;

        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        const urls: DiscoveredUrl[] = [];

        // Parse RSS entries
        $('item, entry').each((_, el) => {
          const link = $(el).find('link').text().trim() || 
                      $(el).find('link').attr('href') ||
                      $(el).find('id').text().trim();
          
          if (!link) return;

          const title = $(el).find('title').text().trim() || deriveTitleFromSlug(link);
          const pubDate = $(el).find('pubDate, published, updated').text().trim();
          const publishedDate = pubDate
            ? new Date(pubDate).toISOString().split('T')[0]
            : extractDateFromUrl(link);

          urls.push({
            url: link,
            title,
            publishedDate,
          });
        });

        if (urls.length > 0) {
          console.log(`[Discovery] Found ${urls.length} URLs from RSS: ${rssUrl}`);
          return urls;
        }
      } catch (e) {
        // Try next RSS location
        continue;
      }
    }

    return [];
  } catch (error) {
    console.log('[Discovery] RSS fetch failed:', error);
    return [];
  }
}

/**
 * Discover blog post URLs using cheap/free methods
 * 
 * Tries methods in order of cost:
 * 1. Sitemap (FREE)
 * 2. RSS Feed (FREE)
 * 3. Firecrawl Map (CHEAP - ~1 credit)
 * 
 * @param blogUrl - Base blog URL
 * @param options - Discovery options
 * @returns Discovery result with URLs and method used
 */
export async function discoverBlogUrls(
  blogUrl: string,
  options?: {
    maxUrls?: number;
  }
): Promise<DiscoveryResult> {
  const maxUrls = options?.maxUrls || 100;
  let discoveryMethod: 'sitemap' | 'rss' | 'firecrawl-map' | 'firecrawl-crawl' = 'sitemap';
  let urls: DiscoveredUrl[] = [];

  console.log(`[Discovery] Starting URL discovery for: ${blogUrl}`);

  // Method 1: Try sitemap (FREE)
  console.log('[Discovery] Trying sitemap...');
  try {
    const sitemapUrls = await fetchUrlsFromSitemap(blogUrl);
    if (sitemapUrls.length > 0) {
      // If we got very few URLs (likely category pages), try RSS as well
      if (sitemapUrls.length < 5) {
        console.log(`[Discovery] Only ${sitemapUrls.length} URLs from sitemap (may be category pages), trying RSS...`);
        try {
          const rssUrls = await fetchUrlsFromRSS(blogUrl);
          if (rssUrls.length > sitemapUrls.length) {
            console.log(`[Discovery] ✅ Found ${rssUrls.length} URLs from RSS (better than sitemap)`);
            urls = rssUrls.slice(0, maxUrls);
            discoveryMethod = 'rss';
            return { urls, discoveryMethod, creditsUsed: 0 };
          }
        } catch (e) {
          // RSS failed, use sitemap results
        }
      }
      
      // Validate that we got actual blog posts, not just category pages
      const validPosts = sitemapUrls.filter(u => {
        try {
          const urlObj = new URL(u.url);
          const pathSegments = urlObj.pathname.split('/').filter(p => p);
          const lastSegment = pathSegments[pathSegments.length - 1] || '';
          // A real post should have a slug (hyphens, reasonable length) or be in a deep path
          return pathSegments.length >= 2 && (lastSegment.includes('-') || lastSegment.length > 15);
        } catch {
          return false;
        }
      });
      
      if (validPosts.length === 0 && sitemapUrls.length > 0) {
        console.log(`[Discovery] Sitemap returned ${sitemapUrls.length} URLs but none look like blog posts (likely category pages), trying RSS...`);
        // Don't return yet - try RSS instead
      } else {
        console.log(`[Discovery] ✅ Found ${validPosts.length} valid blog posts from sitemap (FREE)`);
        urls = validPosts.slice(0, maxUrls);
        discoveryMethod = 'sitemap';
        return { urls, discoveryMethod, creditsUsed: 0 };
      }
    }
  } catch (e) {
    console.log('[Discovery] Sitemap failed:', e instanceof Error ? e.message : e);
  }

  // Method 2: Try RSS feed (FREE)
  console.log('[Discovery] Trying RSS feed...');
  try {
    const rssUrls = await fetchUrlsFromRSS(blogUrl);
    if (rssUrls.length > 0) {
      console.log(`[Discovery] ✅ Found ${rssUrls.length} URLs from RSS (FREE)`);
      urls = rssUrls.slice(0, maxUrls);
      discoveryMethod = 'rss';
      return { urls, discoveryMethod, creditsUsed: 0 };
    }
  } catch (e) {
    console.log('[Discovery] RSS failed:', e instanceof Error ? e.message : e);
  }

  // Method 3: Firecrawl Map (CHEAP - ~1 credit)
  console.log('[Discovery] Trying Firecrawl Map...');
  try {
    const { mapWithFirecrawl } = await import('./services/firecrawl-client');
    const mappedUrls = await mapWithFirecrawl(blogUrl, { limit: maxUrls });
    
    if (mappedUrls.length > 0) {
      console.log(`[Discovery] ✅ Found ${mappedUrls.length} URLs from Firecrawl Map (1 credit)`);
      urls = mappedUrls.map(url => ({
        url,
        title: deriveTitleFromSlug(url),
        publishedDate: extractDateFromUrl(url),
      }));
      discoveryMethod = 'firecrawl-map';
      return { urls, discoveryMethod, creditsUsed: 1 };
    }
  } catch (e) {
    console.log('[Discovery] Firecrawl Map failed:', e instanceof Error ? e.message : e);
  }

  // If all methods fail, return empty and signal that crawl will be needed
  console.log('[Discovery] ❌ All discovery methods failed');
  return {
    urls: [],
    discoveryMethod: 'firecrawl-crawl',
    creditsUsed: 0,
    fallbackRequired: true,
  };
}
