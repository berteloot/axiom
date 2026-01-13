import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import { z } from "zod";
import { extractKeyFromS3Url, deleteS3Object } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bulkDeleteSchema = z.object({
  assetIds: z.array(z.string()).min(1, "At least one asset ID is required"),
});

/**
 * DELETE /api/assets/bulk-delete
 * Delete multiple assets and their S3 files
 */
export async function DELETE(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();

    // Validate request body
    const validation = bulkDeleteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { assetIds } = validation.data;

    // Verify all assets belong to the current account
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: assetIds },
        accountId,
      },
      select: {
        id: true,
        s3Key: true,
        s3Url: true,
        title: true,
      },
    });

    if (assets.length !== assetIds.length) {
      return NextResponse.json(
        { error: "Some assets not found or do not belong to your account" },
        { status: 403 }
      );
    }

    const results = {
      total: assets.length,
      deleted: 0,
      failed: 0,
      errors: [] as Array<{ assetId: string; error: string }>,
    };

    // Delete each asset and its S3 file
    for (const asset of assets) {
      try {
        // Delete from S3 first
        try {
          const key = asset.s3Key || extractKeyFromS3Url(asset.s3Url);
          if (key) {
            await deleteS3Object(key);
            console.log(`[Bulk Delete] Successfully deleted S3 object: ${key}`);
          } else {
            console.warn(`[Bulk Delete] Could not determine S3 key for asset ${asset.id}, skipping S3 deletion`);
          }
        } catch (s3Error) {
          console.error(`[Bulk Delete] Error deleting S3 object for asset ${asset.id}:`, s3Error);
          // Continue with database deletion even if S3 deletion fails
          // Log error but don't fail the request to prevent orphaned database records
        }

        // Delete from database (cascade will handle related records)
        await prisma.asset.delete({
          where: { id: asset.id },
        });

        results.deleted++;
        console.log(`[Bulk Delete] Successfully deleted asset ${asset.id}`);
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.errors.push({ assetId: asset.id, error: errorMessage });
        console.error(`[Bulk Delete] Failed to delete asset ${asset.id}:`, errorMessage);
      }
    }

    console.log(`[Bulk Delete] Completed: ${results.deleted} deleted, ${results.failed} failed`);

    if (results.deleted === 0) {
      return NextResponse.json(
        {
          error: "Failed to delete any assets",
          details: results.errors,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Successfully deleted ${results.deleted} of ${results.total} asset${results.total !== 1 ? "s" : ""}${results.failed > 0 ? ` (${results.failed} failed)` : ""}`,
    });
  } catch (error) {
    console.error("Error bulk deleting assets:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to bulk delete assets" },
      { status: 500 }
    );
  }
}
