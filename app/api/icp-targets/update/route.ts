import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { ALL_JOB_TITLES } from "@/lib/job-titles"
import { standardizeJobTitle, standardizeICPTargets } from "@/lib/icp-targets"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateTargetSchema = z.object({
  oldTarget: z.string().min(1),
  newTarget: z.string().min(1),
})

/**
 * PATCH /api/icp-targets/update
 * Updates/renames an ICP target across the entire account
 * Updates:
 * - brandContext.customICPTargets
 * - brandContext.primaryICPRoles (if present)
 * - All assets' icpTargets arrays
 */
export async function PATCH(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    const body = await request.json()
    
    const validation = updateTargetSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      )
    }
    
    const { oldTarget, newTarget } = validation.data
    
    // Standardize both targets
    const standardizedOldTarget = standardizeJobTitle(oldTarget)
    const standardizedNewTarget = standardizeJobTitle(newTarget)
    
    // Validate that oldTarget is a custom target (not in standard list)
    const isStandard = ALL_JOB_TITLES.some(
      title => title.toLowerCase() === standardizedOldTarget.toLowerCase()
    )
    
    if (isStandard) {
      return NextResponse.json(
        { error: "Cannot edit standard job titles. Only custom ICP targets can be edited." },
        { status: 400 }
      )
    }
    
    // Check if new target already exists (case-insensitive)
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
      select: { 
        customICPTargets: true,
        primaryICPRoles: true 
      }
    })
    
    if (!brandContext) {
      return NextResponse.json(
        { error: "Brand context not found" },
        { status: 404 }
      )
    }
    
    // Check if new target already exists
    const allTargets = [
      ...ALL_JOB_TITLES,
      ...brandContext.customICPTargets,
      ...brandContext.primaryICPRoles
    ]
    const targetExists = allTargets.some(
      t => t.toLowerCase() === standardizedNewTarget.toLowerCase()
    )
    
    if (targetExists && standardizedNewTarget.toLowerCase() !== standardizedOldTarget.toLowerCase()) {
      return NextResponse.json(
        { error: `ICP target "${standardizedNewTarget}" already exists` },
        { status: 400 }
      )
    }
    
    // Update in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update customICPTargets array
      const updatedCustom = standardizeICPTargets(
        brandContext.customICPTargets.map(
          t => t.toLowerCase() === standardizedOldTarget.toLowerCase() ? standardizedNewTarget : t
        )
      )
      
      // 2. Update primaryICPRoles if present
      const updatedPrimary = standardizeICPTargets(
        brandContext.primaryICPRoles.map(
          t => t.toLowerCase() === standardizedOldTarget.toLowerCase() ? standardizedNewTarget : t
        )
      )
      
      // 3. Update brand context
      await tx.brandContext.update({
        where: { accountId },
        data: {
          customICPTargets: updatedCustom,
          primaryICPRoles: updatedPrimary,
        }
      })
      
      // 4. Update all assets' icpTargets arrays
      const assets = await tx.asset.findMany({
        where: { accountId },
        select: { id: true, icpTargets: true }
      })
      
      for (const asset of assets) {
        const hasOldTarget = asset.icpTargets.some(
          t => t.toLowerCase() === standardizedOldTarget.toLowerCase()
        )
        
        if (hasOldTarget) {
          const updatedTargets = standardizeICPTargets(
            asset.icpTargets.map(
              t => t.toLowerCase() === standardizedOldTarget.toLowerCase() ? standardizedNewTarget : t
            )
          )
          
          await tx.asset.update({
            where: { id: asset.id },
            data: { icpTargets: updatedTargets }
          })
        }
      }
    })
    
    return NextResponse.json({ 
      success: true,
      message: `ICP target "${standardizedOldTarget}" has been renamed to "${standardizedNewTarget}" across all assets and settings.`
    })
  } catch (error) {
    console.error("[ICP Targets Update] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    return NextResponse.json(
      { error: "Failed to update ICP target", details: errorMessage },
      { status: 500 }
    )
  }
}
