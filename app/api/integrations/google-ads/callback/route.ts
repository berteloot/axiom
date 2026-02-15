import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/lib/account-utils";
import { getRedirectUri } from "@/lib/google-ads-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_REDIRECT = "/dashboard/google-ads";

/**
 * GET /api/integrations/google-ads/callback?code=...&state=accountId
 * Exchanges code for tokens and stores connection. state must be accountId (validated).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const origin = process.env.NEXTAUTH_URL || request.nextUrl.origin;
  const redirectUrl = new URL(BASE_REDIRECT, origin);

  if (error) {
    redirectUrl.searchParams.set("error", "google_ads_denied");
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code || !state) {
    redirectUrl.searchParams.set("error", "missing_params");
    return NextResponse.redirect(redirectUrl.toString());
  }

  try {
    await requireAccountAccess(request, state);
  } catch (err) {
    redirectUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(redirectUrl.toString());
  }

  const redirectUri = getRedirectUri();
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    redirectUrl.searchParams.set("error", "server_config");
    return NextResponse.redirect(redirectUrl.toString());
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  let tokens: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    tokens = await tokenRes.json();
  } catch {
    redirectUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (tokens.error || !tokens.refresh_token) {
    redirectUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(redirectUrl.toString());
  }

  const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : 3600;
  const accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  try {
    await prisma.googleAdsConnection.upsert({
      where: { accountId: state },
      create: {
        accountId: state,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        accessTokenExpiresAt,
      },
      update: {
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        accessTokenExpiresAt,
      },
    });
  } catch {
    redirectUrl.searchParams.set("error", "save_failed");
    return NextResponse.redirect(redirectUrl.toString());
  }

  redirectUrl.searchParams.set("connected", "google_ads");
  return NextResponse.redirect(redirectUrl.toString());
}
