/**
 * POST /api/assets/bulk-import-blog/scrape
 * 
 * PHASE 3: Scrape selected URLs with Firecrawl
 * 
 * ⚠️ Uses 1 credit per URL!
 * 
 * This endpoint should be called AFTER:
 * 1. Preview endpoint (discovery + duplicate check)
 * 2. User selects which NEW posts to preview/import
 * 
 * Returns scraped content that can then be imported via the main import endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAccountId } from "@/lib/account-utils";
import { scrapeSelectedUrls } from "@/lib/blog-extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scrape specific URLs - called after user selects which posts to preview
 * This is where Firecrawl credits are used
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "urls array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (urls.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 URLs can be scraped at once" },
        { status: 400 }
      );
    }

    console.log(`[Scrape] User requested ${urls.length} posts (${urls.length} credits will be used)`);

    // Validate URLs
    const validUrls: string[] = [];
    for (const url of urls) {
      if (typeof url === 'string' && url.trim()) {
        try {
          new URL(url);
          validUrls.push(url.trim());
        } catch {
          console.warn(`[Scrape] Invalid URL skipped: ${url}`);
        }
      }
    }

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: "No valid URLs provided" },
        { status: 400 }
      );
    }

    // PHASE 3: Scrape only the selected URLs
    const results = await scrapeSelectedUrls(validUrls, (completed, total) => {
      console.log(`[Scrape] Progress: ${completed}/${total}`);
    });

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`[Scrape] Completed: ${successful.length} successful, ${failed.length} failed`);

    return NextResponse.json({
      success: true,
      posts: successful,
      failed: failed,
      creditInfo: {
        creditsUsed: validUrls.length, // Always count all URLs attempted
        successfulScrapes: successful.length,
        failedScrapes: failed.length,
        message: `${successful.length} posts scraped successfully (${validUrls.length} credits used)`,
      },
    });
  } catch (error) {
    console.error("[Scrape] Error scraping URLs:", error);
    const message = error instanceof Error ? error.message : "Failed to scrape URLs";
    const status = message.includes("No account selected") ? 401 : 500;
    
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
