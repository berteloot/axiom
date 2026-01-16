import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "berteloot@gmail.com";

// GET /api/admin/users - Get all users in the system (super admin only)
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

    // Get all users with their account associations
    const users = await prisma.user.findMany({
      include: {
        userAccounts: {
          include: {
            account: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        _count: {
          select: {
            userAccounts: true,
            uploadedAssets: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const usersWithAccounts = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      accountType: user.accountType,
      createdAt: user.createdAt.toISOString(),
      accountCount: user._count.userAccounts,
      assetCount: user._count.uploadedAssets,
      accounts: user.userAccounts.map((ua) => ({
        accountId: ua.account.id,
        accountName: ua.account.name,
        accountSlug: ua.account.slug,
        role: ua.role,
        joinedAt: ua.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json({ users: usersWithAccounts });
  } catch (error) {
    console.error("Error fetching all users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
