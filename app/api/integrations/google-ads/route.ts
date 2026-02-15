import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/lib/account-utils";
import { getCurrentAccountId } from "@/lib/account-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/integrations/google-ads?accountId=... (optional)
 * Removes the Google Ads connection for the account. Tokens are deleted.
 */
export async function DELETE(request: NextRequest) {
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
    await prisma.googleAdsConnection.deleteMany({
      where: { accountId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Not authenticated") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === "No access to this account") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to disconnect Google Ads" },
      { status: 500 }
    );
  }
}
