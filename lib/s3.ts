import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// IMPORTANT:
// - Do NOT pass empty credentials to the AWS SDK.
// - If you omit `credentials`, the SDK will use the default credential chain (including env vars).
const s3Client = new S3Client({
  region: AWS_REGION,
  ...(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";
if (!BUCKET_NAME) {
  console.warn("[S3] AWS_S3_BUCKET_NAME is not set");
}
if (!process.env.AWS_REGION) {
  console.warn("[S3] AWS_REGION is not set; defaulting to us-east-1");
}
if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.warn("[S3] AWS credentials are not fully set (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)");
}

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
  if (!BUCKET_NAME) {
    throw new Error("AWS_S3_BUCKET_NAME is not set");
  }

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
  if (!BUCKET_NAME) {
    throw new Error("AWS_S3_BUCKET_NAME is not set");
  }

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
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, "/");
  return `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${encodedKey}`;
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
  if (!BUCKET_NAME) {
    throw new Error("AWS_S3_BUCKET_NAME is not set");
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}
