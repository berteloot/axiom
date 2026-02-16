import { NextRequest, NextResponse } from "next/server";
import { requireAccountId } from "@/lib/account-utils";
import { z } from "zod";
import { runResearchForCompany } from "@/lib/signal-research/research-agent";
import type { ResearchOutput } from "@/lib/signal-research/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for batch research

const RequestSchema = z.object({
  companies: z.array(
    z.object({
      company: z.string().min(1),
      domain: z.string().optional(),
      industry: z.string().optional(),
    })
  ).min(1).max(15),
  researchPrompt: z.string().min(1, "Research focus is required"),
  industry: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAccountId(request);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Signal research requires ANTHROPIC_API_KEY (same as ABM/Ad Copy)" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { companies, researchPrompt, industry } = parsed.data;
    const results: ResearchOutput["companies"] = [];

    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];
      try {
        const research = await runResearchForCompany({
          company: c.company,
          companyDomain: c.domain,
          industry: c.industry ?? industry,
          researchPrompt,
        });
        results.push(research);
      } catch (err) {
        console.error(`[Signal Research] Failed for ${c.company}:`, err);
        results.push({
          company: c.company,
          industry: c.industry ?? industry,
          overallScore: 0,
          salesOpportunity: "Research failed",
          keyEvidence: err instanceof Error ? err.message : "Unknown error",
          signals: [],
        });
      }
    }

    const output: ResearchOutput = {
      researchFocus: researchPrompt,
      industry,
      companies: results,
    };

    return NextResponse.json({ success: true, output });
  } catch (error) {
    console.error("Signal research error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No account selected")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to run research", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
