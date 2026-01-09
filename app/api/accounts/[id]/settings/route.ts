import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSettingsSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  website: z.string().url().optional().or(z.literal("")),
  allowPublicSharing: z.boolean(),
  requireApproval: z.boolean(),
  maxFileSize: z.number().min(1).max(1000),
  retentionDays: z.number().min(1).max(3650),
  emailNotifications: z.boolean(),
  webhookUrl: z.string().url().optional().or(z.literal("")),
  apiRateLimit: z.number().min(1).max(10000),
  ppcLocationName: z.string().optional(),
  ppcLanguageName: z.string().optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const accountId = params.id;

    // Verify user has admin/owner permissions
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId: session.user.id,
          accountId,
        }
      }
    });

    if (!userAccount || !["OWNER", "ADMIN"].includes(userAccount.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only owners and admins can update settings." },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input
    const validationResult = updateSettingsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const settings = validationResult.data;

    // Update account settings
    const updatedAccount = await prisma.account.update({
      where: { id: accountId },
      data: {
        name: settings.name,
        description: settings.description || null,
        website: settings.website || null,
        allowPublicSharing: settings.allowPublicSharing,
        requireApproval: settings.requireApproval,
        maxFileSize: settings.maxFileSize,
        retentionDays: settings.retentionDays,
        emailNotifications: settings.emailNotifications,
        webhookUrl: settings.webhookUrl || null,
        apiRateLimit: settings.apiRateLimit,
        ppcLocationName: settings.ppcLocationName,
        ppcLanguageName: settings.ppcLanguageName,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        website: true,
        allowPublicSharing: true,
        requireApproval: true,
        maxFileSize: true,
        retentionDays: true,
        emailNotifications: true,
        webhookUrl: true,
        apiRateLimit: true,
        ppcLocationName: true,
        ppcLanguageName: true,
        updatedAt: true,
      }
    });

    return NextResponse.json({
      success: true,
      account: updatedAccount,
    });

  } catch (error) {
    console.error("Error updating account settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const accountId = params.id;

    // Verify user has access to this account
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
        { error: "Account not found or access denied" },
        { status: 404 }
      );
    }

    // Get account settings
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        website: true,
        allowPublicSharing: true,
        requireApproval: true,
        maxFileSize: true,
        retentionDays: true,
        emailNotifications: true,
        webhookUrl: true,
        apiRateLimit: true,
        ppcLocationName: true,
        ppcLanguageName: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ account });

  } catch (error) {
    console.error("Error fetching account settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}