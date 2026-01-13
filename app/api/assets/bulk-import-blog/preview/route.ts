import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import { extractBlogPostUrls, fetchHtml } from "@/lib/services/blog-extractor";
import { detectAssetTypeFromUrl, detectAssetTypeFromHtml } from "@/lib/constants/asset-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assets/bulk-import-blog/preview
 * Preview blog posts from a blog URL without importing them
 * Also checks for duplicates
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const { blogUrl, dateRangeStart, dateRangeEnd } = body;

    if (!blogUrl || typeof blogUrl !== "string") {
      return NextResponse.json(
        { error: "blogUrl is required" },
        { status: 400 }
      );
    }

    // Extract blog post URLs
    console.log(`[Bulk Import Preview] Extracting blog posts from ${blogUrl}...`);
    const blogPosts = await extractBlogPostUrls(blogUrl);
    
    if (blogPosts.length === 0) {
      return NextResponse.json(
        { error: "No blog posts found on this page. Please check the URL." },
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

    // Filter by date range if provided
    let filteredPosts = blogPosts;
    if (dateRangeStart || dateRangeEnd) {
      filteredPosts = blogPosts.filter(post => {
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

    // Enrich blog posts with duplicate information and detected asset type
    // First try URL-based detection, then HTML-based for unknown types
    const enrichedPosts = await Promise.all(
      filteredPosts.map(async (post) => {
        let detectedType = detectAssetTypeFromUrl(post.url);
        
        // If URL-based detection failed, try HTML-based detection
        if (!detectedType) {
          try {
            const html = await fetchHtml(post.url).catch(() => null);
            if (html) {
              detectedType = await detectAssetTypeFromHtml(post.url, html);
            }
          } catch (error) {
            // HTML fetch failed, keep detectedType as null
            console.log(`[Bulk Import Preview] Failed to fetch HTML for ${post.url}:`, error);
          }
        }
        
        return {
          url: post.url,
          title: post.title,
          isDuplicate: existingSourceUrls.has(post.url),
          existingAssetId: existingSourceUrls.get(post.url),
          detectedAssetType: detectedType,
          isUnknownType: detectedType === null,
          publishedDate: post.publishedDate,
        };
      })
    );

    const duplicateCount = enrichedPosts.filter(p => p.isDuplicate).length;
    const newCount = enrichedPosts.length - duplicateCount;

    return NextResponse.json({
      success: true,
      posts: enrichedPosts,
      total: enrichedPosts.length,
      duplicates: duplicateCount,
      new: newCount,
    });
  } catch (error) {
    console.error("Error previewing blog posts:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to preview blog posts",
      },
      { status: 500 }
    );
  }
}
