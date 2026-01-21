import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getICPsSchema = z.object({
  assetIds: z.array(z.string()).min(1, "At least one asset ID is required"),
})

/**
 * POST /api/assets/icps
 * Get all unique ICP targets from the specified assets
 * Used for populating ICP conversion dropdowns with actual ICPs from selected assets
 */
export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    const body = await request.json()

    const validation = getICPsSchema.safeParse(body)
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
      select: { icpTargets: true },
    })

    if (assets.length !== assetIds.length) {
      return NextResponse.json(
        { error: "Some assets not found or do not belong to your account" },
        { status: 403 }
      )
    }

    // Collect all unique ICPs from the selected assets
    const allICPs = new Set<string>()
    assets.forEach((asset) => {
      if (asset.icpTargets && Array.isArray(asset.icpTargets)) {
        asset.icpTargets.forEach((icp) => {
          if (icp && typeof icp === "string" && icp.trim()) {
            allICPs.add(icp.trim())
          }
        })
      }
    })

    return NextResponse.json({
      icps: Array.from(allICPs).sort(),
    })
  } catch (error) {
    console.error("Error fetching asset ICPs:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Failed to fetch asset ICPs", details: errorMessage },
      { status: 500 }
    )
  }
}
