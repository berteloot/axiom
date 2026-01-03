import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/accounts/switch - Switch to a different account
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { accountId } = body;

    if (!accountId || typeof accountId !== "string") {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this account
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId,
        },
      },
      include: {
        account: true,
      },
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Access denied to this account" },
        { status: 403 }
      );
    }

    // Update or create session
    const session = await prisma.session.upsert({
      where: { userId },
      create: {
        userId,
        accountId,
      },
      update: {
        accountId,
        updatedAt: new Date(),
      },
      include: {
        account: true,
      },
    });

    return NextResponse.json({
      account: {
        id: session.account.id,
        name: session.account.name,
        slug: session.account.slug,
        role: userAccount.role,
        createdAt: session.account.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error switching account:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = process.env.NODE_ENV === "development" 
      ? { message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
      : undefined;
    
    return NextResponse.json(
      { 
        error: "Failed to switch account",
        details: errorDetails
      },
      { status: 500 }
    );
  }
}
