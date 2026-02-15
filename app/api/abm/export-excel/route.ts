import { NextRequest, NextResponse } from "next/server";
import { requireAccountId } from "@/lib/account-utils";
import { buildABMExcel } from "@/lib/abm/export-excel";
import type { ABMResult } from "@/lib/abm/skills-enhanced";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResultSchema = z.object({
  accountBrief: z.object({
    companyOverview: z.string(),
    painPoints: z.array(z.string()),
    buyingSignals: z.array(z.string()),
    keyPersonas: z.array(z.string()),
  }),
  emailOutreach: z.object({
    subject: z.string(),
    body: z.string(),
  }),
  linkedInOutreach: z.object({
    connectionRequest: z.string(),
    followUpMessage: z.string(),
  }),
});

const RequestSchema = z.object({
  result: ResultSchema,
  companyName: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    await requireAccountId(request);
    const body = await request.json();

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { result, companyName } = parsed.data;
    const buffer = await buildABMExcel(result as ABMResult, companyName);

    const filename = `ABM_${companyName.replace(/\s+/g, "_")}_${Date.now()}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("ABM Excel export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No account selected")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: "Failed to export Excel",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
