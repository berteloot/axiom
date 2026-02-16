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
  ).min(1).max(8),
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

    const DELAY_MS = 4000; // 4s between companies to avoid Anthropic rate limit (30k input tokens/min)
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];
      try {
        let research;
        try {
          research = await runResearchForCompany({
            company: c.company,
            companyDomain: c.domain,
            industry: c.industry ?? industry,
            researchPrompt,
          });
        } catch (rateErr: unknown) {
          const status = (rateErr as { status?: number }).status;
          const retryAfter = (rateErr as { headers?: Headers }).headers?.get?.("retry-after");
          if (status === 429 && retryAfter) {
            const waitMs = Math.min(parseInt(retryAfter, 10) * 1000, 120_000);
            console.warn(`[Signal Research] Rate limited, waiting ${waitMs}ms before retry for ${c.company}`);
            await sleep(waitMs);
            research = await runResearchForCompany({
              company: c.company,
              companyDomain: c.domain,
              industry: c.industry ?? industry,
              researchPrompt,
            });
          } else {
            throw rateErr;
          }
        }
        results.push(research);
      } catch (err) {
        console.error(`[Signal Research] Failed for ${c.company}:`, err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        const isRateLimit = typeof msg === "string" && (msg.includes("rate_limit") || msg.includes("429"));
        results.push({
          company: c.company,
          industry: c.industry ?? industry,
          overallScore: 0,
          salesOpportunity: isRateLimit ? "Rate limited – try fewer companies or wait a minute" : "Research failed",
          keyEvidence: msg,
          signals: [],
        });
      }
      if (i < companies.length - 1) await sleep(DELAY_MS);
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
