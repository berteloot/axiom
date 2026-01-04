import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { extractBrandContextFromText } from "@/lib/ai/website-scanner";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const analyzeTextSchema = z.object({
  text: z.string().min(50, "Text must be at least 50 characters long"),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { text } = analyzeTextSchema.parse(body);

    // Extract brand context from text
    const result = await extractBrandContextFromText(text);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error analyzing text:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request: " + error.issues[0].message },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to analyze text" },
      { status: 500 }
    );
  }
}