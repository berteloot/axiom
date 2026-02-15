/**
 * Google Ads integration – server-only.
 * Tokens are never returned to callers; all API access goes through this module.
 */

import { GoogleAdsApi } from "google-ads-api";
import { prisma } from "@/lib/prisma";

/** Must match exactly one "Authorized redirect URI" in Google Cloud Console (no trailing slash). */
function buildRedirectUri(): string {
  const raw = (process.env.NEXTAUTH_URL || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const origin = url.origin;
    return `${origin}/api/integrations/google-ads/callback`;
  } catch {
    const base = raw.replace(/\/$/, "");
    return `${base}/api/integrations/google-ads/callback`;
  }
}
const REDIRECT_URI = buildRedirectUri();

export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

/** Base URL for OAuth redirect (no trailing slash). */
export function getRedirectUri(): string {
  return REDIRECT_URI;
}

/** Build the Google OAuth authorization URL for "Connect Google Ads". */
export function getAuthorizationUrl(accountId: string): string {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_ADS_CLIENT_ID is not set");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_ADS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: accountId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Get connection row for an account. Internal use only – never expose tokens. */
export async function getConnection(accountId: string) {
  return prisma.googleAdsConnection.findUnique({
    where: { accountId },
  });
}

/** Public status for UI – no tokens. */
export async function getConnectionStatus(accountId: string): Promise<{
  connected: boolean;
  email?: string;
  googleAdsCustomerId?: string;
}> {
  const conn = await getConnection(accountId);
  if (!conn) return { connected: false };
  return {
    connected: true,
    email: conn.email ?? undefined,
    googleAdsCustomerId: conn.googleAdsCustomerId ?? undefined,
  };
}

function createClient(): GoogleAdsApi {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!clientId || !clientSecret || !developerToken) {
    throw new Error("Google Ads env (CLIENT_ID, CLIENT_SECRET, DEVELOPER_TOKEN) not set");
  }
  return new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });
}

/**
 * List Google Ads customer resource names accessible with this account's token.
 * Caller must have already verified access to accountId.
 */
export async function listAccessibleCustomers(
  accountId: string
): Promise<{ resourceNames: string[] }> {
  const conn = await getConnection(accountId);
  if (!conn) {
    throw new Error("Google Ads not connected for this account");
  }
  const client = createClient();
  const response = await client.listAccessibleCustomers(conn.refreshToken);
  const resourceNames =
    (response as { resource_names?: string[] }).resource_names ?? [];
  return { resourceNames };
}

/**
 * Get a Customer instance for running reports/queries.
 * customerId: Google Ads customer ID without dashes (e.g. "1234567890").
 * loginCustomerId: optional manager (MCC) customer ID when querying a child account.
 */
export async function getCustomerInstance(
  accountId: string,
  customerId: string,
  loginCustomerId?: string
) {
  const conn = await getConnection(accountId);
  if (!conn) return null;
  const client = createClient();
  const opts: { customer_id: string; refresh_token: string; login_customer_id?: string } = {
    customer_id: customerId.replace(/-/g, ""),
    refresh_token: conn.refreshToken,
  };
  if (loginCustomerId) {
    opts.login_customer_id = loginCustomerId.replace(/-/g, "");
  }
  return client.Customer(opts);
}
