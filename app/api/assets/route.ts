import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";

// Ensure this route runs in Node.js runtime (required for Prisma)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO: Implement proper authentication
function isAuthenticated(request: NextRequest): boolean {
  return true;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const accountId = await requireAccountId(request);

    const assets = await prisma.asset.findMany({
      where: {
        accountId,
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
