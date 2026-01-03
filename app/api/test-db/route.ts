import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const databaseUrl = process.env.DATABASE_URL || "";
  try {
    console.log("Testing database connection...");
    console.log("DATABASE_URL present:", !!databaseUrl);
    console.log("DATABASE_URL starts with prisma+:", databaseUrl.startsWith("prisma+"));
    
    // Test database connection
    await prisma.$connect();
    console.log("✓ Database connected");
    
    // Try a simple query to check if table exists
    let count;
    let tableExists = false;
    try {
      count = await prisma.asset.count();
      tableExists = true;
      console.log("✓ Table 'assets' exists");
    } catch (tableError: any) {
      console.error("Table check error:", tableError);
      if (tableError?.code === "P2001" || tableError?.message?.includes("does not exist")) {
        tableExists = false;
        console.log("✗ Table 'assets' does not exist");
      } else {
        throw tableError;
      }
    }
    
    return NextResponse.json({
      success: true,
      message: tableExists ? "Database connection successful" : "Database connected but table 'assets' does not exist",
      tableExists,
      assetCount: count ?? 0,
      instructions: !tableExists ? "Run: npm run db:push" : undefined,
    });
  } catch (error: any) {
    console.error("Database test error:", error);
    const errorMessage = error?.message || "Unknown error";
    const errorName = error?.name || "Unknown";
    const errorCode = error?.code || "UNKNOWN";
    const isFetchFailed = errorMessage.includes("fetch failed");
    const isAccelerate = databaseUrl.startsWith("prisma+");
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      errorName: errorName,
      errorCode: errorCode,
      stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined,
      instructions: (errorCode === "P1001" || isFetchFailed)
        ? (isAccelerate 
          ? "Check: 1) Internet connection, 2) Prisma Accelerate service status, 3) API key validity"
          : "Check your DATABASE_URL and ensure the database server is running")
        : errorCode === "P2001" ? "Run: npm run db:push" : undefined,
    }, { status: 500 });
  } finally {
    try {
      await prisma.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }
}
