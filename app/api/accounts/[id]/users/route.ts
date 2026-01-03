import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "berteloot@gmail.com";

// GET /api/accounts/[id]/users - Get all users for an account
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Get all users in the account
    const userAccounts = await prisma.userAccount.findMany({
      where: { accountId: params.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Get account subscription info
    const account = await prisma.account.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      users: userAccounts.map((ua) => ({
        id: ua.user.id,
        email: ua.user.email,
        name: ua.user.name,
        role: ua.role,
        emailVerified: ua.user.emailVerified,
        joinedAt: ua.createdAt.toISOString(),
        userCreatedAt: ua.user.createdAt.toISOString(),
      })),
      account: {
        id: account.id,
        name: account.name,
        subscriptionStatus: account.subscriptionStatus,
        trialEndsAt: account.trialEndsAt?.toISOString(),
        subscriptionEndsAt: account.subscriptionEndsAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
