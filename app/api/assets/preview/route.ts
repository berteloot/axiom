import { NextRequest, NextResponse } from "next/server";
import { getPresignedDownloadUrl, extractKeyFromS3Url } from "@/lib/s3";

// Ensure this route runs in Node.js runtime (required for S3 operations)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let s3Url: string | undefined;
  
  try {
    const body = await request.json();
    s3Url = body.s3Url;

    if (!s3Url) {
      return NextResponse.json(
        { error: "s3Url is required" },
        { status: 400 }
      );
    }

    // Extract key from S3 URL
    const key = extractKeyFromS3Url(s3Url);
    
    // If we can't extract a key, return the original URL
    if (!key) {
      return NextResponse.json({ url: s3Url });
    }

    // Generate presigned download URL
    const presignedUrl = await getPresignedDownloadUrl(key, 3600);

    return NextResponse.json({ url: presignedUrl });
  } catch (error) {
    console.error("Error generating preview URL:", error);
    // Fallback to original URL if presigned URL generation fails
    return NextResponse.json({ url: s3Url || "" });
  }
}
