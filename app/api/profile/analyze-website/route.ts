import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { detectProfileFromUrl } from "@/lib/ai/website-scanner";
import { z } from "zod";

export const runtime = "nodejs";

const analyzeWebsiteSchema = z.object({
  url: z.string().url("Invalid URL format"),
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
    const { url } = analyzeWebsiteSchema.parse(body);

    // Analyze the website
    const result = await detectProfileFromUrl(url);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error analyzing website:", error);
    
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
      { error: "Failed to analyze website" },
      { status: 500 }
    );
  }
}
