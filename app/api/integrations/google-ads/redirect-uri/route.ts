import { NextResponse } from "next/server";
import { getRedirectUri } from "@/lib/google-ads-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google-ads/redirect-uri
 * Returns the redirect URI this app uses for Google OAuth (for copying into Google Cloud Console).
 * Safe to call locally to fix redirect_uri_mismatch.
 */
export async function GET() {
  const redirectUri = getRedirectUri();
  return NextResponse.json({
    redirectUri: redirectUri || "(empty – set NEXTAUTH_URL in .env)",
    hint: "Add this exact value to Google Cloud Console → Credentials → your OAuth client → Authorized redirect URIs",
  });
}
