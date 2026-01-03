import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractKeyFromS3Url, deleteS3Object } from "@/lib/s3";
import { requireAccountId } from "@/lib/account-utils";
import { updateAssetSchema } from "@/lib/validations";

// Ensure this route runs in Node.js runtime (required for Prisma)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = await requireAccountId(request);

    const asset = await prisma.asset.findFirst({
      where: { 
        id: params.id,
        accountId, // Ensure asset belongs to current account
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("Error fetching asset:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = await requireAccountId(request);

    const body = await request.json();

    // Validate request body
    const validationResult = updateAssetSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed",
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const {
      title,
      extractedText,
      funnelStage,
      icpTargets,
      painClusters,
      outreachTip,
      status,
      customCreatedAt,
      lastReviewedAt,
      expiryDate,
    } = validationResult.data;

    // First verify the asset belongs to the current account
    const existingAsset = await prisma.asset.findFirst({
      where: {
        id: params.id,
        accountId,
      },
    });

    if (!existingAsset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    const asset = await prisma.asset.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(extractedText !== undefined && { extractedText }),
        ...(funnelStage !== undefined && { funnelStage }),
        ...(icpTargets !== undefined && { icpTargets }),
        ...(painClusters !== undefined && { painClusters }),
        ...(outreachTip !== undefined && { outreachTip }),
        ...(status !== undefined && { status }),
        ...(customCreatedAt !== undefined && { customCreatedAt: customCreatedAt ? new Date(customCreatedAt) : null }),
        ...(lastReviewedAt !== undefined && { lastReviewedAt: lastReviewedAt ? new Date(lastReviewedAt) : null }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
      },
    });

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("Error updating asset:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to update asset" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = await requireAccountId(request);

    // Get the asset first to get the S3 key and verify it belongs to the account
    const asset = await prisma.asset.findFirst({
      where: {
        id: params.id,
        accountId,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    // Delete the file from S3 using stored s3Key, fallback to extracting from s3Url
    try {
      const key = (asset as any).s3Key || extractKeyFromS3Url(asset.s3Url);
      if (key) {
        await deleteS3Object(key);
      }
    } catch (s3Error) {
      console.error("Error deleting S3 object:", s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete the asset from database
    await prisma.asset.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: "Asset deleted successfully" });
  } catch (error) {
    console.error("Error deleting asset:", error);
    return NextResponse.json(
      { error: "Failed to delete asset" },
      { status: 500 }
    );
  }
}
