import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/auth/config - Diagnostic endpoint to check NextAuth configuration
export async function GET(request: NextRequest) {
  // Only in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || 
                 request.headers.get("origin") || 
                 `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  return NextResponse.json({
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "❌ Not set",
    detectedBaseUrl: baseUrl,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "✅ Set" : "❌ Not set",
    sendGrid: {
      apiKey: process.env.SENDGRID_API_KEY ? "✅ Set" : "❌ Not set",
      fromEmail: process.env.FROM_EMAIL || process.env.EMAIL_FROM || "❌ Not set (required)",
      from: process.env.FROM_EMAIL || process.env.EMAIL_FROM || "❌ Not set (required)",
      status: !(process.env.FROM_EMAIL || process.env.EMAIL_FROM)
        ? "❌ FROM_EMAIL not set - emails will fail"
        : process.env.SENDGRID_API_KEY 
          ? "Configured - emails will be sent via SendGrid"
          : process.env.NODE_ENV === "development"
            ? "SendGrid not configured - URLs logged to console (DEV MODE)"
            : "❌ SendGrid not configured - emails will fail in production",
    },
    origin: request.headers.get("origin"),
    host: request.nextUrl.host,
    protocol: request.nextUrl.protocol,
  });
}