import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId, getUserId } from "@/lib/account-utils";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { FunnelStage } from "@/lib/types";
import { standardizeICPTargets } from "@/lib/icp-targets";
import { extractBlogPostUrls, fetchBlogPostContentWithDate } from "@/lib/services/blog-extractor";

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

const BulkImportRequestSchema = z.object({
  posts: z.array(z.object({
    url: z.string().url(),
    title: z.string(),
    detectedAssetType: z.string().nullable().optional(),
  })).min(1).max(100), // Selected posts to import
  funnelStage: z.enum(["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"]).optional(),
  icpTargets: z.array(z.string()).optional(),
  painClusters: z.array(z.string()).optional(),
  productLineIds: z.array(z.string()).optional(),
});

/**
 * POST /api/assets/bulk-import-blog
 * Bulk import blog posts from a blog URL
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const userId = await getUserId(request);

    const body = await request.json();
    const validationResult = BulkImportRequestSchema.safeParse(body);

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
      posts: postsToImport,
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

    console.log(`[Bulk Import] Importing ${postsToImport.length} blog posts...`);

    const results = {
      total: postsToImport.length,
      success: 0,
      failed: 0,
      skipped: 0,
      withErrors: 0,
      errors: [] as Array<{ url: string; error: string }>,
      warnings: [] as Array<{ url: string; warning: string }>,
      skippedItems: [] as Array<{ url: string; reason: string }>,
      assets: [] as Array<{ id: string; title: string }>,
    };

    // Standardize ICP targets once
    const standardizedIcpTargets = icpTargets.length > 0 
      ? standardizeICPTargets(icpTargets)
      : [];

    // Preload existing source URLs to avoid duplicate imports
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

    const processedUrls = new Set<string>();

    // Process posts in parallel batches (5 at a time to avoid overwhelming the system)
    const BATCH_SIZE = 5;
    const processPost = async (post: { url: string; title: string; detectedAssetType?: string | null; publishedDate?: string | null }) => {
      try {
        if (processedUrls.has(post.url)) {
          return { success: false, skipped: true, url: post.url, reason: "Duplicate selected in this import" };
        }
        processedUrls.add(post.url);

        if (existingSourceUrls.has(post.url)) {
          return { success: false, skipped: true, url: post.url, reason: "Already imported" };
        }

        // Fetch content and extract published date
        let content = "";
        let extractionWarning: string | null = null;
        let resolvedPublishedDate = post.publishedDate || null;

        try {
          const { content: fetchedContent, publishedDate } = await fetchBlogPostContentWithDate(post.url);
          content = fetchedContent;
          resolvedPublishedDate = post.publishedDate || publishedDate || null;
        } catch (error) {
          extractionWarning = error instanceof Error ? error.message : "Unknown error during content extraction";
          content = `Content extraction failed for ${post.url}\n\nError: ${extractionWarning}`;
        }
        
        // Validate content - if content is too short or invalid, mark as ERROR
        const isValidContent = !extractionWarning && content && content.trim().length >= 100;
        const status = isValidContent ? "PROCESSED" : "ERROR";
        const warningMessage = !isValidContent
          ? extractionWarning || "Content extraction failed or content too short"
          : null;
        
        // Generate filename
        const timestamp = Date.now();
        const sanitizedTitle = post.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .substring(0, 50);
        const filename = `${sanitizedTitle}-${timestamp}.md`;
        const s3Key = `blog-imports/${accountId}/${filename}`;

        // Upload to S3
        const uploadCommand = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: content,
          ContentType: "text/markdown",
          Metadata: {
            "original-title": post.title,
            "source-url": post.url,
            "imported-at": new Date().toISOString(),
            ...(resolvedPublishedDate ? { "published-date": resolvedPublishedDate } : {}),
            ...(warningMessage ? { "extraction-warning": warningMessage.substring(0, 2000) } : {}),
          },
        });

        await s3Client.send(uploadCommand);

        // Build S3 URL
        const s3Url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${encodeURIComponent(s3Key).replace(/%2F/g, "/")}`;

        // Convert published date string to Date object if available
        const customCreatedAt = resolvedPublishedDate ? new Date(resolvedPublishedDate) : null;

        // Create asset with appropriate status based on processing success
        const asset = await prisma.asset.create({
          data: {
            accountId,
            uploadedById: userId || undefined,
            title: post.title,
            s3Url,
            s3Key,
            fileType: "text/markdown",
            assetType: post.detectedAssetType || "Blog Post",
            extractedText: content,
            funnelStage: funnelStage as FunnelStage,
            icpTargets: standardizedIcpTargets,
            painClusters,
            outreachTip: `This blog post was imported from ${post.url}. ${painClusters.length > 0 ? `Addresses: ${painClusters.join(", ")}.` : ""}`,
            status: status as "PROCESSED" | "ERROR",
            aiModel: isValidContent ? "bulk-import" : null,
            promptVersion: isValidContent ? "v1" : null,
            analyzedAt: isValidContent ? new Date() : null,
            contentQualityScore: isValidContent ? 70 : null,
            customCreatedAt, // Set creation date from extracted published date
            inUse: true, // Bulk imported assets are in use by default
            atomicSnippets: {
              type: "blog_import",
              sourceUrl: post.url,
              importedAt: new Date().toISOString(),
              ...(resolvedPublishedDate ? { publishedDate: resolvedPublishedDate } : {}),
              ...(!isValidContent ? { error: warningMessage } : {}),
            },
          },
        });

        existingSourceUrls.add(post.url);

        // Create product line associations if provided
        if (productLineIds.length > 0) {
          await prisma.assetProductLine.createMany({
            data: productLineIds.map(productLineId => ({
              assetId: asset.id,
              productLineId,
            })),
          });
        }

        return { success: true, asset: { id: asset.id, title: asset.title }, url: post.url, warning: warningMessage };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Bulk Import] Failed to import ${post.url}:`, errorMessage);
        return { success: false, error: errorMessage, url: post.url };
      }
    };

    // Process in batches
    for (let i = 0; i < postsToImport.length; i += BATCH_SIZE) {
      const batch = postsToImport.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(processPost));
      
      for (const result of batchResults) {
        if (result.success) {
          results.success++;
          results.assets.push(result.asset!);
          if (result.warning) {
            results.withErrors++;
            results.warnings.push({ url: result.url, warning: result.warning });
          }
        } else if (result.skipped) {
          results.skipped++;
          results.skippedItems.push({ url: result.url, reason: result.reason || "Duplicate" });
        } else {
          results.failed++;
          results.errors.push({ url: result.url, error: result.error! });
        }
      }
    }

    console.log(`[Bulk Import] Completed: ${results.success} succeeded, ${results.failed} failed, ${results.skipped} skipped`);

    return NextResponse.json({
      success: true,
      results,
      message: `Imported ${results.success} of ${results.total} blog posts`,
    });
  } catch (error) {
    console.error("Error bulk importing blog posts:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to bulk import blog posts",
      },
      { status: 500 }
    );
  }
}
