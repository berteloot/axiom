import { NextRequest, NextResponse } from "next/server";
import { extractBlogPostUrls } from "@/lib/services/blog-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // Get URL from query param - hash fragments need to be URL encoded as %23
    let blogUrl = searchParams.get("url") || "https://rfxcel.com/library/%23blog";
    
    // Decode URL-encoded hash if present
    blogUrl = decodeURIComponent(blogUrl);
    
    console.log(`[Test] Extracting blog posts from: ${blogUrl}`);
    
    const posts = await extractBlogPostUrls(blogUrl);
    
    return NextResponse.json({
      success: true,
      blogUrl,
      totalFound: posts.length,
      expected: 216,
      coverage: ((posts.length / 216) * 100).toFixed(1) + "%",
      posts: posts.slice(0, 50), // Return first 50 for preview
      allPosts: posts, // Return all posts
      statistics: {
        total: posts.length,
        blogUrls: posts.filter(p => p.url.includes('/blog/')).length,
        postUrls: posts.filter(p => p.url.includes('/post/')).length,
        articleUrls: posts.filter(p => p.url.includes('/article/')).length,
        uniqueDomains: new Set(posts.map(p => {
          try {
            return new URL(p.url).hostname;
          } catch {
            return null;
          }
        })).size,
      },
    });
  } catch (error) {
    console.error("[Test] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
