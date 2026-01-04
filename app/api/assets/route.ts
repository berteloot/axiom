import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";

// Ensure this route runs in Node.js runtime (required for Prisma)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);

    const assets = await prisma.asset.findMany({
      where: {
        accountId,
      },
      include: {
        productLine: {
          select: {
            id: true,
            name: true,
            description: true,
            valueProposition: true,
            specificICP: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ assets });
  } catch (error) {
    console.error("Error fetching assets:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch assets" },
      { status: 500 }
    );
  }
}
