import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractKeyFromS3Url, getPresignedDownloadUrl } from "@/lib/s3";
import { requireAccountId } from "@/lib/account-utils";

// Ensure this route runs in Node.js runtime (required for Prisma)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO: Implement proper authentication
function isAuthenticated(request: NextRequest): boolean {
  return true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isAuthenticated(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const accountId = await requireAccountId(request);

    // Get the asset and verify it belongs to the current account
    const asset = await prisma.asset.findFirst({
      where: {
        id: params.id,
        accountId,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    // Use stored s3Key, fallback to extracting from s3Url for backwards compatibility
    const key = (asset as any).s3Key || extractKeyFromS3Url(asset.s3Url);
    if (!key) {
      return NextResponse.json(
        { error: "Invalid S3 key or URL" },
        { status: 400 }
      );
    }

    // Generate presigned URL (valid for 1 hour)
    const downloadUrl = await getPresignedDownloadUrl(key, 3600);

    return NextResponse.json({ 
      downloadUrl,
      fileName: asset.title,
      fileType: asset.fileType,
    });
  } catch (error) {
    console.error("Error generating download URL:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
