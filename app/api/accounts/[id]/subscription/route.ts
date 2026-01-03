import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";
import { SubscriptionStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "berteloot@gmail.com";

// PATCH /api/accounts/[id]/subscription - Update subscription/trial status
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

    // Get current user to check if they're the admin
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser || currentUser.email !== ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, days } = body;

    // Validate action
    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "Action is required (extend_trial, activate, cancel)" },
        { status: 400 }
      );
    }

    // Get the account
    const account = await prisma.account.findUnique({
      where: { id: params.id },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    let updateData: {
      subscriptionStatus?: SubscriptionStatus;
      trialEndsAt?: Date;
      subscriptionEndsAt?: Date | null;
    } = {};

    switch (action) {
      case "extend_trial": {
        const extensionDays = days && typeof days === "number" ? days : 14;
        const currentTrialEnd = account.trialEndsAt || new Date();
        const newTrialEnd = new Date(currentTrialEnd);
        newTrialEnd.setDate(newTrialEnd.getDate() + extensionDays);

        updateData = {
          subscriptionStatus: "TRIAL",
          trialEndsAt: newTrialEnd,
        };
        break;
      }

      case "activate": {
        // Convert trial to active subscription
        // Set subscription end date to 1 year from now (or current date if trial hasn't ended)
        const subscriptionEnd = new Date();
        subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);

        updateData = {
          subscriptionStatus: "ACTIVE",
          subscriptionEndsAt: subscriptionEnd,
        };
        break;
      }

      case "cancel": {
        updateData = {
          subscriptionStatus: "CANCELLED",
          // Keep existing subscriptionEndsAt if active, otherwise leave as is
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: extend_trial, activate, or cancel" },
          { status: 400 }
        );
    }

    // Update the account
    const updatedAccount = await prisma.account.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      account: {
        id: updatedAccount.id,
        name: updatedAccount.name,
        subscriptionStatus: updatedAccount.subscriptionStatus,
        trialEndsAt: updatedAccount.trialEndsAt?.toISOString(),
        subscriptionEndsAt: updatedAccount.subscriptionEndsAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error updating subscription:", error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
