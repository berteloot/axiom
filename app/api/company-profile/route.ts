import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAccountId } from "@/lib/account-utils"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);

    // Get the company profile for the current account
    const profile = await prisma.companyProfile.findUnique({
      where: { accountId },
    })

    if (!profile) {
      return NextResponse.json({ profile: null })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Error fetching company profile:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch company profile" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);

    const body = await request.json()
    const {
      productName,
      productDescription,
      valueProposition,
      targetIndustries,
      idealCustomerProfile,
      competitors,
      brandVoice,
    } = body

    // Upsert: update if exists, create if not
    // One profile per account
    const profile = await prisma.companyProfile.upsert({
      where: { accountId },
      update: {
        productName,
        productDescription,
        valueProposition,
        targetIndustries,
        idealCustomerProfile,
        competitors,
        brandVoice,
      },
      create: {
        accountId,
        productName,
        productDescription,
        valueProposition,
        targetIndustries,
        idealCustomerProfile,
        competitors,
        brandVoice,
      },
    })

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Error saving company profile:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to save company profile" },
      { status: 500 }
    )
  }
}
