import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const assetId = params.id;

    // In a real implementation, you'd store processing jobs and cancel them
    // For now, just return a message
    console.log(`[API] Cancel transcript processing requested for asset ${assetId}`);

    return NextResponse.json({
      success: true,
      message: "If a processing job was running, it may take a moment to stop. Try refreshing the page.",
    });

  } catch (error) {
    console.error("Error canceling transcript processing:", error);
    return NextResponse.json(
      { error: "Failed to cancel processing" },
      { status: 500 }
    );
  }
}