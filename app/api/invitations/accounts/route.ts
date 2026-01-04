import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/invitations/accounts
 * Get all accounts the current user can invite members to (where they are OWNER or ADMIN)
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get all accounts where user is OWNER or ADMIN
    const userAccounts = await prisma.userAccount.findMany({
      where: {
        userId,
        role: {
          in: ["OWNER", "ADMIN"]
        }
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        }
      },
      orderBy: {
        account: {
          name: "asc"
        }
      }
    });

    const accounts = userAccounts.map((ua) => ({
      id: ua.account.id,
      name: ua.account.name,
      slug: ua.account.slug,
      role: ua.role,
    }));

    return NextResponse.json({ accounts });

  } catch (error) {
    console.error("Error fetching invitable accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
