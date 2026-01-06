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

    // Trigger async re-analysis for each asset
    // Don't await - let them process in the background
    const reanalysisPromises = analyzableAssets.map(asset =>
      processAssetAsync(asset.id, asset.s3Url, asset.fileType).catch((error) => {
        console.error(`Error re-analyzing asset ${asset.id}:`, error)
        // Don't throw - we want to continue processing other assets
      })
    )

    // Start all re-analyses (fire and forget)
    Promise.all(reanalysisPromises).catch((error) => {
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
