import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processVideoFromS3, processVideoFromS3Portion } from "@/lib/ai/video-transcriber";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RENDER-SPECIFIC ARCHITECTURE
 * 
 * This endpoint uses "Fire and Forget" pattern optimized for Render:
 * 
 * 1. Creates a TranscriptionJob record immediately
 * 2. Starts background processing WITHOUT awaiting
 * 3. Returns 200 OK to user immediately
 * 4. Background job continues running in the same Node.js process
 * 
 * Why this works on Render:
 * - Render runs Next.js as a long-running Web Service (not serverless)
 * - Node.js keeps the process alive, so background promises continue
 * - No need for @vercel/functions waitUntil() or external job queues
 * 
 * Risk: Server restarts (deployments) can kill jobs mid-process
 * Solution: instrumentation.ts cleanup script marks stuck jobs as FAILED
 * 
 * Future: For high volume, consider separate Background Worker service
 * with Redis queue (BullMQ) to isolate CPU-intensive video processing
 */
export const maxDuration = 60; // 1 minute - we return immediately anyway

/**
 * Process video asynchronously in the background
 * Updates job status as it progresses
 * 
 * Render-specific: This runs in the same Node.js process as the API.
 * Unlike Vercel, Render keeps the process alive, so background jobs
 * continue even after the HTTP response is sent.
 */
async function processVideoAsync(
  assetId: string,
  s3Url: string,
  fileName: string,
  fileType: string,
  processFirst10MinutesOnly: boolean,
  jobId: string
): Promise<void> {
  try {
    // Update job to PROCESSING
    await prisma.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        progress: 10,
      },
    });

    console.log(`[BACKGROUND] Starting async processing for asset ${assetId}${processFirst10MinutesOnly ? ' (first 10 minutes only)' : ''}`);

    // Update progress: Downloading
    await prisma.transcriptionJob.update({
      where: { id: jobId },
      data: { progress: 20 },
    });

    let segmentCount = 0;

    // Process the video
    try {
      // Update progress: Processing
      await prisma.transcriptionJob.update({
        where: { id: jobId },
        data: { progress: 50 },
      });

      if (processFirst10MinutesOnly) {
        await processVideoFromS3Portion(
          assetId,
          s3Url,
          fileName,
          fileType,
          10 * 60 // 10 minutes
        );
      } else {
        await processVideoFromS3(
          assetId,
          s3Url,
          fileName,
          fileType
        );
      }

      // Update progress: Saving
      await prisma.transcriptionJob.update({
        where: { id: jobId },
        data: { progress: 90 },
      });

      // Verify segments were created
      segmentCount = await prisma.transcriptSegment.count({
        where: { assetId },
      });

      // Update job to COMPLETED
      await prisma.transcriptionJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          completedAt: new Date(),
        },
      });

      console.log(`[BACKGROUND] Successfully processed asset ${assetId}: ${segmentCount} segments`);
    } catch (processingError) {
      // Update progress before failing
      await prisma.transcriptionJob.update({
        where: { id: jobId },
        data: { progress: 0 },
      });
      throw processingError;
    }

  } catch (error) {
    console.error(`[BACKGROUND] Processing failed for asset ${assetId}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Extract file size from error message if available
    const fileSizeMatch = errorMessage.match(/(\d+)MB/);
    const fileSize = fileSizeMatch ? parseInt(fileSizeMatch[1]) : null;

    // Update job to FAILED with detailed error
    // Use a try-catch here to ensure we don't crash if DB update fails
    try {
      await prisma.transcriptionJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: errorMessage.length > 1000 ? errorMessage.substring(0, 1000) + "..." : errorMessage, // Truncate very long errors
          progress: 0,
        },
      });
    } catch (updateError) {
      // If we can't update the job status, log it but don't crash
      console.error(`[BACKGROUND] Failed to update job ${jobId} status to FAILED:`, updateError);
    }

    // Don't re-throw - error is logged and job is marked as failed
    // This prevents unhandled promise rejections that could crash the server
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();

  try {
    const assetId = params.id;

    // Get the asset to verify it exists and get its details
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        s3Url: true,
        s3Key: true,
        fileType: true,
        title: true,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    // Check if it's a video file
    if (!asset.fileType.startsWith("video/")) {
      return NextResponse.json(
        { error: "Asset is not a video file" },
        { status: 400 }
      );
    }

    // Check if segments already exist
    const existingSegments = await prisma.transcriptSegment.count({
      where: { assetId },
    });

    if (existingSegments > 0) {
      console.log(`[API] Segments already exist for asset ${assetId} (${existingSegments} segments)`);
      return NextResponse.json({
        success: true,
        message: `Transcript segments already exist (${existingSegments} segments)`,
        segmentsCount: existingSegments,
        method: "existing",
      });
    }

    // Check processing time - if request has been running too long, provide fallback
    if ((Date.now() - startTime) > 5 * 60 * 1000) { // 5 minutes
      console.log(`[API] Request has been running for ${(Date.now() - startTime) / 1000} seconds, providing fallback option`);

      return NextResponse.json({
        success: false,
        error: "Processing timeout",
        details: "Processing is taking too long. Try extracting audio from the first 10 minutes manually using: ffmpeg -i input.mp4 -t 600 -vn -acodec libmp3lame -ab 64k output.mp3",
        showCompressionGuide: true,
        fileSize: Math.round(asset.s3Url.length / 1024 / 1024) || null,
      }, { status: 408 }); // Request Timeout
    }

    // Check if user wants to process only first 10 minutes
    let processFirst10MinutesOnly = false;
    try {
      const body = await request.json();
      processFirst10MinutesOnly = body.processFirst10MinutesOnly === true;
    } catch {
      // No body provided, use default (full processing)
      processFirst10MinutesOnly = false;
    }

    // Create or update transcription job
    const job = await prisma.transcriptionJob.upsert({
      where: { assetId },
      create: {
        assetId,
        status: "PENDING",
        progress: 0,
      },
      update: {
        status: "PENDING",
        progress: 0,
        error: null,
        updatedAt: new Date(),
      },
    });

    // FIRE AND FORGET (Render-compatible)
    // Don't await - let it run in background. Node.js will keep it alive.
    // Errors are handled inside processVideoAsync, so we just log here.
    processVideoAsync(assetId, asset.s3Url, asset.title, asset.fileType, processFirst10MinutesOnly, job.id)
      .catch((error) => {
        // This catch is a safety net - processVideoAsync should handle its own errors
        console.error(`[API] Background processing error for asset ${assetId}:`, error);
        // The job should already be marked as FAILED by processVideoAsync, but update just in case
        prisma.transcriptionJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }).catch((updateError) => {
          console.error(`[API] Failed to update job ${job.id} status:`, updateError);
        });
      });

    // Return immediately with job ID
    return NextResponse.json({
      success: true,
      message: "Video processing started in background",
      jobId: job.id,
      status: "PENDING",
    });

  } catch (error) {
    console.error("Error generating transcript:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Check if this is a file size error that should show compression guide
    const isSizeError = errorMessage.includes("too large") || errorMessage.includes("File too large");
    const fileSizeMatch = errorMessage.match(/(\d+)MB/);
    const fileSize = fileSizeMatch ? parseInt(fileSizeMatch[1]) : null;

    return NextResponse.json(
      {
        error: "Failed to generate transcript",
        details: errorMessage,
        showCompressionGuide: isSizeError,
        fileSize: fileSize,
      },
      { status: 500 }
    );
  }
}