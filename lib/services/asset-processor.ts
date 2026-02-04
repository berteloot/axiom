import { prisma } from "@/lib/prisma";
import { analyzeAsset } from "@/lib/ai";
import { extractTextFromS3 } from "@/lib/text-extraction";
import { analyzeVideo, isAnalyzableMedia, videoAnalysisToText } from "@/lib/ai/video-analyzer";
import { extractDominantColor } from "@/lib/color-utils";
import { standardizeICPTargets } from "@/lib/icp-targets";
import { normalizeAssetType } from "@/lib/constants/asset-types";

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
    // Get asset to retrieve accountId, title, existing extractedText, and atomicSnippets
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { 
        accountId: true,
        title: true,
        extractedText: true,
        atomicSnippets: true,
      },
    });

    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    // Update status to PROCESSING
    await prisma.asset.update({
      where: { id: assetId },
      data: { status: "PROCESSING" },
    });

    // Use existing extractedText if available (for re-analysis scenarios)
    let extractedText: string | null = asset.extractedText;

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
      // Only extract if we don't already have text (e.g., for re-analysis)
      if (!extractedText || extractedText.trim().length === 0) {
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
      } else {
        console.log(`[PROCESSOR] Using existing extractedText for asset ${assetId} (${extractedText.length} chars)`);
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

    // Analyze with AI (pass accountId for CompanyProfile scoping, and title for better asset type detection)
    const analysis = await analyzeAsset(extractedText, fileType, s3Url, asset.accountId, asset.title);

    // Standardize ICP targets from AI analysis
    const standardizedIcpTargets = standardizeICPTargets(analysis.icpTargets);

    // Normalize asset type from AI analysis (convert legacy format to new taxonomy)
    const normalizedAssetType = normalizeAssetType(analysis.assetType);

    // Preserve sourceUrl from existing atomicSnippets if it exists (for URL imports)
    let finalAtomicSnippets: any = analysis.atomicSnippets;
    if (asset.atomicSnippets) {
      const existingSnippets = asset.atomicSnippets as any;
      let sourceUrl: string | null = null;
      let importMetadata: any = null;
      
      // Extract sourceUrl and import metadata from existing atomicSnippets
      if (typeof existingSnippets === 'object' && !Array.isArray(existingSnippets)) {
        sourceUrl = existingSnippets?.sourceUrl || null;
        // Preserve other import metadata (type, importedAt, publishedDate, etc.)
        if (existingSnippets?.type === "single_import" || existingSnippets?.type === "blog_import") {
          importMetadata = {
            type: existingSnippets.type,
            sourceUrl: existingSnippets.sourceUrl,
            importedAt: existingSnippets.importedAt,
            ...(existingSnippets.publishedDate ? { publishedDate: existingSnippets.publishedDate } : {}),
            ...(existingSnippets.error ? { error: existingSnippets.error } : {}),
          };
        }
      } else if (Array.isArray(existingSnippets) && existingSnippets.length > 0) {
        // Check first element for sourceUrl
        const firstItem = existingSnippets[0];
        if (firstItem && typeof firstItem === 'object' && firstItem.sourceUrl) {
          sourceUrl = firstItem.sourceUrl;
        }
      } else if (typeof existingSnippets === 'string') {
        try {
          const parsed = JSON.parse(existingSnippets);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            sourceUrl = parsed?.sourceUrl || null;
            if (parsed?.type === "single_import" || parsed?.type === "blog_import") {
              importMetadata = {
                type: parsed.type,
                sourceUrl: parsed.sourceUrl,
                importedAt: parsed.importedAt,
                ...(parsed.publishedDate ? { publishedDate: parsed.publishedDate } : {}),
                ...(parsed.error ? { error: parsed.error } : {}),
              };
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
      
      // If we have a sourceUrl, merge it with AI-generated snippets
      if (sourceUrl && importMetadata) {
        // Merge: keep import metadata and add AI snippets
        finalAtomicSnippets = {
          ...importMetadata,
          aiSnippets: Array.isArray(analysis.atomicSnippets) ? analysis.atomicSnippets : [],
        };
      } else if (sourceUrl) {
        // If we only have sourceUrl but no full metadata, preserve it
        finalAtomicSnippets = {
          sourceUrl: sourceUrl,
          aiSnippets: Array.isArray(analysis.atomicSnippets) ? analysis.atomicSnippets : [],
        };
      }
    }

    // Update asset with analysis results and traceability fields
    // Note: expiryDate is not prefilled - user must set it manually if needed
    await prisma.asset.update({
      where: { id: assetId },
      data: {
        assetType: normalizedAssetType, // Save AI-detected asset type
        funnelStage: analysis.funnelStage,
        icpTargets: standardizedIcpTargets,
        painClusters: analysis.painClusters,
        outreachTip: analysis.outreachTip,
        atomicSnippets: finalAtomicSnippets as any, // Prisma Json type - includes preserved sourceUrl
        contentQualityScore: analysis.contentQualityScore,
        applicableIndustries: analysis.applicableIndustries || [], // AI-extracted industries
        // expiryDate is not set - user must set it manually
        dominantColor: dominantColor, // Store extracted dominant color
        status: "PROCESSED",
        // Traceability fields
        aiModel: "gpt-4o-2024-08-06", // Model used for analysis
        promptVersion: "3.1", // Added industry extraction
        analyzedAt: new Date(), // When AI analysis was performed
        aiConfidence: analysis.contentQualityScore ? analysis.contentQualityScore / 100 : null, // Convert 0-100 to 0-1
      },
    });

    // Update product line associations if matched
    if (analysis.matchedProductLineId) {
      // Delete existing associations
      await prisma.assetProductLine.deleteMany({
        where: { assetId },
      });

      // Create new association
      await prisma.assetProductLine.create({
        data: {
          assetId,
          productLineId: analysis.matchedProductLineId,
        },
      });
    }

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
