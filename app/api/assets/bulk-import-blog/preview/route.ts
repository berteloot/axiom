import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import { extractBlogPostUrls, fetchHtml, extractPublishedDateFromHtml } from "@/lib/services/blog-extractor";
import { detectAssetTypeFromUrl, detectAssetTypeFromHtml } from "@/lib/constants/asset-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Detect language from URL path
 * Common patterns: /de/, /fr/, /en/, /es/, /it/, /pt/, /nl/, /ja/, /zh/, /ko/
 */
function detectLanguageFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    
    // Common language codes in URL paths
    const languagePatterns = [
      { pattern: /^\/de(\/|$)/, code: "de", name: "German" },
      { pattern: /^\/fr(\/|$)/, code: "fr", name: "French" },
      { pattern: /^\/en(\/|$)/, code: "en", name: "English" },
      { pattern: /^\/es(\/|$)/, code: "es", name: "Spanish" },
      { pattern: /^\/it(\/|$)/, code: "it", name: "Italian" },
      { pattern: /^\/pt(\/|$)/, code: "pt", name: "Portuguese" },
      { pattern: /^\/nl(\/|$)/, code: "nl", name: "Dutch" },
      { pattern: /^\/ja(\/|$)/, code: "ja", name: "Japanese" },
      { pattern: /^\/zh(\/|$)/, code: "zh", name: "Chinese" },
      { pattern: /^\/ko(\/|$)/, code: "ko", name: "Korean" },
      { pattern: /^\/ru(\/|$)/, code: "ru", name: "Russian" },
      { pattern: /^\/pl(\/|$)/, code: "pl", name: "Polish" },
      { pattern: /^\/sv(\/|$)/, code: "sv", name: "Swedish" },
      { pattern: /^\/no(\/|$)/, code: "no", name: "Norwegian" },
      { pattern: /^\/da(\/|$)/, code: "da", name: "Danish" },
      { pattern: /^\/fi(\/|$)/, code: "fi", name: "Finnish" },
      // Also check for language in subdomain or query param
      { pattern: /[\?&]lang=de/, code: "de", name: "German" },
      { pattern: /[\?&]lang=fr/, code: "fr", name: "French" },
      { pattern: /[\?&]lang=en/, code: "en", name: "English" },
    ];
    
    for (const { pattern, code } of languagePatterns) {
      if (pattern.test(path) || pattern.test(urlObj.search)) {
        return code;
      }
    }
    
    // Check hostname for language subdomains
    const hostname = urlObj.hostname;
    if (hostname.startsWith("de.") || hostname.includes(".de.")) return "de";
    if (hostname.startsWith("fr.") || hostname.includes(".fr.")) return "fr";
    if (hostname.startsWith("en.") || hostname.includes(".en.")) return "en";
    
    return null; // Default/unknown language
  } catch {
    return null;
  }
}

/**
 * Process posts in batches with concurrency limit
 */
async function processBatchWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * POST /api/assets/bulk-import-blog/preview
 * Preview blog posts from a blog URL without importing them
 * Also checks for duplicates
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const { blogUrl, maxPosts, dateRangeStart, dateRangeEnd, languageFilter } = body;

    // Hard validation with actionable error messages
    if (!blogUrl || typeof blogUrl !== "string") {
      console.error(`[Bulk Import Preview] Missing or invalid blogUrl parameter. Received:`, { blogUrl, type: typeof blogUrl });
      return NextResponse.json(
        { error: "blogUrl is required and must be a string" },
        { status: 400 }
      );
    }

    const trimmedUrl = blogUrl.trim();
    if (!trimmedUrl) {
      console.error(`[Bulk Import Preview] blogUrl is empty or whitespace only`);
      return NextResponse.json(
        { error: "blogUrl cannot be empty" },
        { status: 400 }
      );
    }

    // Validate URL format
    let normalizedUrl: string;
    try {
      // Try to construct URL - if it fails, it's invalid
      const urlObj = new URL(trimmedUrl);
      normalizedUrl = urlObj.href;
    } catch (urlError) {
      console.error(`[Bulk Import Preview] Invalid URL format: "${trimmedUrl}"`, urlError);
      // If no protocol, try adding https://
      if (!trimmedUrl.match(/^https?:\/\//i)) {
        try {
          const urlWithProtocol = `https://${trimmedUrl}`;
          const urlObj = new URL(urlWithProtocol);
          normalizedUrl = urlObj.href;
          console.log(`[Bulk Import Preview] Added https:// protocol, normalized to: ${normalizedUrl}`);
        } catch (retryError) {
          return NextResponse.json(
            { error: `Invalid blogUrl format: "${trimmedUrl}". Please provide a valid URL (e.g., https://example.com/blog)` },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: `Invalid blogUrl format: "${trimmedUrl}". Please provide a valid URL (e.g., https://example.com/blog)` },
          { status: 400 }
        );
      }
    }

    // Extract blog post URLs with maxPosts and date range limits
    // This will stop early when enough matching posts are found
    console.log(`[Bulk Import Preview] Extracting blog posts from ${normalizedUrl}... (maxPosts: ${maxPosts || 'unlimited'}, dateRange: ${dateRangeStart || 'none'} to ${dateRangeEnd || 'none'})`);
    
    let blogPosts: Array<{ url: string; title: string; publishedDate: string | null }> = [];
    try {
      blogPosts = await extractBlogPostUrls(
        normalizedUrl,
        maxPosts ? Number(maxPosts) : undefined,
        dateRangeStart || null,
        dateRangeEnd || null
      );
      
      console.log(`[Bulk Import Preview] Extraction completed. Found ${blogPosts.length} posts.`);
    } catch (extractionError) {
      console.error(`[Bulk Import Preview] Extraction failed:`, extractionError);
      const errorMessage = extractionError instanceof Error ? extractionError.message : 'Unknown extraction error';
      return NextResponse.json(
        { error: `Failed to extract blog posts: ${errorMessage}` },
        { status: 500 }
      );
    }
    
    if (blogPosts.length === 0) {
      console.warn(`[Bulk Import Preview] No posts found for ${normalizedUrl}. This could mean:
        - The URL is not a blog listing page
        - The page structure doesn't match expected patterns
        - All posts were filtered out by exclusion rules
        - The sitemap doesn't contain blog posts
        - The page requires JavaScript rendering that failed`);
      return NextResponse.json(
        { error: "No blog posts found on this page. Please check the URL and ensure it's a blog listing page." },
        { status: 400 }
      );
    }

    // Check for duplicates by sourceUrl in atomicSnippets
    // Fetch all assets with atomicSnippets and filter in memory (Prisma JSON filtering is limited)
    const sourceUrls = blogPosts.map(post => post.url);
    const existingAssets = await prisma.asset.findMany({
      where: {
        accountId,
        atomicSnippets: {
          not: null,
        },
      },
      select: {
        id: true,
        title: true,
        atomicSnippets: true,
      },
    });

    // Create a map of existing source URLs
    const existingSourceUrls = new Map<string, string>(); // url -> assetId
    existingAssets.forEach(asset => {
      const snippets = asset.atomicSnippets as any;
      if (snippets?.sourceUrl && typeof snippets.sourceUrl === "string") {
        existingSourceUrls.set(snippets.sourceUrl, asset.id);
      }
    });

    // Detect language for each post and collect available languages
    const postsWithLanguage = blogPosts.map(post => ({
      ...post,
      language: detectLanguageFromUrl(post.url),
    }));
    
    // Get unique languages for filtering UI
    const detectedLanguages = [...new Set(postsWithLanguage.map(p => p.language).filter(Boolean))] as string[];

    // Filter by language if provided
    let filteredPosts = postsWithLanguage;
    if (languageFilter && languageFilter !== "all") {
      filteredPosts = postsWithLanguage.filter(post => post.language === languageFilter);
    }

    // Filter by date range if provided
    if (dateRangeStart || dateRangeEnd) {
      filteredPosts = filteredPosts.filter(post => {
        const publishedDate = post.publishedDate;
        if (!publishedDate) {
          // Include posts without dates if date range is specified
          // (user can see them but they won't be filtered out)
          return true;
        }
        
        const postDate = new Date(publishedDate);
        const startDate = dateRangeStart ? new Date(dateRangeStart) : null;
        const endDate = dateRangeEnd ? new Date(dateRangeEnd) : null;
        
        // Set time to end of day for end date to include the full day
        if (endDate) {
          endDate.setHours(23, 59, 59, 999);
        }
        
        if (startDate && postDate < startDate) {
          return false;
        }
        if (endDate && postDate > endDate) {
          return false;
        }
        
        return true;
      });
    }

    // Enrich blog posts with duplicate information, detected asset type, and dates
    // Use batch processing with concurrency limit to avoid overwhelming the server
    console.log(`[Bulk Import Preview] Enriching ${filteredPosts.length} posts with HTML detection...`);
    
    // Helper to check if URL is same-domain HTML (not PDF)
    const isSameDomainHtml = (url: string, baseUrl: string): boolean => {
      try {
        const urlObj = new URL(url);
        const baseUrlObj = new URL(baseUrl);
        
        // Must be same domain
        if (urlObj.hostname !== baseUrlObj.hostname && 
            urlObj.hostname !== `www.${baseUrlObj.hostname}` &&
            baseUrlObj.hostname !== `www.${urlObj.hostname}`) {
          return false;
        }
        
        // Must not be a PDF
        const path = urlObj.pathname.toLowerCase();
        if (path.endsWith('.pdf')) {
          return false;
        }
        
        return true;
      } catch {
        return false;
      }
    };
    
    // Use normalizedUrl for same-domain checks
    const baseUrlForChecks = normalizedUrl;
    
    const enrichedPosts = await processBatchWithConcurrency(
      filteredPosts,
      async (post) => {
        let detectedType = detectAssetTypeFromUrl(post.url);
        let publishedDate = post.publishedDate;
        let fetchedHtml: string | null = null;
        
        // ALWAYS try HTML-based detection to get the most accurate type
        // URL-based detection is just a fast first pass, but HTML has the definitive signals
        try {
          fetchedHtml = await fetchHtml(post.url).catch(() => null);
          if (fetchedHtml) {
            // HTML-based detection is more reliable - use it if we get a result
            const htmlDetectedType = await detectAssetTypeFromHtml(post.url, fetchedHtml);
            if (htmlDetectedType) {
              detectedType = htmlDetectedType;
            }
            // Extract date from HTML if not found in URL
            if (!publishedDate) {
              const extractedDate = extractPublishedDateFromHtml(post.url, fetchedHtml);
              if (extractedDate) {
                publishedDate = extractedDate;
                console.log(`[Bulk Import Preview] Extracted date ${publishedDate} from HTML for ${post.url}`);
              } else {
                console.log(`[Bulk Import Preview] No date found in HTML for ${post.url}`);
              }
            }
          }
        } catch (error) {
          // HTML fetch failed, keep detectedType from URL (if any)
          console.log(`[Bulk Import Preview] Failed to fetch HTML for ${post.url}:`, error);
        }
        
        // Fallback: For items extracted from blog URLs, default to "Blog Post"
        // Never use "Web Page" as all items are web pages - use specific content types
        if (!detectedType && isSameDomainHtml(post.url, baseUrlForChecks)) {
          // If we couldn't detect a specific type but it's from the blog domain,
          // default to "Blog Post" (unless it's a PDF)
          if (!post.url.toLowerCase().endsWith('.pdf')) {
            detectedType = "Blog Post";
          }
        }
        
        return {
          url: post.url,
          title: post.title,
          isDuplicate: existingSourceUrls.has(post.url),
          existingAssetId: existingSourceUrls.get(post.url),
          detectedAssetType: detectedType,
          isUnknownType: detectedType === null,
          publishedDate,
          language: post.language,
        };
      },
      5 // Process 5 posts at a time
    );

    const duplicateCount = enrichedPosts.filter(p => p.isDuplicate).length;
    const newCount = enrichedPosts.length - duplicateCount;

    return NextResponse.json({
      success: true,
      posts: enrichedPosts,
      total: enrichedPosts.length,
      duplicates: duplicateCount,
      new: newCount,
      detectedLanguages, // Available languages for filtering
    });
  } catch (error) {
    console.error("[Bulk Import Preview] Error previewing blog posts:", error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      // If it's a URL parsing error, return 400
      if (error.message.includes("Invalid URL") || error.message.includes("URL")) {
        return NextResponse.json(
          { error: `Invalid blogUrl: ${error.message}` },
          { status: 400 }
        );
      }
      
      // If it's a network/fetch error, return 500 with details
      if (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("ECONNREFUSED")) {
        return NextResponse.json(
          { error: `Failed to fetch blog URL: ${error.message}. Please check that the URL is accessible.` },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to preview blog posts. Please check the URL and try again.",
      },
      { status: 500 }
    );
  }
}
