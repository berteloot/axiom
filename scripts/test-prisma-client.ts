/**
 * Test Prisma Client Initialization
 */

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

async function testPrismaClient() {
  try {
    console.log("Testing Prisma Client initialization...");
    console.log("DATABASE_URL type:", process.env.DATABASE_URL?.startsWith("prisma+") ? "Accelerate" : "Direct");
    
    // Try to import and create the client
    const { prisma } = await import("../lib/prisma");
    console.log("✓ Prisma client created");
    
    // Try to connect
    await prisma.$connect();
    console.log("✓ Database connected");
    
    // Try a simple query
    const count = await prisma.asset.count();
    console.log(`✓ Query successful (${count} assets)`);
    
    await prisma.$disconnect();
    console.log("\n✅ Prisma Client is working correctly!");
    return true;
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error("Stack:", error.stack);
    return false;
  }
}

testPrismaClient()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
