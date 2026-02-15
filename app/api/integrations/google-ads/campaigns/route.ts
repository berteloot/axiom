import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/lib/account-utils";
import { getCurrentAccountId } from "@/lib/account-utils";
import { getCustomerInstance } from "@/lib/google-ads-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google-ads/campaigns?accountId=...&customerId=...
 * customerId: Google Ads customer ID (with or without dashes).
 * Returns list of campaigns (id, name, status, type) for the connected account.
 */
export async function GET(request: NextRequest) {
  try {
    const accountId =
      request.nextUrl.searchParams.get("accountId") ||
      (await getCurrentAccountId(request));
    const customerId = request.nextUrl.searchParams.get("customerId");
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
    const customer = await getCustomerInstance(accountId, customerId);
    if (!customer) {
      return NextResponse.json(
        { error: "Google Ads not connected for this account" },
        { status: 404 }
      );
    }

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

    const campaigns = rows.map((row) => ({
      id: row.campaign?.id,
      name: row.campaign?.name,
      status: row.campaign?.status,
      advertisingChannelType: row.campaign?.advertising_channel_type,
    }));

    return NextResponse.json({ campaigns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Not authenticated") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === "No access to this account") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Google Ads request failed" },
      { status: 500 }
    );
  }
}
