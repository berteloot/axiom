import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const assetId = params.id;

    // Get transcription job status
    const job = await prisma.transcriptionJob.findUnique({
      where: { assetId },
      select: {
        id: true,
        status: true,
        progress: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    });

    // Get segment count if job is completed
    let segmentsCount = 0;
    if (job?.status === "COMPLETED") {
      segmentsCount = await prisma.transcriptSegment.count({
        where: { assetId },
      });
    }

    return NextResponse.json({
      job: job || null,
      segmentsCount,
    });

  } catch (error) {
    console.error("Error fetching transcript job status:", error);
    return NextResponse.json(
      { error: "Failed to fetch job status" },
      { status: 500 }
    );
  }
}