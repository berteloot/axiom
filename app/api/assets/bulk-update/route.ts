import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { z } from "zod"
import { standardizeICPTargets } from "@/lib/icp-targets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bulkUpdateSchema = z.object({
  assetIds: z.array(z.string()).min(1, "At least one asset ID is required"),
  productLineIds: z.array(z.string()).optional(), // Array of product line IDs
  icpTargets: z.array(z.string()).optional(),
  icpConvert: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
  }).optional(),
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

    const { assetIds, productLineIds, icpTargets, icpConvert, funnelStage } = validation.data

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

    // If productLineIds is provided, verify all exist and belong to the account
    if (productLineIds !== undefined) {
      const brandContext = await prisma.brandContext.findUnique({
        where: { accountId },
        include: {
          productLines: {
            select: { id: true },
          },
        },
      })

      if (brandContext) {
        const validProductLineIds = brandContext.productLines.map(pl => pl.id)
        const invalidIds = productLineIds.filter(id => !validProductLineIds.includes(id))
        if (invalidIds.length > 0) {
          return NextResponse.json(
            { error: `Invalid product line IDs: ${invalidIds.join(", ")}` },
            { status: 400 }
          )
        }
      }
    }

    // Handle ICP conversion if provided
    if (icpConvert) {
      const { from, to } = icpConvert
      // Standardize both values for consistent comparison
      const standardizedFrom = standardizeICPTargets([from.trim()])[0]
      const standardizedTo = standardizeICPTargets([to.trim()])[0]

      // Get all assets that need ICP conversion
      const assetsToUpdate = await prisma.asset.findMany({
        where: {
          id: { in: assetIds },
          accountId,
        },
        select: { id: true, icpTargets: true },
      })

      // Update each asset's ICP targets array
      for (const asset of assetsToUpdate) {
        // Check if asset has the "from" target (case-insensitive)
        const fromTargetIndex = asset.icpTargets.findIndex(
          (target) => standardizeICPTargets([target])[0].toLowerCase() === standardizedFrom.toLowerCase()
        )

        if (fromTargetIndex !== -1) {
          // Check if "to" target already exists (case-insensitive)
          const hasToTarget = asset.icpTargets.some(
            (target) => standardizeICPTargets([target])[0].toLowerCase() === standardizedTo.toLowerCase()
          )

          if (hasToTarget) {
            // If "to" target already exists, just remove the "from" target
            const updatedTargets = asset.icpTargets.filter(
              (target, index) => index !== fromTargetIndex
            )
            await prisma.asset.update({
              where: { id: asset.id },
              data: { icpTargets: standardizeICPTargets(updatedTargets) },
            })
          } else {
            // Replace the "from" target with "to" target
            const updatedTargets = asset.icpTargets.map((target, index) =>
              index === fromTargetIndex ? standardizedTo : target
            )
            await prisma.asset.update({
              where: { id: asset.id },
              data: { icpTargets: standardizeICPTargets(updatedTargets) },
            })
          }
        }
      }
    }

    // Build update data object (only include fields that are defined)
    const updateData: Record<string, any> = {}

    if (icpTargets !== undefined) {
      updateData.icpTargets = standardizeICPTargets(icpTargets)
    }
    if (funnelStage !== undefined) {
      updateData.funnelStage = funnelStage
    }

    // Update asset fields (excluding product lines and ICP conversion which are handled separately)
    if (Object.keys(updateData).length > 0) {
      await prisma.asset.updateMany({
        where: {
          id: { in: assetIds },
          accountId,
        },
        data: updateData,
      })
    }

    // Update product lines if provided
    if (productLineIds !== undefined) {
      // Delete existing associations for all selected assets
      await prisma.assetProductLine.deleteMany({
        where: {
          assetId: { in: assetIds },
        },
      })

      // Create new associations for all selected assets
      if (productLineIds.length > 0) {
        const associations = assetIds.flatMap(assetId =>
          productLineIds.map(productLineId => ({
            assetId,
            productLineId,
          }))
        )

        await prisma.assetProductLine.createMany({
          data: associations,
        })
      }
    }

    const result = { count: assetIds.length }

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
