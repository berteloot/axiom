import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"
import { standardizeICPTargets } from "@/lib/icp-targets"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Validation schemas
const productLineUpdateSchema = z.object({
  name: z.string().min(1, "Product line name is required").max(100).optional(),
  description: z.string().max(1000).optional(),
  valueProposition: z.string().max(1000).optional(),
  specificICP: z.array(z.string()).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = await requireAccountId(request)
    const productLineId = params.id
    const body = await request.json()

    // Validate request body
    const validation = productLineUpdateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      )
    }

    const data = validation.data

    // Verify the product line belongs to the account's brand context
    const productLine = await prisma.productLine.findUnique({
      where: { id: productLineId },
      include: { brandContext: true }
    })

    if (!productLine) {
      return NextResponse.json(
        { error: "Product line not found" },
        { status: 404 }
      )
    }

    if (productLine.brandContext.accountId !== accountId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      )
    }

    // Check for duplicate name if name is being updated
    if (data.name && data.name !== productLine.name) {
      const existingProductLine = await prisma.productLine.findFirst({
        where: {
          brandContextId: productLine.brandContextId,
          name: data.name.trim(),
          NOT: {
            id: productLineId
          }
        }
      })

      if (existingProductLine) {
        return NextResponse.json(
          { error: "A product line with this name already exists" },
          { status: 400 }
        )
      }
    }

    // Standardize ICP targets if provided
    const standardizedICP = data.specificICP !== undefined 
      ? standardizeICPTargets(data.specificICP)
      : undefined;

    // Update the product line (only provided fields)
    const updatedProductLine = await prisma.productLine.update({
      where: { id: productLineId },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.valueProposition !== undefined && { valueProposition: data.valueProposition }),
        ...(standardizedICP !== undefined && { specificICP: standardizedICP }),
      }
    })

    return NextResponse.json({ productLine: updatedProductLine })
  } catch (error) {
    console.error("Error updating product line:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to update product line" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = await requireAccountId(request)
    const productLineId = params.id

    // Verify the product line belongs to the account's brand context
    const productLine = await prisma.productLine.findUnique({
      where: { id: productLineId },
      include: { brandContext: true }
    })

    if (!productLine) {
      return NextResponse.json(
        { error: "Product line not found" },
        { status: 404 }
      )
    }

    if (productLine.brandContext.accountId !== accountId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      )
    }

    // Delete the product line
    // Assets linked to this product line will have productLineId set to null (onDelete: SetNull)
    await prisma.productLine.delete({
      where: { id: productLineId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting product line:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    return NextResponse.json(
      { error: "Failed to delete product line" },
      { status: 500 }
    )
  }
}
