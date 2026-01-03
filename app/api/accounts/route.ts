import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/account-utils";
import { createAccountWithSlug } from "@/lib/services/account-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/accounts - List all accounts for the current user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get all accounts the user has access to
    const userAccounts = await prisma.userAccount.findMany({
      where: { userId },
      include: {
        account: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get user's accountType (with error handling in case field doesn't exist yet)
    let accountType: "CORPORATE" | "AGENCY" | null = null;
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { accountType: true },
      });
      accountType = user?.accountType || null;
    } catch (typeError: any) {
      // If accountType field doesn't exist or there's an error, default to null (legacy users)
      console.warn("Could not fetch accountType, defaulting to null:", typeError?.message);
      accountType = null;
    }

    const accounts = userAccounts.map((ua) => ({
      id: ua.account.id,
      name: ua.account.name,
      slug: ua.account.slug,
      role: ua.role,
      createdAt: ua.account.createdAt.toISOString(),
    }));

    return NextResponse.json({ 
      accounts,
      accountType,
    });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = process.env.NODE_ENV === "development" 
      ? { message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
      : undefined;
    
    return NextResponse.json(
      { 
        error: "Failed to fetch accounts",
        details: errorDetails
      },
      { status: 500 }
    );
  }
}

// POST /api/accounts - Create a new account
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      console.error("Invalid userId:", userId);
      return NextResponse.json(
        { error: "Invalid user ID. Please ensure you are authenticated." },
        { status: 401 }
      );
    }
    
    console.log("Creating account request - userId:", userId);
    
    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error("Error parsing request body:", parseError);
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON." },
        { status: 400 }
      );
    }
    
    const { name } = body;
    console.log("Request body - name:", name);

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Account name is required" },
        { status: 400 }
      );
    }

    // Check user's accountType and enforce corporate limit
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userAccounts: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // If user is CORPORATE and already has 1 account, block creation
    if (user.accountType === "CORPORATE") {
      const accountCount = user.userAccounts.length;
      if (accountCount >= 1) {
        return NextResponse.json(
          { 
            error: "Corporate accounts are limited to one organization. To manage multiple organizations, please upgrade to an Agency account.",
            accountType: "CORPORATE",
            currentAccountCount: accountCount,
          },
          { status: 403 }
        );
      }
    }

    // Verify database tables exist by attempting a simple query
    try {
      await prisma.user.findFirst();
      await prisma.account.findFirst();
      await prisma.userAccount.findFirst();
      await prisma.session.findFirst();
      console.log("Database tables verified");
    } catch (dbError: any) {
      console.error("Database table verification failed:", dbError);
      if (dbError?.code === "P2001" || dbError?.message?.includes("does not exist")) {
        return NextResponse.json(
          { 
            error: "Database tables not found. Please run: npm run db:push",
            details: process.env.NODE_ENV === "development" ? dbError.message : undefined
          },
          { status: 500 }
        );
      }
      // If it's a different error, log it but continue - might be a connection issue
      console.warn("Table verification warning (continuing):", dbError.message);
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!slug || slug.length === 0) {
      return NextResponse.json(
        { error: "Invalid account name. Please use alphanumeric characters." },
        { status: 400 }
      );
    }

    // Check if slug is unique
    const existingAccount = await prisma.account.findUnique({
      where: { slug },
    });

    if (existingAccount) {
      // Append timestamp if slug exists
      const uniqueSlug = `${slug}-${Date.now()}`;
      const account = await createAccountWithSlug(userId, name, uniqueSlug);
      return NextResponse.json({
        account: {
          id: account.id,
          name: account.name,
          slug: account.slug,
          role: "OWNER",
          createdAt: account.createdAt.toISOString(),
        },
      });
    }

    const account = await createAccountWithSlug(userId, name, slug);
    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        role: "OWNER",
        createdAt: account.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating account:", error);
    
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = process.env.NODE_ENV === "development" 
      ? { message: errorMessage, stack: errorStack } 
      : undefined;
    
    // Log full error for debugging
    if (process.env.NODE_ENV === "development") {
      console.error("Full error details:", {
        message: errorMessage,
        stack: errorStack,
        error: error,
      });
    }
    
    // Check for specific Prisma errors
    if (errorMessage.includes("Unique constraint") || errorMessage.includes("P2002")) {
      return NextResponse.json(
        { error: "An account with this name already exists. Please choose a different name.", details: errorDetails },
        { status: 409 }
      );
    }
    
    if (errorMessage.includes("Foreign key constraint") || errorMessage.includes("P2003")) {
      return NextResponse.json(
        { error: "Database error. Please ensure your user account is set up correctly.", details: errorDetails },
        { status: 500 }
      );
    }

    if (errorMessage.includes("Database permission") || errorMessage.includes("permission denied")) {
      return NextResponse.json(
        { 
          error: "Database permissions insufficient. Please contact your administrator.",
          details: errorDetails,
          instructions: "Run: npm run db:verify-permissions or see scripts/grant-db-permissions.sql"
        },
        { status: 500 }
      );
    }

    if (errorMessage.includes("Invalid value") || errorMessage.includes("P2001")) {
      return NextResponse.json(
        { error: "Invalid data provided. Please check your input.", details: errorDetails },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create account", details: errorDetails },
      { status: 500 }
    );
  }
}
