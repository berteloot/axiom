import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "berteloot@gmail.com";

// GET /api/admin/accounts - Get all accounts in the system (super admin only)
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    // Get current user to check if they're the admin
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser || currentUser.email !== ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    // Get all accounts with user counts
    const accounts = await prisma.account.findMany({
      include: {
        userAccounts: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            userAccounts: true,
            assets: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const accountsWithStats = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      slug: account.slug,
      subscriptionStatus: account.subscriptionStatus,
      trialEndsAt: account.trialEndsAt?.toISOString(),
      subscriptionEndsAt: account.subscriptionEndsAt?.toISOString(),
      createdAt: account.createdAt.toISOString(),
      userCount: account._count.userAccounts,
      assetCount: account._count.assets,
      owners: account.userAccounts
        .filter((ua) => ua.role === "OWNER")
        .map((ua) => ({
          id: ua.user.id,
          email: ua.user.email,
          name: ua.user.name,
        })),
    }));

    return NextResponse.json({ accounts: accountsWithStats });
  } catch (error) {
    console.error("Error fetching all accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
