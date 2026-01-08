import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL || "";

function createPrismaClient() {
  if (databaseUrl.startsWith("prisma+")) {
    // Prisma Accelerate connection
    return new PrismaClient({
      log: ["query", "error", "warn"],
      accelerateUrl: databaseUrl,
    });
  } else {
    // Direct PostgreSQL connection - requires adapter
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false, // Render uses self-signed certificates
      },
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: ["query", "error", "warn"],
    });
  }
}

const prisma = createPrismaClient();

async function runMigration() {
  console.log("\n" + "=".repeat(60));
  console.log("Running Migration: Add 'inUse' column to assets table");
  console.log("=".repeat(60) + "\n");

  try {
    // Test connection
    await prisma.$connect();
    console.log("✅ Database connection successful\n");

    // Check if column already exists
    const result = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'assets' 
      AND column_name = 'inUse'
    `);

    if (result.length > 0) {
      console.log("⚠️  Column 'inUse' already exists. Skipping migration.\n");
      return;
    }

    console.log("Adding 'inUse' column...");
    await prisma.$executeRawUnsafe(`
      ALTER TABLE assets 
      ADD COLUMN IF NOT EXISTS "inUse" BOOLEAN DEFAULT false NOT NULL;
    `);
    console.log("✅ Column 'inUse' added successfully\n");

    console.log("Creating index on 'inUse' column...");
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_assets_in_use ON assets ("inUse");
    `);
    console.log("✅ Index created successfully\n");

    console.log("Adding column comment...");
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN assets."inUse" IS 'Whether the asset is currently being used in campaigns or projects';
    `);
    console.log("✅ Column comment added\n");

    console.log("=".repeat(60));
    console.log("✅ Migration completed successfully!");
    console.log("=".repeat(60) + "\n");

    // Verify the column was created
    const verifyResult = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'assets' 
      AND column_name = 'inUse'
    `);

    if (verifyResult.length > 0) {
      console.log("Verification:");
      console.log(`  Column: ${verifyResult[0].column_name}`);
      console.log(`  Type: ${verifyResult[0].data_type}\n`);
    }

  } catch (error) {
    console.error("\n❌ Migration failed:");
    console.error(error);
    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log("Database connection closed.\n");
  }
}

runMigration();
