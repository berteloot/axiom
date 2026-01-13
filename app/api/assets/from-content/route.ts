import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId, getUserId } from "@/lib/account-utils";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { FunnelStage } from "@/lib/types";
import { standardizeICPTargets } from "@/lib/icp-targets";

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

// Request body validation schema
const SaveContentRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  assetType: z.enum([
    "Whitepaper",
    "Case_Study",
    "Blog_Post",
    "Infographic",
    "Webinar_Recording",
    "Sales_Deck",
    "Technical_Doc",
  ]),
  funnelStage: z.enum(["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"]),
  icpTargets: z.array(z.string()).min(1, "At least one ICP target is required"),
  painClusters: z.array(z.string()).optional().default([]),
  sources: z.array(z.object({
    url: z.string(),
    title: z.string(),
    sourceType: z.string(),
    citation: z.string().optional(),
  })).optional().default([]),
  productLineIds: z.array(z.string()).optional(),
});

/**
 * POST /api/assets/from-content
 * Creates a new asset from generated content
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate and get account ID and user ID
    let accountId: string;
    let userId: string | null;
    try {
      accountId = await requireAccountId(request);
      userId = await getUserId(request);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = SaveContentRequestSchema.safeParse(body);

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
      title,
      content,
      assetType,
      funnelStage,
      icpTargets,
      painClusters,
      sources,
      productLineIds,
    } = validationResult.data;

    // Check if S3 is configured
    if (!BUCKET_NAME) {
      return NextResponse.json(
        { error: "S3 storage is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Generate a unique filename
    const timestamp = Date.now();
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .substring(0, 50);
    const filename = `${sanitizedTitle}-${timestamp}.md`;
    const s3Key = `generated-content/${accountId}/${filename}`;

    // Add sources section to content if there are sources
    let fullContent = content;
    if (sources && sources.length > 0) {
      const sourcesSection = `\n\n---\n\n## Sources\n\n${sources
        .map((s) => `- [${s.title}](${s.url}) - ${s.sourceType}`)
        .join("\n")}`;
      
      // Only add if not already present in content
      if (!content.includes("## Sources")) {
        fullContent = content + sourcesSection;
      }
    }

    // Upload content to S3 as markdown
    try {
      const uploadCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fullContent,
        ContentType: "text/markdown",
        Metadata: {
          "original-title": title,
          "asset-type": assetType,
          "funnel-stage": funnelStage,
          "generated-at": new Date().toISOString(),
        },
      });

      await s3Client.send(uploadCommand);
    } catch (s3Error) {
      console.error("S3 upload error:", s3Error);
      return NextResponse.json(
        { error: "Failed to upload content to storage" },
        { status: 500 }
      );
    }

    // Build S3 URL
    const s3Url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${encodeURIComponent(s3Key).replace(/%2F/g, "/")}`;

    // Determine file type based on asset type
    const fileType = assetType === "Infographic" 
      ? "image/png" // Infographics would typically be images
      : assetType === "Webinar_Recording"
      ? "video/mp4" // Webinars would be videos
      : "text/markdown"; // Most generated content is text-based

    // Build outreach tip with source information
    const reputableSources = sources.filter(s => 
      s.sourceType === "consulting" || s.sourceType === "research" || s.sourceType === "industry_media"
    );
    
    const sourceNames = reputableSources.slice(0, 3).map(s => s.title).join(", ");
    const outreachTip = reputableSources.length > 0
      ? `This ${assetType.replace(/_/g, " ")} addresses ${painClusters.join(", ") || "key business challenges"} for ${icpTargets.join(", ")}. It references credible sources including ${sourceNames}${reputableSources.length > 3 ? ` and ${reputableSources.length - 3} more` : ""}.`
      : `This ${assetType.replace(/_/g, " ")} was created to address ${painClusters.join(", ") || "key business challenges"} for ${icpTargets.join(", ")}.`;

    // Store sources as atomic snippets for reference
    const atomicSnippets = sources.length > 0 
      ? {
          type: "generated_content",
          sources: sources.map(s => ({
            url: s.url,
            title: s.title,
            sourceType: s.sourceType,
            citation: s.citation,
          })),
          metadata: {
            assetType,
            generatedAt: new Date().toISOString(),
            reputableSourceCount: reputableSources.length,
          }
        }
      : undefined;

    // Standardize ICP targets before saving
    const standardizedIcpTargets = standardizeICPTargets(icpTargets);

    // Create the asset in the database
    const asset = await prisma.asset.create({
      data: {
        accountId,
        uploadedById: userId || undefined,
        title,
        s3Url,
        s3Key,
        fileType,
        assetType: assetType, // Save the marketing asset type
        extractedText: fullContent,
        funnelStage: funnelStage as FunnelStage,
        icpTargets: standardizedIcpTargets,
        painClusters,
        outreachTip,
        atomicSnippets,
        status: "PROCESSED", // Mark as processed since it's already complete content
        aiModel: "content-workflow",
        promptVersion: "v1",
        analyzedAt: new Date(),
        contentQualityScore: reputableSources.length > 0 ? 85 : 70, // Higher score for source-backed content
      },
    });

    // Create product line associations if provided
    if (productLineIds && productLineIds.length > 0) {
      await prisma.assetProductLine.createMany({
        data: productLineIds.map(productLineId => ({
          assetId: asset.id,
          productLineId,
        })),
      });
    }

    console.log(`[Save Content] Created asset ${asset.id} for account ${accountId} with ${sources.length} sources (${reputableSources.length} reputable)`);

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        title: asset.title,
        funnelStage: asset.funnelStage,
        icpTargets: asset.icpTargets,
      },
      message: `"${title}" has been added to your asset library`,
    });
  } catch (error) {
    console.error("Error saving content as asset:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save content",
      },
      { status: 500 }
    );
  }
}
