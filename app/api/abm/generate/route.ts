import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import { z } from "zod";
import {
  runSkillsEnhancedABM,
  runABMViaMessagesApi,
} from "@/lib/abm/skills-enhanced";
import type { ABMBrief } from "@/lib/abm/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  companyName: z.string().min(1, "Target company name is required"),
  industry: z.string().optional(),
  targetRole: z.string().optional(),
  keyContacts: z.string().optional(),
  productOrService: z.string().min(1, "Your product/service is required"),
  valueProposition: z.string().min(1, "Value proposition is required"),
  brandVoice: z.string().optional(),
  additionalContext: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "ABM generation is not configured (missing ANTHROPIC_API_KEY)",
        },
        { status: 503 }
      );
    }

    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
    });
    const brandVoiceText = brandContext?.brandVoice?.length
      ? brandContext.brandVoice.join(", ")
      : data.brandVoice ?? undefined;

    const brief: ABMBrief = {
      companyName: data.companyName,
      industry: data.industry || undefined,
      targetRole: data.targetRole || undefined,
      keyContacts: data.keyContacts || undefined,
      productOrService: data.productOrService,
      valueProposition: data.valueProposition,
      brandVoice: brandVoiceText,
      additionalContext: data.additionalContext || undefined,
    };

    const skillId = process.env.ABM_SKILL_ID;

    let result;
    if (skillId) {
      try {
        const skillsResult = await runSkillsEnhancedABM(brief, apiKey, skillId);
        result = skillsResult;
      } catch (skillsErr) {
        const msg =
          skillsErr instanceof Error ? skillsErr.message : String(skillsErr);
        console.warn("[ABM] Skills-enhanced unavailable, falling back:", msg);
        result = await runABMViaMessagesApi(brief, apiKey);
      }
    } else {
      result = await runABMViaMessagesApi(brief, apiKey);
    }

    return NextResponse.json({
      success: true,
      result: result.result,
      agentProof: result.agentProof,
    });
  } catch (error) {
    console.error("ABM generate error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No account selected")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: "Failed to generate ABM content",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
