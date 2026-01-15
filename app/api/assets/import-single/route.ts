import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId, getUserId } from "@/lib/account-utils";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { FunnelStage } from "@/lib/types";
import { standardizeICPTargets } from "@/lib/icp-targets";
import { fetchBlogPostContentWithDate, deriveTitleFromSlug } from "@/lib/services/blog-extractor";
import { fetchBlogPostContentWithFirecrawl, isFirecrawlActive, isFirecrawlConfigured } from "@/lib/services/firecrawl-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

const s3Client = new S3Client({
  region: AWS_REGION,
  ...(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

const SingleImportRequestSchema = z.object({
  url: z.string().url(),
  funnelStage: z.enum(["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"]).optional(),
  icpTargets: z.array(z.string()).optional(),
  painClusters: z.array(z.string()).optional(),
  productLineIds: z.array(z.string()).optional(),
});

/**
 * POST /api/assets/import-single
 * Import a single asset from a URL
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const userId = await getUserId(request);

    const body = await request.json();
    const validationResult = SingleImportRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const {
      url,
      funnelStage = "TOFU_AWARENESS",
      icpTargets = [],
      painClusters = [],
      productLineIds = [],
    } = validationResult.data;

    if (!BUCKET_NAME) {
      return NextResponse.json(
        { error: "S3 storage is not configured. Please contact support." },
        { status: 500 }
      );
    }

    console.log(`[Single Import] Importing asset from URL: ${url}`);

    // Check if asset already exists with this source URL
    const existingAssets = await prisma.asset.findMany({
      where: {
        accountId,
        atomicSnippets: {
          not: null,
        },
      },
      select: {
        atomicSnippets: true,
      },
    });

    const existingSourceUrls = new Set<string>();
    existingAssets.forEach(asset => {
      const snippets = asset.atomicSnippets as any;
      if (snippets?.sourceUrl && typeof snippets.sourceUrl === "string") {
        existingSourceUrls.add(snippets.sourceUrl);
      }
    });

    if (existingSourceUrls.has(url)) {
      return NextResponse.json(
        {
          error: "Asset already imported",
          message: "An asset with this URL has already been imported.",
        },
        { status: 409 }
      );
    }

    // Fetch content and extract published date
    // Try Firecrawl first (better date extraction), fall back to Jina
    let content = "";
    let extractionWarning: string | null = null;
    let publishedDate: string | null = null;
    let title: string | null = null;
    let usedFirecrawl = false;

    try {
      // Try Firecrawl first if it's configured (even if not explicitly set as provider)
      // Single imports benefit from Firecrawl's better date extraction
      if (isFirecrawlConfigured()) {
        try {
          console.log(`[Single Import] Trying Firecrawl for ${url} (API key configured)...`);
          const firecrawlResult = await fetchBlogPostContentWithFirecrawl(url);
          content = firecrawlResult.content;
          publishedDate = firecrawlResult.publishedDate || null;
          usedFirecrawl = true;
          console.log(`[Single Import] ✅ Firecrawl extracted ${content.length} chars, date: ${publishedDate || 'not found'}`);
        } catch (firecrawlError) {
          console.log(`[Single Import] Firecrawl failed, falling back to Jina:`, firecrawlError instanceof Error ? firecrawlError.message : firecrawlError);
          // Fall through to Jina fallback
        }
      } else {
        console.log(`[Single Import] Firecrawl not configured (no API key), using Jina...`);
      }

      // If Firecrawl wasn't used or failed, use Jina
      if (!usedFirecrawl) {
        console.log(`[Single Import] Using Jina for ${url}...`);
        const { content: fetchedContent, publishedDate: extractedDate } = await fetchBlogPostContentWithDate(url);
        content = fetchedContent;
        publishedDate = extractedDate || null;
        console.log(`[Single Import] ✅ Jina extracted ${content.length} chars, date: ${publishedDate || 'not found'}`);
      }
      
      // Try to extract title from content (look for markdown heading or HTML title)
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      } else {
        // Fall back to deriving title from URL slug
        title = deriveTitleFromSlug(url);
      }
      
      // If still no title, use URL path as fallback
      if (!title || title.length < 3) {
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          title = pathParts[pathParts.length - 1] || urlObj.hostname;
          // Clean up the title
          title = title
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase())
            .trim();
        } catch {
          title = "Imported Asset";
        }
      }
    } catch (error) {
      extractionWarning = error instanceof Error ? error.message : "Unknown error during content extraction";
      content = `Content extraction failed for ${url}\n\nError: ${extractionWarning}`;
      title = deriveTitleFromSlug(url) || "Imported Asset";
    }

    // Validate content - if content is too short or invalid, mark as ERROR
    const isValidContent = !extractionWarning && content && content.trim().length >= 100;
    const status = isValidContent ? "PROCESSED" : "ERROR";
    const warningMessage = !isValidContent
      ? extractionWarning || "Content extraction failed or content too short"
      : null;

    // Standardize ICP targets
    const standardizedIcpTargets = icpTargets.length > 0 
      ? standardizeICPTargets(icpTargets)
      : [];

    // Generate filename
    const timestamp = Date.now();
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .substring(0, 50);
    const filename = `${sanitizedTitle}-${timestamp}.md`;
    const s3Key = `single-imports/${accountId}/${filename}`;

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: content,
      ContentType: "text/markdown",
      Metadata: {
        "original-title": title,
        "source-url": url,
        "imported-at": new Date().toISOString(),
        ...(publishedDate ? { "published-date": publishedDate } : {}),
        ...(warningMessage ? { "extraction-warning": warningMessage.substring(0, 2000) } : {}),
      },
    });

    await s3Client.send(uploadCommand);

    // Build S3 URL
    const s3Url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${encodeURIComponent(s3Key).replace(/%2F/g, "/")}`;

    // Convert published date string to Date object if available
    const customCreatedAt = publishedDate ? new Date(publishedDate) : null;

    // Create asset with appropriate status based on processing success
    const asset = await prisma.asset.create({
      data: {
        accountId,
        uploadedById: userId || undefined,
        title,
        s3Url,
        s3Key,
        fileType: "text/markdown",
        assetType: "Blog Post",
        extractedText: content,
        funnelStage: funnelStage as FunnelStage,
        icpTargets: standardizedIcpTargets,
        painClusters,
        outreachTip: painClusters.length > 0 ? `Addresses: ${painClusters.join(", ")}.` : "",
        status: status as "PROCESSED" | "ERROR",
        aiModel: isValidContent ? "single-import" : null,
        promptVersion: isValidContent ? "v1" : null,
        analyzedAt: isValidContent ? new Date() : null,
        contentQualityScore: isValidContent ? 70 : null,
        customCreatedAt, // Set creation date from extracted published date
        inUse: true, // Single imported assets are in use by default
        atomicSnippets: {
          type: "single_import",
          sourceUrl: url,
          importedAt: new Date().toISOString(),
          ...(publishedDate ? { publishedDate } : {}),
          ...(!isValidContent ? { error: warningMessage } : {}),
        },
      },
    });

    // Create product line associations if provided
    if (productLineIds.length > 0) {
      await prisma.assetProductLine.createMany({
        data: productLineIds.map(productLineId => ({
          assetId: asset.id,
          productLineId,
        })),
      });
    }

    console.log(`[Single Import] Successfully imported asset: ${asset.id}`);

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        title: asset.title,
        status: asset.status,
        url: asset.s3Url,
      },
      warning: warningMessage,
    });
  } catch (error) {
    console.error("Error importing single asset:", error);
    const message = error instanceof Error ? error.message : "Failed to import asset";
    const status = message.includes("No account selected") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
