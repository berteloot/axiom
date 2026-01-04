import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bulkUpdateSchema = z.object({
  assetIds: z.array(z.string()).min(1, "At least one asset ID is required"),
  productLineId: z.string().nullable().optional(),
  icpTargets: z.array(z.string()).optional(),
  funnelStage: z.enum([
    "TOFU_AWARENESS",
    "MOFU_CONSIDERATION",
    "BOFU_DECISION",
    "RETENTION"
  ]).optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    const body = await request.json()

    // Validate request body
    const validation = bulkUpdateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      )
    }

    const { assetIds, productLineId, icpTargets, funnelStage } = validation.data

    // Verify all assets belong to the current account
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: assetIds },
        accountId,
      },
    })

    if (assets.length !== assetIds.length) {
      return NextResponse.json(
        { error: "Some assets not found or do not belong to your account" },
        { status: 403 }
      )
    }

    // If productLineId is provided, verify it exists and belongs to the account
    if (productLineId !== undefined) {
      if (productLineId !== null) {
        const productLine = await prisma.productLine.findFirst({
          where: {
            id: productLineId,
            brandContext: {
              accountId,
            },
          },
        })

        if (!productLine) {
          return NextResponse.json(
            { error: "Product line not found or does not belong to your account" },
            { status: 404 }
          )
        }
      }
    }

    // Build update data object (only include fields that are defined)
    const updateData: {
      productLineId?: string | null
      icpTargets?: string[]
      funnelStage?: string
    } = {}

    if (productLineId !== undefined) {
      updateData.productLineId = productLineId
    }
    if (icpTargets !== undefined) {
      updateData.icpTargets = icpTargets
    }
    if (funnelStage !== undefined) {
      updateData.funnelStage = funnelStage
    }

    // Bulk update all assets
    const result = await prisma.asset.updateMany({
      where: {
        id: { in: assetIds },
        accountId,
      },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      message: `Successfully updated ${result.count} asset${result.count !== 1 ? "s" : ""}`,
    })
  } catch (error) {
    console.error("Error bulk updating assets:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Failed to bulk update assets" },
      { status: 500 }
    )
  }
}
