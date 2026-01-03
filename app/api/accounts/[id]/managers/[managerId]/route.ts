import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/accounts/[id]/managers/[managerId] - Update an account manager
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; managerId: string }> }
) {
  try {
    const { id: accountId, managerId } = await params;
    const userId = await getUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, email } = body;

    // Verify user has access to this account (must be OWNER or ADMIN)
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId,
        },
      },
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or access denied" },
        { status: 404 }
      );
    }

    if (userAccount.role !== "OWNER" && userAccount.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only OWNER or ADMIN can manage account managers" },
        { status: 403 }
      );
    }

    // Verify the manager belongs to this account
    const manager = await prisma.accountManager.findFirst({
      where: {
        id: managerId,
        accountId,
      },
    });

    if (!manager) {
      return NextResponse.json(
        { error: "Account manager not found" },
        { status: 404 }
      );
    }

    const updateData: { name?: string; email?: string } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Name cannot be empty" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (email !== undefined) {
      if (typeof email !== "string" || email.trim().length === 0) {
        return NextResponse.json(
          { error: "Email cannot be empty" },
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
      updateData.email = email.trim().toLowerCase();
    }

    const updatedManager = await prisma.accountManager.update({
      where: { id: managerId },
      data: updateData,
    });

    return NextResponse.json({
      manager: {
        id: updatedManager.id,
        name: updatedManager.name,
        email: updatedManager.email,
        createdAt: updatedManager.createdAt.toISOString(),
        updatedAt: updatedManager.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error updating account manager:", error);
    return NextResponse.json(
      { error: "Failed to update account manager" },
      { status: 500 }
    );
  }
}

// DELETE /api/accounts/[id]/managers/[managerId] - Delete an account manager
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; managerId: string }> }
) {
  try {
    const { id: accountId, managerId } = await params;
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    // Verify user has access to this account (must be OWNER or ADMIN)
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId,
        },
      },
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or access denied" },
        { status: 404 }
      );
    }

    if (userAccount.role !== "OWNER" && userAccount.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only OWNER or ADMIN can manage account managers" },
        { status: 403 }
      );
    }

    // Verify the manager belongs to this account
    const manager = await prisma.accountManager.findFirst({
      where: {
        id: managerId,
        accountId,
      },
    });

    if (!manager) {
      return NextResponse.json(
        { error: "Account manager not found" },
        { status: 404 }
      );
    }

    await prisma.accountManager.delete({
      where: { id: managerId },
    });

    return NextResponse.json({
      success: true,
      message: "Account manager deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting account manager:", error);
    return NextResponse.json(
      { error: "Failed to delete account manager" },
      { status: 500 }
    );
  }
}
