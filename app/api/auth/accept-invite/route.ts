import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/accept-invite?token=xxx - Get invitation details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Find the invitation
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        },
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
      }
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invalid invitation token" },
        { status: 404 }
      );
    }

    // Check if expired
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invitation has expired", status: "EXPIRED" },
        { status: 400 }
      );
    }

    // Check if already used
    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { error: `Invitation has already been ${invitation.status.toLowerCase()}`, status: invitation.status },
        { status: 400 }
      );
    }

    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
      account: invitation.account,
      invitedBy: {
        name: invitation.invitedBy?.name || "Someone",
        email: invitation.invitedBy?.email,
      },
      expiresAt: invitation.expiresAt.toISOString(),
    });

  } catch (error) {
    console.error("Error fetching invitation:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitation details" },
      { status: 500 }
    );
  }
}

// POST /api/auth/accept-invite - Accept an invitation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Invitation token is required" },
        { status: 400 }
      );
    }

    // Find the invitation
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        account: true,
        invitedBy: true,
      }
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invalid or expired invitation token" },
        { status: 404 }
      );
    }

    // Check if invitation is still valid
    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { error: `Invitation has already been ${invitation.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" }
      });
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 400 }
      );
    }

    // Check if user is already a member
    const existingMembership = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId: invitation.accountId,
        }
      }
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: "You are already a member of this account" },
        { status: 409 }
      );
    }

    console.log(`[Accept Invite] Starting acceptance for user ${userId}`);
    console.log(`[Accept Invite] Target account: ${invitation.account.name} (${invitation.accountId})`);

    // Accept the invitation in a transaction
    await prisma.$transaction(async (tx) => {
      // Add user to the account
      console.log(`[Accept Invite] Creating userAccount...`);
      await tx.userAccount.create({
        data: {
          userId,
          accountId: invitation.accountId,
          role: invitation.role,
        }
      });

      // Mark invitation as accepted
      console.log(`[Accept Invite] Marking invitation as accepted...`);
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedById: userId,
          acceptedAt: new Date(),
        }
      });
    });

    // Update session OUTSIDE transaction to ensure it commits
    // This is critical: switch user to the invited account
    console.log(`[Accept Invite] Updating session to invited account...`);
    const updatedSession = await prisma.session.upsert({
      where: { userId },
      create: {
        userId,
        accountId: invitation.accountId,
      },
      update: {
        accountId: invitation.accountId,
      }
    });
    
    console.log(`[Accept Invite] ✅ Session updated to: ${updatedSession.accountId}`);
    console.log(`[Accept Invite] ✅ User ${userId} joined account ${invitation.account.name} (${invitation.accountId}) as ${invitation.role}`);

    return NextResponse.json({
      success: true,
      account: {
        id: invitation.account.id,
        name: invitation.account.name,
        slug: invitation.account.slug,
        role: invitation.role,
      }
    });

  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}