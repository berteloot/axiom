import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { getUnifiedICPTargets, extractCustomTargets } from "@/lib/icp-targets"
import { ALL_JOB_TITLES } from "@/lib/job-titles"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/icp-targets
 * Returns the unified list of ICP targets for the current account
 * Combines standard job titles with account-specific custom targets
 */
export async function GET(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    console.log("[ICP Targets GET] Account ID:", accountId)
    
    // Get brand context to retrieve custom ICP targets
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
      select: { 
        customICPTargets: true,
        primaryICPRoles: true 
      }
    })
    
    console.log("[ICP Targets GET] Brand context:", {
      hasContext: !!brandContext,
      primaryICPRoles: brandContext?.primaryICPRoles || [],
      customICPTargets: brandContext?.customICPTargets || []
    })
    
    // Get custom targets from both customICPTargets and primaryICPRoles
    // This ensures that any custom target added to primaryICPRoles is available
    const customFromPrimary = extractCustomTargets(
      brandContext?.primaryICPRoles || [],
      ALL_JOB_TITLES
    )
    
    console.log("[ICP Targets GET] Custom from primaryICPRoles:", customFromPrimary)
    
    // Merge all custom targets (from both sources)
    const allCustomTargets = Array.from(
      new Set([
        ...(brandContext?.customICPTargets || []),
        ...customFromPrimary
      ])
    )
    
    console.log("[ICP Targets GET] All custom targets:", allCustomTargets)
    
    const unifiedTargets = getUnifiedICPTargets(allCustomTargets)
    
    console.log("[ICP Targets GET] Unified targets count:", unifiedTargets.length)
    console.log("[ICP Targets GET] Has 'CX' in unified:", unifiedTargets.some(t => t.toLowerCase() === "cx"))
    
    return NextResponse.json({ 
      icpTargets: unifiedTargets,
      customTargets: allCustomTargets 
    })
  } catch (error) {
    console.error("[ICP Targets GET] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to fetch ICP targets", details: errorMessage },
      { status: 500 }
    )
  }
}
