import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { extractBrandContextFromText } from "@/lib/ai/website-scanner";
import { requireAccountId } from "@/lib/account-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const analyzeTextSchema = z.object({
  text: z.string().min(50, "Text must be at least 50 characters long"),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { text } = analyzeTextSchema.parse(body);

    // Get existing custom industries from brand context to preserve them
    let existingCustomIndustries: string[] = []
    try {
      const accountId = await requireAccountId(request)
      const brandContext = await prisma.brandContext.findUnique({
        where: { accountId },
        select: { targetIndustries: true }
      })
      if (brandContext) {
        const industriesArray = require("@/lib/constants/industries").INDUSTRIES as readonly string[]
        existingCustomIndustries = brandContext.targetIndustries.filter(
          industry => !industriesArray.includes(industry as any)
        )
      }
    } catch (error) {
      // If account ID is not available or brand context doesn't exist, continue without custom industries
      console.log("Could not fetch existing custom industries:", error)
    }

    // Extract brand context from text
    const result = await extractBrandContextFromText(text, existingCustomIndustries);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error analyzing text:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request: " + error.issues[0].message },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to analyze text" },
      { status: 500 }
    );
  }
}