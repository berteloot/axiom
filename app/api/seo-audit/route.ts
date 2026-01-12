import { NextRequest, NextResponse } from "next/server";
import { requireAccountId } from "@/lib/account-utils";
import { auditSeoPage } from "@/lib/services/seo-audit-service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const auditRequestSchema = z.object({
  url: z.string().url("Invalid URL format"),
  page_type: z.enum(["blog", "product", "landing", "docs"]).optional(),
  target_keyword: z.string().optional(),
  target_audience: z.string().optional(),
  brand_voice: z.string().optional(),
  enable_site_crawl: z.boolean().optional().default(false),
  include_brand_consistency: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication and get account
    const accountId = await requireAccountId(request);

    // Parse and validate request body
    const body = await request.json();
    const validation = auditRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const { url, page_type, target_keyword, target_audience, brand_voice, enable_site_crawl, include_brand_consistency } =
      validation.data;

    // Note: enable_site_crawl is not implemented in Phase 1
    if (enable_site_crawl) {
      return NextResponse.json(
        {
          error: "Site crawl feature is not yet implemented. Please use single-page audit.",
        },
        { status: 400 }
      );
    }

    // Build context object
    const context = {
      page_type,
      target_keyword,
      target_audience,
      brand_voice,
    };

    // Run audit
    const result = await auditSeoPage({
      url,
      context: Object.keys(context).length > 0 ? context : undefined,
      enableSiteCrawl: false,
      accountId: include_brand_consistency ? accountId : undefined,
      includeBrandConsistency: include_brand_consistency,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Audit failed",
          errors: result.errors,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Error in SEO audit:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      // Check if it's an auth error
      if (error.message.includes("No account selected")) {
        return NextResponse.json(
          { error: error.message },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to perform SEO audit" },
      { status: 500 }
    );
  }
}
