import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isUserAdminOrOwner } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/accounts/[id]/members/[memberId] - Update team member details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: accountId, memberId } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify user has permission (admin/owner only)
    const hasPermission = await isUserAdminOrOwner(request);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only admins and owners can manage team members." },
        { status: 403 }
      );
    }

    // Verify the account exists and user is a member
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId: session.user.id,
          accountId,
        }
      }
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or you don't have access to it." },
        { status: 404 }
      );
    }

    // Verify the member exists and belongs to this account
    // memberId is the UserAccount ID
    const memberAccount = await prisma.userAccount.findUnique({
      where: {
        id: memberId,
      },
      include: {
        user: true,
        account: true
      }
    });

    if (!memberAccount) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    // Verify the member belongs to the correct account
    if (memberAccount.accountId !== accountId) {
      return NextResponse.json(
        { error: "Team member does not belong to this account" },
        { status: 403 }
      );
    }

    // Cannot edit OWNER role
    if (memberAccount.role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot modify the account owner" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email, role } = body;

    const updateData: { name?: string | null; email?: string } = {};

    // Update name if provided
    if (name !== undefined) {
      // Allow clearing name (null) since `User.name` is optional
      if (name === null) {
        updateData.name = null;
      } else if (typeof name === "string") {
        const trimmed = name.trim();
        updateData.name = trimmed.length > 0 ? trimmed : null;
      } else {
        return NextResponse.json(
          { error: "Invalid name" },
          { status: 400 }
        );
      }
    }

    // Update email if provided
    if (email !== undefined) {
      if (typeof email !== "string" || !email.includes("@")) {
        return NextResponse.json(
          { error: "Invalid email address" },
          { status: 400 }
        );
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }

      // Check if email is already taken by another user
      const existingUser = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() }
      });

      if (existingUser && existingUser.id !== memberAccount.userId) {
        return NextResponse.json(
          { error: "Email address is already in use by another user" },
          { status: 409 }
        );
      }

      updateData.email = email.trim().toLowerCase();
    }

    // Validate role change intent BEFORE starting transaction
    if (role !== undefined) {
      if (!["MEMBER", "ADMIN"].includes(role)) {
        return NextResponse.json(
          { error: "Invalid role. Must be MEMBER or ADMIN." },
          { status: 400 }
        );
      }

      // Only OWNER can change roles
      if (userAccount.role !== "OWNER") {
        return NextResponse.json(
          { error: "Only account owners can change member roles" },
          { status: 403 }
        );
      }
    }

    // Update everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update role if provided (only OWNER can change roles, and cannot change to/from OWNER)
      if (role !== undefined) {
        await tx.userAccount.update({
          where: { id: memberId },
          data: { role: role as "MEMBER" | "ADMIN" }
        });
      }

      // Update user details if name or email changed
      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id: memberAccount.userId },
          data: updateData
        });
      }

      // Get updated member data
      const updatedMember = await tx.userAccount.findUnique({
        where: { id: memberId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            }
          }
        }
      });

      return updatedMember;
    });

    return NextResponse.json({
      success: true,
      member: {
        id: result!.id, // UserAccount ID
        userId: result!.user.id, // User ID
        email: result!.user.email,
        name: result!.user.name,
        role: result!.role,
      },
      message: "Team member updated successfully"
    });

  } catch (error: any) {
    console.error("Error updating team member:", error);
    return NextResponse.json(
      { 
        error: "Failed to update team member",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// DELETE /api/accounts/[id]/members/[memberId] - Remove team member from account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: accountId, memberId } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify user has permission (admin/owner only)
    const hasPermission = await isUserAdminOrOwner(request);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only admins and owners can manage team members." },
        { status: 403 }
      );
    }

    // Verify the account exists and user is a member
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId: session.user.id,
          accountId,
        }
      }
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or you don't have access to it." },
        { status: 404 }
      );
    }

    // Verify the member exists and belongs to this account
    // memberId is the UserAccount ID
    const memberAccount = await prisma.userAccount.findUnique({
      where: {
        id: memberId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        },
        account: true
      }
    });

    if (!memberAccount) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    // Verify the member belongs to the correct account
    if (memberAccount.accountId !== accountId) {
      return NextResponse.json(
        { error: "Team member does not belong to this account" },
        { status: 403 }
      );
    }

    // Prevent deleting OWNER members
    if (memberAccount.role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot remove account owners. Transfer ownership first or delete the account." },
        { status: 403 }
      );
    }

    // Cannot delete yourself
    if (memberAccount.userId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the account. Ask another admin or owner to remove you." },
        { status: 400 }
      );
    }

    // Delete the user account relationship and handle session cleanup in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete the user account relationship
      await tx.userAccount.delete({
        where: { id: memberId },
      });

      // If this user had their session set to this account, update it
      const session = await tx.session.findUnique({
        where: { userId: memberAccount.userId },
      });

      if (session && session.accountId === accountId) {
        // Try to switch to another account if available
        const otherAccount = await tx.userAccount.findFirst({
          where: {
            userId: memberAccount.userId,
            accountId: { not: accountId },
          },
        });

        if (otherAccount) {
          await tx.session.update({
            where: { userId: memberAccount.userId },
            data: { accountId: otherAccount.accountId },
          });
        } else {
          // No other account - delete the session
          await tx.session.delete({
            where: { userId: memberAccount.userId },
          }).catch(() => {
            // Session might not exist, that's okay
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Team member ${memberAccount.user.email} has been removed from the account`,
    });

  } catch (error: any) {
    console.error("Error removing team member:", error);
    return NextResponse.json(
      { 
        error: "Failed to remove team member",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
