import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import { processAssetAsync } from "@/lib/services/asset-processor";

// Ensure this route runs in Node.js runtime (required for Prisma)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retry processing a failed asset
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = await requireAccountId(request);

    // Get the asset and verify it belongs to the current account
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

    // Process the asset asynchronously
    processAssetAsync(asset.id, asset.s3Url, asset.fileType).catch((error) => {
      console.error(`Error retrying asset ${asset.id}:`, error);
    });

    return NextResponse.json({
      success: true,
      message: "Asset processing retried. Check back in a moment.",
    });
  } catch (error) {
    console.error("Error retrying asset:", error);
    return NextResponse.json(
      { error: "Failed to retry asset processing" },
      { status: 500 }
    );
  }
}
