import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/lib/account-utils";
import { getCurrentAccountId } from "@/lib/account-utils";
import { getConnectionStatus } from "@/lib/google-ads-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google-ads/status?accountId=... (optional; defaults to current account)
 * Returns connection status only. No tokens.
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
    const status = await getConnectionStatus(accountId);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Not authenticated") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === "No access to this account") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to get Google Ads status" },
      { status: 500 }
    );
  }
}
