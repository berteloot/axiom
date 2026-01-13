import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/users
 * Get all users in the current account
 */
export async function GET(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);

    // Get all users in the account
    const userAccounts = await prisma.userAccount.findMany({
      where: { accountId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const users = userAccounts.map((ua) => ({
      id: ua.user.id,
      email: ua.user.email,
      name: ua.user.name || ua.user.email,
      role: ua.role,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
