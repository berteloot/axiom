import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const assetId = params.id;

    // Get transcript segments for the asset
    const segments = await prisma.transcriptSegment.findMany({
      where: { assetId },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        text: true,
        startTime: true,
        endTime: true,
        speaker: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      segments,
    });

  } catch (error) {
    console.error("Error fetching transcript segments:", error);
    return NextResponse.json(
      { error: "Failed to fetch transcript segments" },
      { status: 500 }
    );
  }
}