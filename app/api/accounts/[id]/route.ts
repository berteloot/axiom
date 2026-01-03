import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, requireAccountId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/accounts/[id] - Update an account
export async function PATCH(
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

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Account name is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this account (must be OWNER or ADMIN to edit)
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId: params.id,
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
        { error: "Only OWNER or ADMIN can edit accounts" },
        { status: 403 }
      );
    }

    // Generate new slug from name
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Check if slug is unique (excluding current account)
    const existingAccount = await prisma.account.findFirst({
      where: {
        slug,
        id: { not: params.id },
      },
    });

    let finalSlug = slug;
    if (existingAccount) {
      // Append timestamp if slug exists
      finalSlug = `${slug}-${Date.now()}`;
    }

    // Update the account
    const account = await prisma.account.update({
      where: { id: params.id },
      data: {
        name: name.trim(),
        slug: finalSlug,
      },
    });

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        role: userAccount.role,
        createdAt: account.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}

// DELETE /api/accounts/[id] - Delete an account
export async function DELETE(
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

    // Verify user has access to this account (must be OWNER to delete)
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId: params.id,
        },
      },
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or access denied" },
        { status: 404 }
      );
    }

    if (userAccount.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only OWNER can delete accounts" },
        { status: 403 }
      );
    }

    // Check if this is the current account - if so, switch to another account first
    const currentAccountId = await requireAccountId(request).catch(() => null);
    if (currentAccountId === params.id) {
      // Find another account for this user
      const otherAccount = await prisma.userAccount.findFirst({
        where: {
          userId,
          accountId: { not: params.id },
        },
        include: {
          account: true,
        },
      });

      if (otherAccount) {
        // Switch to the other account
        await prisma.session.upsert({
          where: { userId },
          create: {
            userId,
            accountId: otherAccount.accountId,
          },
          update: {
            accountId: otherAccount.accountId,
            updatedAt: new Date(),
          },
        });
      } else {
        // No other account - delete the session
        await prisma.session.delete({
          where: { userId },
        }).catch(() => {
          // Session might not exist, that's okay
        });
      }
    }

    // Note: S3 cleanup is handled automatically via cascade deletes:
    // - When assets are deleted (via cascade), their S3 files are deleted in asset DELETE route
    // - Files are organized by account prefix: accounts/{accountId}/uploads/
    // - This ensures proper cleanup when account is deleted
    
    // Delete the account (cascade will handle related records in database)
    // S3 files are cleaned up when individual assets are deleted via cascade
    await prisma.account.delete({
      where: { id: params.id },
    });

    console.log(`Account ${params.id} deleted successfully (S3 cleanup handled by asset cascade)`);

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
