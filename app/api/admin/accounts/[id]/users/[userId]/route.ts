import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "berteloot@gmail.com";

// PATCH /api/admin/accounts/[id]/users/[userId] - Update user role in an account (super admin only)
export async function PATCH(
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

    const body = await request.json();
    const { role } = body;

    // Validate role
    if (!role || !["OWNER", "ADMIN", "MEMBER"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be OWNER, ADMIN, or MEMBER." },
        { status: 400 }
      );
    }

    // Check if trying to change the last owner to a different role
    if (userAccount.role === "OWNER" && role !== "OWNER") {
      const ownerCount = await prisma.userAccount.count({
        where: {
          accountId: params.id,
          role: "OWNER",
        },
      });

      if (ownerCount === 1) {
        return NextResponse.json(
          { error: "Cannot change the last owner's role. There must be at least one owner." },
          { status: 400 }
        );
      }
    }

    // Update the role
    const updatedUserAccount = await prisma.userAccount.update({
      where: {
        userId_accountId: {
          userId: params.userId,
          accountId: params.id,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      data: { role: role as "OWNER" | "ADMIN" | "MEMBER" },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUserAccount.user.id,
        email: updatedUserAccount.user.email,
        name: updatedUserAccount.user.name,
        role: updatedUserAccount.role,
      },
      message: `User role updated to ${role}`,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    return NextResponse.json(
      { error: "Failed to update user role" },
      { status: 500 }
    );
  }
}
