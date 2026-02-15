import { NextRequest, NextResponse } from "next/server";
import { requireAccountId } from "@/lib/account-utils";
import { buildResearchExcel } from "@/lib/signal-research/export-excel";
import type { ResearchOutput } from "@/lib/signal-research/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OutputSchema = z.object({
  researchFocus: z.string(),
  industry: z.string().optional(),
  companies: z.array(z.any()),
});

const RequestSchema = z.object({
  output: OutputSchema,
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

    const buffer = await buildResearchExcel(parsed.data.output as ResearchOutput);
    const filename = `Signal_Research_${Date.now()}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Signal research Excel export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No account selected")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to export Excel", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
