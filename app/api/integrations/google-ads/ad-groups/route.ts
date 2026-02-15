import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/lib/account-utils";
import { getCurrentAccountId } from "@/lib/account-utils";
import { getCustomerInstance } from "@/lib/google-ads-auth";
import type { ReportOptions } from "google-ads-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google-ads/ad-groups?accountId=...&customerId=...&campaignId=... (optional)
 * customerId: Google Ads customer ID. campaignId: optional filter by campaign.
 * Returns list of ad groups (id, name, campaignId, status).
 */
export async function GET(request: NextRequest) {
  try {
    const accountId =
      request.nextUrl.searchParams.get("accountId") ||
      (await getCurrentAccountId(request));
    const customerId = request.nextUrl.searchParams.get("customerId");
    const campaignId = request.nextUrl.searchParams.get("campaignId");
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

    const reportOptions: ReportOptions = {
      entity: "ad_group",
      attributes: [
        "ad_group.id",
        "ad_group.name",
        "ad_group.status",
        "campaign.id",
      ],
      limit: 500,
    };
    if (campaignId) {
      reportOptions.constraints = { "campaign.id": campaignId };
    }
    const rows = await customer.report(reportOptions);

    const adGroups = rows.map((row) => ({
      id: row.ad_group?.id,
      name: row.ad_group?.name,
      status: row.ad_group?.status,
      campaignId: row.campaign?.id,
    }));

    return NextResponse.json({ adGroups });
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
