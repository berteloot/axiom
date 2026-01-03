/**
 * Database Setup Script
 * This script helps set up the database for the Asset Organizer app
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf-8");
    envFile.split("\n").forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith("#")) {
        const [key, ...valueParts] = trimmedLine.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^["']|["']$/g, "");
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
}

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  log: ["query", "error", "warn"],
  // Prisma 7 requires accelerateUrl for Prisma Accelerate connections
  ...(databaseUrl.startsWith("prisma+") 
    ? { accelerateUrl: databaseUrl }
    : {} // Direct connection - Prisma reads DATABASE_URL from env automatically
  ),
});

async function setupDatabase() {
  console.log("\n" + "=".repeat(60));
  console.log("Database Setup for Asset Organizer");
  console.log("=".repeat(60) + "\n");

  const databaseUrl = process.env.DATABASE_URL || "";
  const isAccelerate = databaseUrl.startsWith("prisma+");

  console.log(`Database URL type: ${isAccelerate ? "Prisma Accelerate" : "Direct connection"}`);
  console.log(`DATABASE_URL present: ${!!databaseUrl}\n`);

  try {
    // Test connection
    console.log("Testing database connection...");
    await prisma.$connect();
    console.log("✓ Database connected\n");

    // Check if table exists
    console.log("Checking if 'assets' table exists...");
    try {
      const count = await prisma.asset.count();
      console.log(`✓ Table 'assets' exists (${count} records)\n`);
      console.log("✅ Database is ready!");
      return true;
    } catch (error: any) {
      if (error?.code === "P2001" || error?.message?.includes("does not exist")) {
        console.log("✗ Table 'assets' does not exist\n");
        
        if (isAccelerate) {
          console.log("⚠️  You're using Prisma Accelerate (prisma+postgres://)");
          console.log("   Migrations cannot be run directly with Accelerate.\n");
          console.log("Options:");
          console.log("1. Use 'prisma db push' to sync schema (recommended for development):");
          console.log("   npx prisma db push\n");
          console.log("2. Use a direct connection URL for migrations:");
          console.log("   - Set DIRECT_DATABASE_URL in .env with a direct postgres:// URL");
          console.log("   - Then run: npx prisma migrate dev\n");
        } else {
          console.log("Run migrations to create the table:");
          console.log("   npm run db:migrate\n");
        }
        return false;
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    console.error("❌ Database setup error:", error.message);
    console.error(`   Error code: ${error?.code || "UNKNOWN"}\n`);
    
    if (error?.code === "P1001") {
      console.log("Cannot connect to database. Please check:");
      console.log("1. Your DATABASE_URL is correct");
      console.log("2. The database server is running");
      console.log("3. Your network connection is active\n");
    }
    
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

setupDatabase()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
