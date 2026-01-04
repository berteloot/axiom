import { NextRequest, NextResponse } from "next/server";

/**
 * DEPRECATED: This route is no longer used.
 * 
 * ALL file uploads now go directly to S3 via presigned URLs:
 * 1. Client requests presigned URL from /api/upload/presigned
 * 2. Client uploads directly to S3 using the presigned URL
 * 3. Client notifies /api/assets/process when upload is complete
 * 
 * This eliminates server-side file processing and prevents 502 timeouts.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  console.warn("[DEPRECATED] /api/upload route called - this should not happen. All uploads should use presigned URLs.");
  
  return NextResponse.json(
    { 
      error: "This upload endpoint is deprecated. Please refresh the page and try again.",
      code: "DEPRECATED_ENDPOINT",
      message: "File uploads now go directly to S3. Please refresh your browser to get the latest version of the app."
    },
    { status: 410 } // 410 Gone - resource no longer available
  );
}

export async function GET() {
  return NextResponse.json(
    { 
      error: "This upload endpoint is deprecated.",
      message: "All file uploads now go directly to S3 via presigned URLs."
    },
    { status: 410 }
  );
}
