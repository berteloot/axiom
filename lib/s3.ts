import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

/**
 * Generate a presigned URL for uploading a file to S3
 * @param key - The S3 object key (file path)
 * @param contentType - The content type of the file
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Presigned URL for uploading
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading/viewing a file from S3
 * @param key - The S3 object key (file path)
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Presigned URL for downloading/viewing
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get the full S3 URL for a given key
 * @param key - The S3 object key (file path)
 * @returns Full S3 URL
 */
export function getS3Url(key: string): string {
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
}

/**
 * Extract the S3 key from a full S3 URL
 * @param s3Url - The full S3 URL
 * @returns The S3 key, or null if extraction fails
 */
export function extractKeyFromS3Url(s3Url: string): string | null {
  try {
    const url = new URL(s3Url);
    // Remove leading slash from pathname
    const key = url.pathname.substring(1);
    
    if (key && key.length > 0) {
      return key;
    }
    
    // Try to extract from search params (for presigned URLs)
    return url.searchParams.get("key") || null;
  } catch {
    // If it's not a full URL, assume it's already a key
    return s3Url;
  }
}

/**
 * Delete a file from S3
 * @param key - The S3 object key (file path)
 * @returns Promise that resolves when the file is deleted
 */
export async function deleteS3Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}
