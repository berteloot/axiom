import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/accounts/current - Get the currently selected account for the user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    // Return 401 if user is not authenticated (consistent with /api/accounts)
    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get the current session (which tracks the selected account)
    const session = await prisma.session.findUnique({
      where: { userId },
      include: {
        account: true,
      },
    });

    if (!session || !session.account) {
      return NextResponse.json(
        { error: "No account selected" },
        { status: 404 }
      );
    }

    // Get user's role in this account
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId: session.accountId,
        },
      },
    });

    return NextResponse.json({
      account: {
        id: session.account.id,
        name: session.account.name,
        slug: session.account.slug,
        role: userAccount?.role || "MEMBER",
        description: session.account.description,
        website: session.account.website,
        subscriptionStatus: session.account.subscriptionStatus,
        trialEndsAt: session.account.trialEndsAt?.toISOString(),
        subscriptionEndsAt: session.account.subscriptionEndsAt?.toISOString(),
        allowPublicSharing: session.account.allowPublicSharing,
        requireApproval: session.account.requireApproval,
        maxFileSize: session.account.maxFileSize,
        retentionDays: session.account.retentionDays,
        emailNotifications: session.account.emailNotifications,
        webhookUrl: session.account.webhookUrl,
        apiRateLimit: session.account.apiRateLimit,
        createdAt: session.account.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching current account:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = process.env.NODE_ENV === "development" 
      ? { message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
      : undefined;
    
    return NextResponse.json(
      { 
        error: "Failed to fetch current account",
        details: errorDetails
      },
      { status: 500 }
    );
  }
}
