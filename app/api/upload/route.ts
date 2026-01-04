import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { v4 as uuidv4 } from "uuid";
import { requireAccountId } from "@/lib/account-utils";
import { getAccountS3Prefix } from "@/lib/services/account-service";
import { Readable } from "stream";

// Ensure this route runs in Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Increase max duration for large file uploads (Next.js 14+)
export const maxDuration = 300; // 5 minutes

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

if (!BUCKET_NAME) {
  console.warn("[UPLOAD] AWS_S3_BUCKET_NAME is not set");
}

// Threshold for using multipart upload (50MB for non-video files)
// Videos always use multipart upload regardless of size
const MULTIPART_THRESHOLD = 50 * 1024 * 1024;

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

    // SAFETY CHECK: Reject videos at this route - they should use presigned URLs
    // This prevents 502 timeouts from large video uploads
    const isVideo = contentType.startsWith("video/") || 
                    ["mp4", "mov", "avi", "webm", "mpeg", "mpg", "m4v", "mkv", "flv", "3gp"]
                      .includes(fileExtension.toLowerCase());
    
    if (isVideo) {
      console.error(`Video file ${file.name} attempted to use /api/upload route - this should use presigned URLs`);
      return NextResponse.json(
        { 
          error: "Video files must be uploaded using direct S3 upload. Please try again.",
          code: "VIDEO_MUST_USE_PRESIGNED"
        },
        { status: 400 }
      );
    }

    // Use the File size to avoid buffering the entire upload in memory
    const fileSize = typeof file.size === "number" ? file.size : 0;

    if (!BUCKET_NAME) {
      return NextResponse.json(
        { error: "Server misconfiguration: S3 bucket is not set" },
        { status: 500 }
      );
    }

    // Use multipart upload for large files (>50MB) - stream upload to avoid memory pressure
    // Note: Videos should never reach this point due to safety check above
    if (fileSize > MULTIPART_THRESHOLD) {
      console.log(`Using multipart upload for large file: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
      
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: BUCKET_NAME,
          Key: fileKey,
          Body: Readable.fromWeb(file.stream() as unknown as ReadableStream<any>),
          ContentType: contentType,
          ContentLength: fileSize,
        },
        // Multipart upload configuration
        partSize: 10 * 1024 * 1024, // 10MB parts
        leavePartsOnError: false, // Clean up on error
      });

      // Monitor upload progress
      upload.on("httpUploadProgress", (progress) => {
        if (progress.loaded && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          console.log(`Upload progress: ${percent}% (${(progress.loaded / 1024 / 1024).toFixed(2)} MB / ${(progress.total / 1024 / 1024).toFixed(2)} MB)`);
        }
      });

      await upload.done();
    } else {
      // Use simple upload for smaller files
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: Readable.fromWeb(file.stream() as unknown as ReadableStream<any>),
        ContentType: contentType,
        ContentLength: fileSize,
      });

      await s3Client.send(putCommand);
    }

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
