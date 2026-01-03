import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
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
        { error: "Insufficient permissions. Only owners and admins can export data." },
        { status: 403 }
      );
    }

    // Get account information
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        website: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Get all assets for the account
    const assets = await prisma.asset.findMany({
      where: { accountId },
      select: {
        id: true,
        title: true,
        s3Url: true,
        s3Key: true,
        fileType: true,
        extractedText: true,
        funnelStage: true,
        icpTargets: true,
        painClusters: true,
        outreachTip: true,
        status: true,
        contentQualityScore: true,
        expiryDate: true,
        aiModel: true,
        promptVersion: true,
        analyzedAt: true,
        aiConfidence: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Get all users in the account
    const userAccounts = await prisma.userAccount.findMany({
      where: { accountId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          }
        }
      }
    });

    // Get collections
    const collections = await prisma.collection.findMany({
      where: { accountId },
      select: {
        id: true,
        name: true,
        description: true,
        slug: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Get brand context if exists
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
      select: {
        id: true,
        brandVoice: true,
        competitors: true,
        targetIndustries: true,
        websiteUrl: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Prepare export data
    const exportData = {
      exportDate: new Date().toISOString(),
      account: account,
      users: userAccounts.map(ua => ({
        id: ua.user.id,
        email: ua.user.email,
        name: ua.user.name,
        role: ua.role,
        joinedAt: ua.createdAt,
        userCreatedAt: ua.user.createdAt,
      })),
      assets: assets,
      collections: collections,
      brandContext: brandContext,
      summary: {
        totalUsers: userAccounts.length,
        totalAssets: assets.length,
        totalCollections: collections.length,
        exportFormat: "JSON",
        version: "1.0",
      }
    };

    // Convert to JSON and return as downloadable file
    const jsonString = JSON.stringify(exportData, null, 2);

    return new NextResponse(jsonString, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${account?.slug || 'organization'}-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });

  } catch (error) {
    console.error("Error exporting account data:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}