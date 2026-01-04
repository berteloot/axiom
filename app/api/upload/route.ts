import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { requireAccountId } from "@/lib/account-utils";
import { getAccountS3Prefix } from "@/lib/services/account-service";

// Ensure this route runs in Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

export async function POST(request: NextRequest) {
  try {
    // Get the file from the request
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

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

    // Generate a unique key for the file with account-specific prefix
    // Structure: accounts/{accountId}/uploads/{uuid}.{ext}
    // This ensures:
    // 1. Account isolation in S3
    // 2. Easier cleanup when account is deleted
    // 3. Better organization and access control
    const fileExtension = file.name.split(".").pop() || "";
    const accountPrefix = getAccountS3Prefix(accountId);
    const fileKey = `${accountPrefix}${uuidv4()}.${fileExtension}`;
    
    console.log(`Uploading file to S3 with account-specific path: ${fileKey}`);

    // Detect file type from extension if MIME type is missing
    let contentType = file.type;
    if (!contentType || contentType === "application/octet-stream") {
      const extension = fileExtension.toLowerCase();
      const mimeTypes: Record<string, string> = {
        // Documents
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        txt: "text/plain",
        csv: "text/csv",
        // Images
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        // Video (Audio-First analysis)
        mp4: "video/mp4",
        mov: "video/quicktime",
        avi: "video/x-msvideo",
        webm: "video/webm",
        mpeg: "video/mpeg",
        mpg: "video/mpeg",
        m4v: "video/x-m4v",
        // Audio
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        wav: "audio/wav",
        ogg: "audio/ogg",
        flac: "audio/flac",
      };
      contentType = mimeTypes[extension] || "application/octet-stream";
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3
    const putCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(putCommand);

    return NextResponse.json({
      success: true,
      key: fileKey,
      fileName: file.name,
      fileType: contentType,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Upload error details:", { errorMessage, stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(
      { 
        error: "Failed to upload file",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
