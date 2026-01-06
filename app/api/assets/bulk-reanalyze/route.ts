import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { z } from "zod"
import { processAssetAsync } from "@/lib/services/asset-processor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bulkReanalyzeSchema = z.object({
  assetIds: z.array(z.string()).min(1, "At least one asset ID is required"),
})

/**
 * POST /api/assets/bulk-reanalyze
 * Triggers AI re-analysis for multiple assets
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    const body = await request.json()

    // Validate request body
    const validation = bulkReanalyzeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      )
    }

    const { assetIds } = validation.data

    // Verify all assets belong to the current account
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: assetIds },
        accountId,
      },
      select: {
        id: true,
        s3Url: true,
        fileType: true,
        status: true,
      },
    })

    if (assets.length !== assetIds.length) {
      return NextResponse.json(
        { error: "Some assets not found or do not belong to your account" },
        { status: 403 }
      )
    }

    // Filter out assets that can't be re-analyzed (e.g., PENDING, PROCESSING)
    const analyzableAssets = assets.filter(
      asset => asset.status === "PROCESSED" || asset.status === "APPROVED" || asset.status === "ERROR"
    )

    if (analyzableAssets.length === 0) {
      return NextResponse.json(
        { error: "No assets can be re-analyzed. Assets must be in PROCESSED, APPROVED, or ERROR status." },
        { status: 400 }
      )
    }

    // Process assets with concurrency limit to prevent memory exhaustion
    // Videos are memory-intensive, so we process them sequentially
    // Text/images can be processed in parallel (max 3 at a time)
    const MAX_CONCURRENT = 3
    
    // Separate videos from other assets
    const videoAssets = analyzableAssets.filter(asset => 
      asset.fileType.startsWith("video/") || asset.fileType.startsWith("audio/")
    )
    const otherAssets = analyzableAssets.filter(asset => 
      !asset.fileType.startsWith("video/") && !asset.fileType.startsWith("audio/")
    )

    // Process videos sequentially (one at a time) to avoid memory issues
    const processVideosSequentially = async () => {
      for (const asset of videoAssets) {
        try {
          console.log(`[BULK] Processing video asset ${asset.id} (${videoAssets.indexOf(asset) + 1}/${videoAssets.length})`)
          await processAssetAsync(asset.id, asset.s3Url, asset.fileType)
          
          // Add a small delay between videos to allow garbage collection
          // This helps prevent memory accumulation when processing multiple large videos
          if (videoAssets.indexOf(asset) < videoAssets.length - 1) {
            console.log(`[BULK] Waiting 2 seconds before processing next video to allow memory cleanup...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        } catch (error) {
          console.error(`Error re-analyzing video asset ${asset.id}:`, error)
          // Continue with next video
        }
      }
    }

    // Process other assets with concurrency limit
    const processOthersWithLimit = async () => {
      for (let i = 0; i < otherAssets.length; i += MAX_CONCURRENT) {
        const batch = otherAssets.slice(i, i + MAX_CONCURRENT)
        await Promise.all(
          batch.map(asset =>
            processAssetAsync(asset.id, asset.s3Url, asset.fileType).catch((error) => {
              console.error(`Error re-analyzing asset ${asset.id}:`, error)
              // Don't throw - we want to continue processing other assets
            })
          )
        )
      }
    }

    // Start processing (fire and forget)
    Promise.all([
      processVideosSequentially(),
      processOthersWithLimit()
    ]).catch((error) => {
      console.error("Error in bulk re-analysis:", error)
    })

    const skippedCount = assets.length - analyzableAssets.length

    return NextResponse.json({
      success: true,
      queuedCount: analyzableAssets.length,
      skippedCount,
      message: `Re-analysis queued for ${analyzableAssets.length} asset${analyzableAssets.length !== 1 ? "s" : ""}${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}. Assets will be processed in the background.`,
    })
  } catch (error) {
    console.error("Error bulk re-analyzing assets:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Failed to queue bulk re-analysis" },
      { status: 500 }
    )
  }
}
