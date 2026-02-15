import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/lib/account-utils";
import { getCurrentAccountId } from "@/lib/account-utils";
import { getCustomerInstance } from "@/lib/google-ads-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    let lastError: Error | null = null;
    for (const loginId of attempts) {
      try {
        const campaigns = await fetchCampaignsForCustomer(accountId, customerId, loginId);
        if (campaigns) return NextResponse.json({ campaigns });
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    const message = lastError?.message ?? "Google Ads request failed";
    return NextResponse.json(
      { error: message, campaigns: [] },
      { status: 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
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
