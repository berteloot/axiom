import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/lib/account-utils";
import { getCurrentAccountId } from "@/lib/account-utils";
import { listAccessibleCustomers } from "@/lib/google-ads-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google-ads/accounts?accountId=... (optional)
 * Lists Google Ads customer resource names accessible with the connected token.
 * Returns only resource names (e.g. customers/1234567890); no tokens.
 */
export async function GET(request: NextRequest) {
  try {
    const accountId =
      request.nextUrl.searchParams.get("accountId") ||
      (await getCurrentAccountId(request));
    if (!accountId) {
      return NextResponse.json(
        { error: "accountId required or no account selected" },
        { status: 400 }
      );
    }
    await requireAccountAccess(request, accountId);
    const { resourceNames } = await listAccessibleCustomers(accountId);
    return NextResponse.json({ resourceNames });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Not authenticated") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === "No access to this account") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === "Google Ads not connected for this account") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Google Ads request failed" },
      { status: 500 }
    );
  }
}
