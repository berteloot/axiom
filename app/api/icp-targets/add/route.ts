import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { mergeCustomTargets } from "@/lib/icp-targets"

const addCustomTargetSchema = z.object({
  targets: z.array(z.string()).min(1).max(10),
})

/**
 * POST /api/icp-targets/add
 * Adds custom ICP targets to the account's brand context
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    const body = await request.json()
    
    const validation = addCustomTargetSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      )
    }
    
    const { targets } = validation.data
    
    // Get existing brand context
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
      select: { customICPTargets: true }
    })
    
    const existingCustom = brandContext?.customICPTargets || []
    const mergedCustom = mergeCustomTargets(existingCustom, targets)
    
    // Update brand context with merged custom targets
    const updated = await prisma.brandContext.upsert({
      where: { accountId },
      create: {
        accountId,
        brandVoice: [], // Required fields
        targetIndustries: [],
        customICPTargets: mergedCustom,
      },
      update: {
        customICPTargets: mergedCustom,
      },
    })
    
    return NextResponse.json({ 
      customICPTargets: updated.customICPTargets 
    })
  } catch (error) {
    console.error("[ICP Targets Add] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    return NextResponse.json(
      { error: "Failed to add custom ICP targets", details: errorMessage },
      { status: 500 }
    )
  }
}
