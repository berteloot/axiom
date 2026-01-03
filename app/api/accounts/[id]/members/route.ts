import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isUserAdminOrOwner } from "@/lib/account-utils";

export const runtime = "nodejs";

// GET /api/accounts/[id]/members - List all members of an account
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify user has permission to view members (admin/owner only)
    const hasPermission = await isUserAdminOrOwner(request);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only admins and owners can view team members." },
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

    // Get all members of this account
    const members = await prisma.userAccount.findMany({
      where: {
        accountId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    const formattedMembers = members.map((member) => ({
      id: member.id, // UserAccount ID (needed for updates)
      userId: member.user.id, // User ID
      email: member.user.email,
      name: member.user.name,
      role: member.role,
      createdAt: member.createdAt.toISOString(),
    }));

    return NextResponse.json({ members: formattedMembers });

  } catch (error) {
    console.error("Error fetching members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}
