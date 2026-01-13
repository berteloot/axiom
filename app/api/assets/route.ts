import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";

// Ensure this route runs in Node.js runtime (required for Prisma)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);

    const assets = await prisma.asset.findMany({
      where: {
        accountId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        productLines: {
          include: {
            productLine: {
              select: {
                id: true,
                name: true,
                description: true,
                valueProposition: true,
                specificICP: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Transform to match the expected format (flatten productLines)
    const transformedAssets = assets.map(asset => ({
      ...asset,
      productLines: asset.productLines.map(ap => ap.productLine),
    }));

    return NextResponse.json({ assets: transformedAssets });
  } catch (error) {
    console.error("Error fetching assets:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorCode = (error as any)?.code || "";
    
    // Check if it's a missing column error (common Prisma/PostgreSQL error codes)
    const isMissingColumnError = 
      errorMessage.includes("column") && 
      (errorMessage.includes("does not exist") || errorMessage.includes("uploadedByNameOverride")) ||
      errorCode === "P2021" || // Table does not exist
      errorCode === "P2025"; // Record not found (sometimes used for schema issues)
    
    if (errorMessage.includes("No account selected")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
    
    // If it's a missing column error, provide helpful message
    if (isMissingColumnError) {
      console.error("Database migration required: 'uploadedByNameOverride' column missing. Run migration script.");
      return NextResponse.json(
        { 
          error: "Database migration required",
          details: "The 'uploadedByNameOverride' column is missing. Please run the migration script: prisma/manual-migrations/add-upload-tracking.sql",
          code: "MIGRATION_REQUIRED"
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to fetch assets",
        details: errorMessage,
        ...(isMissingColumnError && { code: "SCHEMA_ERROR" })
      },
      { status: 500 }
    );
  }
}
