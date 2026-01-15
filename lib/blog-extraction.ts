/**
 * PHASE 3: Selective Blog Post Scraping
 * 
 * Scrapes only selected URLs with Firecrawl.
 * ⚠️ Uses 1 credit per URL!
 * 
 * This should only be called AFTER:
 * 1. URL discovery (Phase 1)
 * 2. Duplicate checking (Phase 2)
 * 3. User selection
 */

import { scrapeWithFirecrawl } from './services/firecrawl-client';
import { deriveTitleFromSlug } from './blog-discovery';

export interface ScrapedPost {
  url: string;
  title: string;
  content: string;
  publishedDate: string | null;
  success: boolean;
  error?: string;
}

/**
 * Scrape selected URLs with Firecrawl
 * 
 * ⚠️ Uses 1 credit per URL!
 * 
 * @param urls - Array of URLs to scrape (should be pre-filtered for duplicates)
 * @param onProgress - Optional progress callback (completed, total)
 * @returns Full content for each URL
 */
export async function scrapeSelectedUrls(
  urls: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<ScrapedPost[]> {
  console.log(`[Scrape] Scraping ${urls.length} URLs (${urls.length} credits will be used)`);

  if (urls.length === 0) {
    return [];
  }

  const results: ScrapedPost[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    onProgress?.(i + 1, urls.length);

    try {
      console.log(`[Scrape] Scraping ${i + 1}/${urls.length}: ${url}`);
      const result = await scrapeWithFirecrawl(url);
      
      results.push({
        url,
        title: result.title || deriveTitleFromSlug(url),
        content: result.content,
        publishedDate: result.publishedDate,
        success: true,
      });

      console.log(`[Scrape] ✅ Success: ${result.content.length} chars`);
    } catch (error) {
      console.error(`[Scrape] ❌ Failed for ${url}:`, error);
      results.push({
        url,
        title: deriveTitleFromSlug(url),
        content: '',
        publishedDate: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const successful = results.filter(r => r.success).length;
  console.log(`[Scrape] Completed: ${successful}/${urls.length} successful (${urls.length} credits used)`);

  return results;
}

/**
 * Scrape a single URL (convenience function)
 */
export async function scrapeSingleUrl(url: string): Promise<ScrapedPost> {
  const results = await scrapeSelectedUrls([url]);
  return results[0] || {
    url,
    title: deriveTitleFromSlug(url),
    content: '',
    publishedDate: null,
    success: false,
    error: 'No result returned',
  };
}
