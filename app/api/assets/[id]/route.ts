import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractKeyFromS3Url, deleteS3Object } from "@/lib/s3";
import { requireAccountId } from "@/lib/account-utils";
import { updateAssetSchema } from "@/lib/validations";
import { standardizeICPTargets } from "@/lib/icp-targets";

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
      include: {
        productLines: {
          include: {
            productLine: {
              select: {
                id: true,
                name: true,
                description: true,
                valueProposition: true,
                specificICP: true,
              },
            },
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    // Transform to match expected format
    const transformedAsset = {
      ...asset,
      productLines: asset.productLines.map(ap => ap.productLine),
    };

    return NextResponse.json({ asset: transformedAsset });
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
      productLineIds,
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

    // Verify product line IDs belong to the account if provided
    if (productLineIds !== undefined) {
      const brandContext = await prisma.brandContext.findUnique({
        where: { accountId },
        include: {
          productLines: {
            select: { id: true },
          },
        },
      });

      if (brandContext) {
        const validProductLineIds = brandContext.productLines.map(pl => pl.id)
        const invalidIds = productLineIds.filter(id => !validProductLineIds.includes(id))
        if (invalidIds.length > 0) {
          return NextResponse.json(
            { error: `Invalid product line IDs: ${invalidIds.join(", ")}` },
            { status: 400 }
          )
        }
      }
    }

    // Standardize ICP targets if provided
    const standardizedIcpTargets = icpTargets !== undefined 
      ? standardizeICPTargets(icpTargets)
      : undefined;

    // Update asset fields
    const asset = await prisma.asset.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(extractedText !== undefined && { extractedText }),
        ...(funnelStage !== undefined && { funnelStage }),
        ...(standardizedIcpTargets !== undefined && { icpTargets: standardizedIcpTargets }),
        ...(painClusters !== undefined && { painClusters }),
        ...(outreachTip !== undefined && { outreachTip }),
        ...(status !== undefined && { status }),
        ...(customCreatedAt !== undefined && { customCreatedAt: customCreatedAt ? new Date(customCreatedAt) : null }),
        ...(lastReviewedAt !== undefined && { lastReviewedAt: lastReviewedAt ? new Date(lastReviewedAt) : null }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
      },
      include: {
        productLines: {
          include: {
            productLine: {
              select: {
                id: true,
                name: true,
                description: true,
                valueProposition: true,
                specificICP: true,
              },
            },
          },
        },
      },
    });

    // Update product lines if provided
    if (productLineIds !== undefined) {
      // Delete existing associations
      await prisma.assetProductLine.deleteMany({
        where: { assetId: params.id },
      });

      // Create new associations
      if (productLineIds.length > 0) {
        await prisma.assetProductLine.createMany({
          data: productLineIds.map(plId => ({
            assetId: params.id,
            productLineId: plId,
          })),
        });
      }

      // Fetch updated asset with product lines
      const updatedAsset = await prisma.asset.findUnique({
        where: { id: params.id },
        include: {
          productLines: {
            include: {
              productLine: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  valueProposition: true,
                  specificICP: true,
                },
              },
            },
          },
        },
      });

      if (updatedAsset) {
        const transformedAsset = {
          ...updatedAsset,
          productLines: updatedAsset.productLines.map(ap => ap.productLine),
        };
        return NextResponse.json({ asset: transformedAsset });
      }
    }

    // Transform response
    const transformedAsset = {
      ...asset,
      productLines: asset.productLines.map(ap => ap.productLine),
    };

    return NextResponse.json({ asset: transformedAsset });
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
      const key = asset.s3Key || extractKeyFromS3Url(asset.s3Url);
      if (key) {
        await deleteS3Object(key);
        console.log(`Successfully deleted S3 object: ${key}`);
      } else {
        console.warn(`Could not determine S3 key for asset ${params.id}, skipping S3 deletion`);
      }
    } catch (s3Error) {
      console.error("Error deleting S3 object:", s3Error);
      // Continue with database deletion even if S3 deletion fails
      // Log error but don't fail the request to prevent orphaned database records
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
