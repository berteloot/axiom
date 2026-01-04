import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const assetId = params.id;

    // Get the asset to verify it exists
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    // Only allow cancellation if status is PROCESSING
    if (asset.status !== "PROCESSING") {
      return NextResponse.json(
        { error: `Asset is not processing (current status: ${asset.status})` },
        { status: 400 }
      );
    }

    // Mark asset as ERROR with cancellation message
    await prisma.asset.update({
      where: { id: assetId },
      data: {
        status: "ERROR",
        outreachTip: "Processing was cancelled by user. You can retry processing or upload a smaller/compressed version.",
      },
    });

    console.log(`[API] Cancelled processing for asset ${assetId}`);

    return NextResponse.json({
      success: true,
      message: "Processing cancelled successfully. Asset marked as ERROR. You can retry or upload a smaller file.",
    });

  } catch (error) {
    console.error("Error cancelling asset processing:", error);
    return NextResponse.json(
      { error: "Failed to cancel processing" },
      { status: 500 }
    );
  }
}