import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/lib/account-utils";
import { getCurrentAccountId } from "@/lib/account-utils";
import { getCustomerInstance } from "@/lib/google-ads-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extract a readable error string from Google Ads API or other thrown values. */
function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (Array.isArray(o.errors) && o.errors.length > 0) {
      const first = o.errors[0] as Record<string, unknown> | undefined;
      if (first && typeof first.message === "string") return first.message;
      if (first && typeof first.error_code === "object") return "Google Ads API error (check developer token and account access).";
    }
    try {
      const s = JSON.stringify(o);
      if (s.length <= 200) return s;
      return s.slice(0, 200) + "...";
    } catch {
      // ignore
    }
  }
  return String(e);
}

/**
 * GET /api/integrations/google-ads/campaigns?accountId=...&customerId=...&loginCustomerId=... (optional)&loginCandidateIds=... (optional)
 * customerId: Google Ads customer ID (with or without dashes).
 * loginCustomerId: optional manager (MCC) ID when the selected account is a child.
 * loginCandidateIds: optional comma-separated IDs to try as manager if first attempt fails.
 * Returns list of campaigns (id, name, status, type) for the connected account.
 */
async function fetchCampaignsForCustomer(
  accountId: string,
  customerId: string,
  loginCustomerId?: string
) {
  const customer = await getCustomerInstance(accountId, customerId, loginCustomerId);
  if (!customer) return null;
  const rows = await customer.report({
    entity: "campaign",
    attributes: [
      "campaign.id",
      "campaign.name",
      "campaign.status",
      "campaign.advertising_channel_type",
    ],
    limit: 500,
  });
  return rows.map((row: { campaign?: { id?: string; name?: string; status?: string; advertising_channel_type?: string } }) => ({
    id: row.campaign?.id,
    name: row.campaign?.name,
    status: row.campaign?.status,
    advertisingChannelType: row.campaign?.advertising_channel_type,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const accountId =
      request.nextUrl.searchParams.get("accountId") ||
      (await getCurrentAccountId(request));
    const customerId = request.nextUrl.searchParams.get("customerId");
    const loginCustomerId = request.nextUrl.searchParams.get("loginCustomerId") ?? undefined;
    const loginCandidateIds = request.nextUrl.searchParams.get("loginCandidateIds")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    if (!accountId) {
      return NextResponse.json(
        { error: "accountId required or no account selected" },
        { status: 400 }
      );
    }
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }
    await requireAccountAccess(request, accountId);

    const attempts: (string | undefined)[] = [undefined, loginCustomerId, ...loginCandidateIds].filter(
      (id, i, arr) => id === undefined || (id && arr.indexOf(id) === i)
    );
    let lastError: unknown = null;
    for (const loginId of attempts) {
      try {
        const campaigns = await fetchCampaignsForCustomer(accountId, customerId, loginId);
        if (campaigns) return NextResponse.json({ campaigns });
      } catch (e) {
        lastError = e;
      }
    }
    const message = lastError != null ? toErrorMessage(lastError) : "Google Ads request failed";
    return NextResponse.json(
      { error: message, campaigns: [] },
      { status: 500 }
    );
  } catch (err) {
    const message = toErrorMessage(err);
    if (message === "Not authenticated") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === "No access to this account") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json(
      { error: message, campaigns: [] },
      { status: 500 }
    );
  }
}
