import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId, getUserId } from "@/lib/account-utils";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { FunnelStage } from "@/lib/types";
import { standardizeICPTargets } from "@/lib/icp-targets";
import { extractBlogPostUrls, fetchBlogPostContent } from "@/lib/services/blog-extractor";

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
  blogUrl: z.string().url("Invalid blog URL"),
  funnelStage: z.enum(["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"]).optional(),
  icpTargets: z.array(z.string()).optional(),
  painClusters: z.array(z.string()).optional(),
  productLineIds: z.array(z.string()).optional(),
  maxPosts: z.number().int().min(1).max(100).optional().default(50), // Limit to prevent abuse
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
      blogUrl,
      funnelStage = "TOFU_AWARENESS",
      icpTargets = [],
      painClusters = [],
      productLineIds = [],
      maxPosts,
    } = validationResult.data;

    if (!BUCKET_NAME) {
      return NextResponse.json(
        { error: "S3 storage is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Step 1: Extract blog post URLs
    console.log(`[Bulk Import] Extracting blog posts from ${blogUrl}...`);
    const blogPosts = await extractBlogPostUrls(blogUrl);
    
    if (blogPosts.length === 0) {
      return NextResponse.json(
        { error: "No blog posts found on this page. Please check the URL." },
        { status: 400 }
      );
    }

    // Limit the number of posts
    const postsToImport = blogPosts.slice(0, maxPosts);
    console.log(`[Bulk Import] Importing ${postsToImport.length} blog posts...`);

    const results = {
      total: postsToImport.length,
      success: 0,
      failed: 0,
      errors: [] as Array<{ url: string; error: string }>,
      assets: [] as Array<{ id: string; title: string }>,
    };

    // Step 2: Process each blog post
    for (const post of postsToImport) {
      try {
        // Fetch content
        const content = await fetchBlogPostContent(post.url);
        
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
          },
        });

        await s3Client.send(uploadCommand);

        // Build S3 URL
        const s3Url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${encodeURIComponent(s3Key).replace(/%2F/g, "/")}`;

        // Standardize ICP targets
        const standardizedIcpTargets = icpTargets.length > 0 
          ? standardizeICPTargets(icpTargets)
          : [];

        // Create asset
        const asset = await prisma.asset.create({
          data: {
            accountId,
            uploadedById: userId || undefined,
            title: post.title,
            s3Url,
            s3Key,
            fileType: "text/markdown",
            assetType: "Blog_Post",
            extractedText: content,
            funnelStage: funnelStage as FunnelStage,
            icpTargets: standardizedIcpTargets,
            painClusters,
            outreachTip: `This blog post was imported from ${post.url}. ${painClusters.length > 0 ? `Addresses: ${painClusters.join(", ")}.` : ""}`,
            status: "PROCESSED",
            aiModel: "bulk-import",
            promptVersion: "v1",
            analyzedAt: new Date(),
            contentQualityScore: 70,
            atomicSnippets: {
              type: "blog_import",
              sourceUrl: post.url,
              importedAt: new Date().toISOString(),
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

        results.success++;
        results.assets.push({ id: asset.id, title: asset.title });
        
        console.log(`[Bulk Import] Successfully imported: ${post.title}`);
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.errors.push({ url: post.url, error: errorMessage });
        console.error(`[Bulk Import] Failed to import ${post.url}:`, errorMessage);
      }
    }

    console.log(`[Bulk Import] Completed: ${results.success} succeeded, ${results.failed} failed`);

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
