import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/accounts/[id]/managers - List all account managers for an account
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params;
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
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
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or access denied" },
        { status: 404 }
      );
    }

    const managers = await prisma.accountManager.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      managers: managers.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching account managers:", error);
    return NextResponse.json(
      { error: "Failed to fetch account managers" },
      { status: 500 }
    );
  }
}

// POST /api/accounts/[id]/managers - Create a new account manager
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params;
    const userId = await getUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, email } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
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

    const manager = await prisma.accountManager.create({
      data: {
        accountId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
      },
    });

    return NextResponse.json({
      manager: {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        createdAt: manager.createdAt.toISOString(),
        updatedAt: manager.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating account manager:", error);
    return NextResponse.json(
      { error: "Failed to create account manager" },
      { status: 500 }
    );
  }
}
