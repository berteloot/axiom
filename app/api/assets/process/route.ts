import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getS3Url } from "@/lib/s3";
import { requireAccountId } from "@/lib/account-utils";
import { processAssetAsync } from "@/lib/services/asset-processor";
import { processAssetSchema } from "@/lib/validations";

// Ensure this route runs in Node.js runtime (required for Prisma)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    console.log("Processing asset request...");
    
    const body = await request.json();

    // Validate request body
    const validationResult = processAssetSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed",
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const { key, title, fileType } = validationResult.data;

    console.log("Request body:", { key, title, fileType });

    // Get the full S3 URL
    const s3Url = getS3Url(key);
    console.log("S3 URL:", s3Url);

    // Get current account ID
    const accountId = await requireAccountId(request);

    // Create asset record in database with PENDING status
    console.log("Creating asset in database...");
    console.log("Database URL present:", !!process.env.DATABASE_URL);
    
    let asset;
    try {
      asset = await prisma.asset.create({
        data: {
          accountId,
          title: title || key.split("/").pop() || "Untitled Asset",
          s3Url: s3Url,
          s3Key: key, // Store S3 key as source of truth
          fileType: fileType || "unknown",
          funnelStage: "TOFU_AWARENESS", // Default value
          icpTargets: [],
          painClusters: [],
          outreachTip: "",
          status: "PENDING",
        },
      });
      console.log("Asset created successfully:", asset.id);
    } catch (dbError: any) {
      console.error("Database create error:", dbError);
      const dbErrorMessage = dbError?.message || "Unknown database error";
      const dbErrorName = dbError?.name || "Unknown";
      const dbErrorCode = dbError?.code || "UNKNOWN";
      
      console.error("DB Error details:", { 
        dbErrorName, 
        dbErrorMessage, 
        dbErrorCode,
        meta: dbError?.meta 
      });
      
      // Check for common Prisma errors
      if (dbErrorCode === "P2001" || dbErrorMessage.includes("does not exist")) {
        throw new Error("Database table does not exist. Please run: npm run db:push");
      } else if (dbErrorCode === "P1001" || dbErrorMessage.includes("Can't reach database") || dbErrorMessage.includes("fetch failed")) {
        const isAccelerate = process.env.DATABASE_URL?.startsWith("prisma+");
        if (isAccelerate) {
          throw new Error("Cannot connect to Prisma Accelerate. Please check: 1) Your internet connection, 2) Prisma Accelerate service status, 3) Your API key in DATABASE_URL is valid");
        } else {
          throw new Error("Cannot connect to database. Please check your DATABASE_URL and ensure the database server is running.");
        }
      } else if (dbErrorCode === "P2002" || dbErrorMessage.includes("Unique constraint")) {
        throw new Error(`Database constraint error: ${dbErrorMessage}`);
      } else if (dbErrorCode === "P1010" || dbErrorMessage.includes("denied access") || dbErrorMessage.includes("permission")) {
        throw new Error("Database permission denied. Please check that your database user has INSERT, SELECT, UPDATE, and DELETE permissions on the 'assets' table and schema.");
      } else {
        throw new Error(`Database error (${dbErrorCode}): ${dbErrorMessage}`);
      }
    }

    // Process the asset asynchronously (don't block the response)
    // In production, consider using a job queue (Bull, BullMQ, etc.)
    processAssetAsync(asset.id, s3Url, fileType || "unknown").catch((error) => {
      console.error(`Error processing asset ${asset.id}:`, error);
    });

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        key: key,
        status: asset.status,
      },
      message: "Asset uploaded. Processing in background...",
    });
  } catch (error) {
    console.error("Error processing asset:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : "Unknown";
    
    console.error("Error details:", { 
      errorName,
      errorMessage, 
      errorStack,
      // Check for common Prisma errors
      isPrismaError: errorName.includes("Prisma") || errorMessage.includes("Prisma"),
      isDatabaseError: errorMessage.includes("database") || errorMessage.includes("connection"),
    });
    
    // Return detailed error in development
    return NextResponse.json(
      { 
        error: "Failed to process asset",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
        errorName: process.env.NODE_ENV === "development" ? errorName : undefined,
      },
      { status: 500 }
    );
  }
}
