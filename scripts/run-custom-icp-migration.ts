import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL || "";

function createPrismaClient() {
  if (databaseUrl.startsWith("prisma+")) {
    return new PrismaClient({
      log: ["error", "warn"],
      accelerateUrl: databaseUrl,
    });
  } else {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: ["error", "warn"],
    });
  }
}

const prisma = createPrismaClient();

async function runMigration() {
  try {
    console.log("Running migration: Add customICPTargets field to brand_contexts...");
    
    // Run the SQL migration
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "brand_contexts" 
      ADD COLUMN IF NOT EXISTS "customICPTargets" TEXT[] DEFAULT ARRAY[]::TEXT[];
    `);
    
    console.log("✅ Migration completed successfully!");
    console.log("The customICPTargets field has been added to the brand_contexts table.");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration()
  .then(() => {
    console.log("\n✅ All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  });
