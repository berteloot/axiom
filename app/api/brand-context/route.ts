import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { extractCustomTargets, mergeCustomTargets, standardizeICPTargets } from "@/lib/icp-targets"
import { ALL_JOB_TITLES } from "@/lib/job-titles"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Validation schemas
const brandContextSchema = z.object({
  brandVoice: z.array(z.string()).min(1, "At least one brand voice attribute is required").max(10),
  competitors: z.array(z.string()).max(20),
  targetIndustries: z.array(z.string()).min(1, "At least one industry is required").max(10),
  websiteUrl: z.string().url().nullable().optional(),
  valueProposition: z.string().max(500).nullable().optional(),
  painClusters: z.array(z.string()).max(10),
  keyDifferentiators: z.array(z.string()).max(10),
  primaryICPRoles: z.array(z.string()).max(10),
  useCases: z.array(z.string()).max(20),
  roiClaims: z.array(z.string()).max(10),
  customICPTargets: z.array(z.string()).max(50).optional(),
})

const partialBrandContextSchema = brandContextSchema.partial()

export async function GET(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    console.log("[Brand Context GET] Account ID:", accountId)

    // Get the brand context with product lines for the current account
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
      include: {
        productLines: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!brandContext) {
      console.log("[Brand Context GET] No brand context found for account:", accountId)
      return NextResponse.json({ 
        brandContext: null,
        productLines: []
      })
    }

    console.log("[Brand Context GET] Found brand context:", brandContext.id, "with", brandContext.productLines.length, "product lines")
    return NextResponse.json({ 
      brandContext,
      productLines: brandContext.productLines 
    })
  } catch (error) {
    console.error("[Brand Context GET] Error fetching brand context:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("[Brand Context GET] Error details:", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    })
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to fetch brand context", details: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    console.log("[Brand Context POST] Account ID:", accountId)
    
    const body = await request.json()
    console.log("[Brand Context POST] Request body:", JSON.stringify(body, null, 2))

    // Validate request body
    const validation = brandContextSchema.safeParse(body)
    if (!validation.success) {
      console.error("[Brand Context POST] Validation failed:", validation.error.issues)
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      )
    }

    const data = validation.data

    // Check if brand context already exists
    const existing = await prisma.brandContext.findUnique({
      where: { accountId }
    })

    if (existing) {
      console.log("[Brand Context POST] Brand context already exists for account:", accountId)
      return NextResponse.json(
        { error: "Brand context already exists. Use PATCH to update." },
        { status: 400 }
      )
    }

    // Extract custom targets from primaryICPRoles and merge with provided customICPTargets
    const customFromPrimary = extractCustomTargets(data.primaryICPRoles || [], ALL_JOB_TITLES)
    const providedCustom = data.customICPTargets || []
    const mergedCustomTargets = mergeCustomTargets(providedCustom, customFromPrimary)
    
    // Standardize all ICP-related arrays
    const standardizedPrimaryICPRoles = standardizeICPTargets(data.primaryICPRoles || [])
    
    // Create brand context
    console.log("[Brand Context POST] Creating brand context for account:", accountId)
    const brandContext = await prisma.brandContext.create({
      data: {
        accountId,
        brandVoice: data.brandVoice,
        competitors: data.competitors || [],
        targetIndustries: data.targetIndustries,
        websiteUrl: data.websiteUrl || null,
        valueProposition: data.valueProposition || null,
        painClusters: data.painClusters || [],
        keyDifferentiators: data.keyDifferentiators || [],
        primaryICPRoles: standardizedPrimaryICPRoles,
        useCases: data.useCases || [],
        roiClaims: data.roiClaims || [],
        customICPTargets: mergedCustomTargets,
      },
    })

    console.log("[Brand Context POST] Successfully created brand context:", brandContext.id)
    return NextResponse.json({ brandContext }, { status: 201 })
  } catch (error) {
    console.error("[Brand Context POST] Error creating brand context:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("[Brand Context POST] Error details:", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    })
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to create brand context", details: errorMessage },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    console.log("[Brand Context PATCH] Account ID:", accountId)
    
    const body = await request.json()
    console.log("[Brand Context PATCH] Request body:", JSON.stringify(body, null, 2))

    // Validate request body (partial update allowed)
    const validation = partialBrandContextSchema.safeParse(body)
    if (!validation.success) {
      console.error("[Brand Context PATCH] Validation failed:", validation.error.issues)
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      )
    }

    const data = validation.data

    // Check if brand context exists
    const existing = await prisma.brandContext.findUnique({
      where: { accountId }
    })

    if (!existing) {
      console.log("[Brand Context PATCH] Brand context not found for account:", accountId)
      return NextResponse.json(
        { error: "Brand context not found. Use POST to create." },
        { status: 404 }
      )
    }

    console.log("[Brand Context PATCH] Updating brand context for account:", accountId)
    
    // If primaryICPRoles is being updated, extract custom targets and merge into customICPTargets
    let updatedCustomTargets = existing.customICPTargets || []
    if (data.primaryICPRoles !== undefined) {
      const standardizedPrimary = standardizeICPTargets(data.primaryICPRoles)
      const customFromPrimary = extractCustomTargets(standardizedPrimary, ALL_JOB_TITLES)
      if (customFromPrimary.length > 0) {
        updatedCustomTargets = mergeCustomTargets(updatedCustomTargets, customFromPrimary)
      }
    }
    
    // If customICPTargets is explicitly provided, standardize it; otherwise use the merged version
    const finalCustomTargets = data.customICPTargets !== undefined 
      ? standardizeICPTargets(data.customICPTargets)
      : updatedCustomTargets
    
    // Update brand context with only provided fields
    const brandContext = await prisma.brandContext.update({
      where: { accountId },
      data: {
        ...(data.brandVoice !== undefined && { brandVoice: data.brandVoice }),
        ...(data.competitors !== undefined && { competitors: data.competitors }),
        ...(data.targetIndustries !== undefined && { targetIndustries: data.targetIndustries }),
        ...(data.websiteUrl !== undefined && { websiteUrl: data.websiteUrl }),
        ...(data.valueProposition !== undefined && { valueProposition: data.valueProposition }),
        ...(data.painClusters !== undefined && { painClusters: data.painClusters }),
        ...(data.keyDifferentiators !== undefined && { keyDifferentiators: data.keyDifferentiators }),
        ...(data.primaryICPRoles !== undefined && { primaryICPRoles: standardizeICPTargets(data.primaryICPRoles) }),
        ...(data.useCases !== undefined && { useCases: data.useCases }),
        ...(data.roiClaims !== undefined && { roiClaims: data.roiClaims }),
        customICPTargets: finalCustomTargets, // Always update to ensure sync
      },
    })

    console.log("[Brand Context PATCH] Successfully updated brand context:", brandContext.id)
    return NextResponse.json({ brandContext })
  } catch (error) {
    console.error("[Brand Context PATCH] Error updating brand context:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("[Brand Context PATCH] Error details:", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    })
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to update brand context", details: errorMessage },
      { status: 500 }
    )
  }
}
