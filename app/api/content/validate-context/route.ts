import { NextRequest, NextResponse } from "next/server";
import { requireAccountId } from "@/lib/account-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ValidateContextRequestSchema = z.object({
  gap: z.object({
    icp: z.string(),
    stage: z.enum(["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"]),
    painCluster: z.string().optional(),
    productLineId: z.string().optional(),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();
    const validationResult = ValidateContextRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { gap } = validationResult.data;

    // Fetch brand context
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
    });

    const missingCritical: string[] = [];
    const missingOptional: string[] = [];
    const suggestions: Array<{ field: string; message: string; required: boolean }> = [];

    // CRITICAL: Industry is required for relevant search
    if (!brandContext?.targetIndustries || brandContext.targetIndustries.length === 0) {
      missingCritical.push("Target Industry");
      suggestions.push({
        field: "Target Industry",
        message: "What industry does your company operate in? (e.g., Technology, Healthcare, Manufacturing)",
        required: true,
      });
    }

    // CRITICAL: Pain cluster or value proposition needed
    if (!gap.painCluster && (!brandContext?.painClusters || brandContext.painClusters.length === 0)) {
      missingCritical.push("Pain Cluster");
      suggestions.push({
        field: "Pain Cluster",
        message: "What problem does your content solve? (e.g., Cost Overruns, Data Silos, Inefficient Processes)",
        required: true,
      });
    }

    // CRITICAL: Value proposition helps find relevant articles
    if (!brandContext?.valueProposition || brandContext.valueProposition.trim().length === 0) {
      missingCritical.push("Value Proposition");
      suggestions.push({
        field: "Value Proposition",
        message: "What unique value does your company provide? (e.g., AI-powered supply chain optimization)",
        required: true,
      });
    }

    // OPTIONAL: But improves quality
    if (!brandContext?.keyDifferentiators || brandContext.keyDifferentiators.length === 0) {
      missingOptional.push("Key Differentiators");
    }

    if (!brandContext?.useCases || brandContext.useCases.length === 0) {
      missingOptional.push("Use Cases");
    }

    const canProceed = missingCritical.length === 0;

    return NextResponse.json({
      isValid: canProceed,
      missingCriticalFields: missingCritical,
      missingOptionalFields: missingOptional,
      suggestions,
      canProceed,
      currentContext: {
        icp: gap.icp,
        stage: gap.stage,
        painCluster: gap.painCluster || brandContext?.painClusters?.[0] || null,
        industry: brandContext?.targetIndustries?.[0] || null,
        valueProposition: brandContext?.valueProposition ? "✓ Set" : null,
        hasDifferentiators: brandContext?.keyDifferentiators && brandContext.keyDifferentiators.length > 0,
        hasUseCases: brandContext?.useCases && brandContext.useCases.length > 0,
      },
    });
  } catch (error) {
    console.error("Error validating context:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Validation failed" },
      { status: 500 }
    );
  }
}
