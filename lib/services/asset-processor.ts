import { prisma } from "@/lib/prisma";
import { analyzeAsset } from "@/lib/ai";
import { extractTextFromS3 } from "@/lib/text-extraction";
import { analyzeVideo, isAnalyzableMedia, videoAnalysisToText } from "@/lib/ai/video-analyzer";
import { extractDominantColor } from "@/lib/color-utils";

/**
 * Process asset asynchronously:
 * 1. Extract text (if PDF/DOCX)
 * 2. Analyze with AI
 * 3. Update asset with analysis results
 */
export async function processAssetAsync(
  assetId: string,
  s3Url: string,
  fileType: string
): Promise<void> {
  console.log(`[PROCESSOR] Starting async processing for asset ${assetId}`);
  console.log(`[PROCESSOR] File type: ${fileType}, S3 URL: ${s3Url.substring(0, 50)}...`);
  
  try {
    // Get asset to retrieve accountId
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { accountId: true },
    });

    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    // Update status to PROCESSING
    await prisma.asset.update({
      where: { id: assetId },
      data: { status: "PROCESSING" },
    });

    let extractedText: string | null = null;

    // Check if this is a video/audio file (Audio-First analysis)
    const isMedia = isAnalyzableMedia(fileType);
    console.log(`[PROCESSOR] Is media file: ${isMedia}`);
    
    if (isMedia) {
      try {
        // Get original filename from asset
        const assetWithName = await prisma.asset.findUnique({
          where: { id: assetId },
          select: { title: true },
        });
        const fileName = assetWithName?.title || "video.mp4";
        
        console.log(`[VIDEO] Starting video/audio processing for asset ${assetId}`);
        console.log(`[VIDEO] File: ${fileName}, Type: ${fileType}`);
        
        // Analyze video with Audio-First approach (transcribe + analyze)
        // For large videos, audio is automatically extracted to reduce size
        const videoAnalysis = await analyzeVideo(s3Url, fileName, fileType, undefined, assetId);
        
        // Convert video analysis to text for the main analyzer
        extractedText = videoAnalysisToText(videoAnalysis);
        
        // Store the transcript as extracted text
        await prisma.asset.update({
          where: { id: assetId },
          data: { 
            extractedText: videoAnalysis.transcript,
          },
        });
        
        console.log(`Video transcription successful for asset ${assetId} (${videoAnalysis.transcript.length} chars, ${videoAnalysis.estimatedDurationMinutes} min)`);
      } catch (error) {
        console.error(`Error processing video for asset ${assetId}:`, error);
        throw error; // Re-throw for video - can't fall back
      }
    }

    // Extract text if it's a text-based file
    // Support: PDF, DOCX, DOC, TXT, CSV, and Excel files
    const isTextBased = 
      fileType === "application/pdf" ||
      fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || // DOCX
      fileType === "application/msword" || // DOC
      fileType === "application/vnd.ms-excel" || // XLS
      fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // XLSX
      fileType === "text/csv" ||
      fileType.startsWith("text/");

    if (isTextBased && !isMedia) {
      try {
        extractedText = await extractTextFromS3(s3Url, fileType);
        // Store extracted text
        await prisma.asset.update({
          where: { id: assetId },
          data: { extractedText },
        });
        console.log(`Text extraction successful for asset ${assetId} (${extractedText?.length || 0} chars)`);
      } catch (error) {
        console.error(`Error extracting text for asset ${assetId}:`, error);
        console.log(`Will attempt visual analysis instead for ${fileType}`);
        // Continue with analysis even if text extraction fails
        // For PDFs, the AI will fall back to visual analysis
      }
    }

    // Extract dominant color if it's an image file
    let dominantColor: string | null = null;
    if (fileType.startsWith("image/")) {
      try {
        console.log(`[COLOR] Extracting dominant color for asset ${assetId}`);
        dominantColor = await extractDominantColor(s3Url);
        if (dominantColor) {
          console.log(`[COLOR] Dominant color extracted: ${dominantColor}`);
        } else {
          console.log(`[COLOR] Could not extract dominant color (may be transparent or unsupported format)`);
        }
      } catch (error) {
        console.error(`[COLOR] Error extracting dominant color for asset ${assetId}:`, error);
        // Don't fail the entire processing if color extraction fails
      }
    }

    // Analyze with AI (pass accountId for CompanyProfile scoping)
    const analysis = await analyzeAsset(extractedText, fileType, s3Url, asset.accountId);

    // Convert suggestedExpiryDate string to Date object
    const expiryDate = analysis.suggestedExpiryDate 
      ? new Date(analysis.suggestedExpiryDate)
      : null;

    // Update asset with analysis results and traceability fields
    await prisma.asset.update({
      where: { id: assetId },
      data: {
        funnelStage: analysis.funnelStage,
        icpTargets: analysis.icpTargets,
        painClusters: analysis.painClusters,
        outreachTip: analysis.outreachTip,
        atomicSnippets: analysis.atomicSnippets as any, // Prisma Json type
        contentQualityScore: analysis.contentQualityScore,
        expiryDate: expiryDate,
        productLineId: analysis.matchedProductLineId || null, // Link to product line if identified
        dominantColor: dominantColor, // Store extracted dominant color
        status: "PROCESSED",
        // Traceability fields
        aiModel: "gpt-4o-2024-08-06", // Model used for analysis
        promptVersion: "2.0", // Updated version with multi-product support
        analyzedAt: new Date(), // When AI analysis was performed
        aiConfidence: analysis.contentQualityScore ? analysis.contentQualityScore / 100 : null, // Convert 0-100 to 0-1
      },
    });

    console.log(`Successfully processed asset ${assetId}`);
  } catch (error) {
    console.error(`Error in async processing for asset ${assetId}:`, error);
    // Update status to indicate error with a concise message
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const shortMessage = errorMessage.length > 100 ? errorMessage.substring(0, 97) + "..." : errorMessage;
    await prisma.asset.update({
      where: { id: assetId },
      data: { 
        status: "ERROR",
        outreachTip: `Processing failed: ${shortMessage}`,
      },
    });
    // Don't re-throw - error is logged and asset is marked as ERROR
  }
}
