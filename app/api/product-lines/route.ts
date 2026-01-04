import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Validation schemas
const productLineSchema = z.object({
  name: z.string().min(1, "Product line name is required").max(100),
  description: z.string().max(1000).optional().default(""),
  valueProposition: z.string().max(1000).optional().default(""),
  specificICP: z.string().max(1000).optional().default(""),
})

export async function GET(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)

    // Get the brand context and all product lines for the account
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
      include: {
        productLines: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    })

    if (!brandContext) {
      return NextResponse.json({ 
        brandContext: null,
        productLines: [] 
      })
    }

    return NextResponse.json({ 
      brandContext,
      productLines: brandContext.productLines 
    })
  } catch (error) {
    console.error("Error fetching product lines:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to fetch product lines" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request)
    const body = await request.json()

    // Validate request body
    const validation = productLineSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      )
    }

    const data = validation.data

    // Ensure brand context exists
    let brandContext = await prisma.brandContext.findUnique({
      where: { accountId }
    })

    if (!brandContext) {
      return NextResponse.json(
        { error: "Brand context must be created before adding product lines" },
        { status: 400 }
      )
    }

    // Check for duplicate name within the same brand context
    const existingProductLine = await prisma.productLine.findFirst({
      where: {
        brandContextId: brandContext.id,
        name: data.name.trim()
      }
    })

    if (existingProductLine) {
      return NextResponse.json(
        { error: "A product line with this name already exists" },
        { status: 400 }
      )
    }

    // Create the product line
    const productLine = await prisma.productLine.create({
      data: {
        brandContextId: brandContext.id,
        name: data.name.trim(),
        description: data.description || "",
        valueProposition: data.valueProposition || "",
        specificICP: data.specificICP || "",
      }
    })

    return NextResponse.json({ productLine }, { status: 201 })
  } catch (error) {
    console.error("Error creating product line:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to create product line" },
      { status: 500 }
    )
  }
}
