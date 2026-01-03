import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "berteloot@gmail.com";

// DELETE /api/accounts/[id]/users/[userId] - Revoke user access to account
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const currentUserId = await getUserId(request);

    if (!currentUserId) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    // Get current user to check if they're the admin
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!currentUser || currentUser.email !== ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    // Verify the account exists
    const account = await prisma.account.findUnique({
      where: { id: params.id },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Verify the user exists and has access to this account
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId: params.userId,
          accountId: params.id,
        },
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "User not found in this account" },
        { status: 404 }
      );
    }

    // Check if this is the last owner - prevent deleting the last owner
    const ownerCount = await prisma.userAccount.count({
      where: {
        accountId: params.id,
        role: "OWNER",
      },
    });

    if (userAccount.role === "OWNER" && ownerCount === 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner from the account" },
        { status: 400 }
      );
    }

    // Delete the user account relationship
    await prisma.userAccount.delete({
      where: {
        userId_accountId: {
          userId: params.userId,
          accountId: params.id,
        },
      },
    });

    // If this user had their session set to this account, clear it
    const session = await prisma.session.findUnique({
      where: { userId: params.userId },
    });

    if (session && session.accountId === params.id) {
      // Try to switch to another account if available
      const otherAccount = await prisma.userAccount.findFirst({
        where: {
          userId: params.userId,
          accountId: { not: params.id },
        },
      });

      if (otherAccount) {
        await prisma.session.update({
          where: { userId: params.userId },
          data: { accountId: otherAccount.accountId },
        });
      } else {
        // No other account - delete the session
        await prisma.session.delete({
          where: { userId: params.userId },
        }).catch(() => {
          // Session might not exist, that's okay
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Access revoked for ${userAccount.user.email}`,
    });
  } catch (error) {
    console.error("Error revoking user access:", error);
    return NextResponse.json(
      { error: "Failed to revoke user access" },
      { status: 500 }
    );
  }
}
