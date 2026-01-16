import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl } from "@/lib/s3";
import { v4 as uuidv4 } from "uuid";
import { presignedUploadSchema } from "@/lib/validations";
import { requireAccountId } from "@/lib/account-utils";
import { getAccountS3Prefix } from "@/lib/services/account-service";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 1 minute should be plenty for generating a presigned URL

export async function POST(request: NextRequest) {
  try {
    // Get current account ID for S3 organization
    let accountId: string;
    try {
      accountId = await requireAccountId(request);
    } catch (accountError) {
      console.error("Account ID required for upload:", accountError);
      return NextResponse.json(
        { error: "No account selected. Please select an account first." },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validationResult = presignedUploadSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed",
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const { fileName, fileType, fileSize } = validationResult.data;

    // Validate file size against account's maxFileSize setting
    if (fileSize !== undefined) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { maxFileSize: true },
      });

      const maxFileSizeMB = account?.maxFileSize || 100; // Default to 100MB
      const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
      const fileSizeMB = fileSize / (1024 * 1024);

      if (fileSize > maxFileSizeBytes) {
        return NextResponse.json(
          {
            error: `File size (${fileSizeMB.toFixed(2)}MB) exceeds the maximum allowed size of ${maxFileSizeMB}MB. Please compress the file or contact your administrator.`,
          },
          { status: 400 }
        );
      }
    }

    // Generate a unique key for the file with account-specific prefix
    // Structure: accounts/{accountId}/uploads/{uuid}.{ext}
    const fileExtension = fileName.split(".").pop() || "";
    const accountPrefix = getAccountS3Prefix(accountId);
    const fileKey = `${accountPrefix}${uuidv4()}.${fileExtension}`;

    // Generate presigned URL
    const presignedUrl = await getPresignedUploadUrl(
      fileKey,
      fileType,
      3600 // 1 hour expiration
    );

    return NextResponse.json({
      url: presignedUrl,
      key: fileKey,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { 
        error: "Failed to generate presigned URL",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
