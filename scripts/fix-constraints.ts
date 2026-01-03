import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
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

async function fixConstraints() {
  try {
    console.log("Fixing constraints...");
    
    // Drop the unique constraint if it exists (Prisma will recreate it)
    await prisma.$executeRaw`
      DROP INDEX IF EXISTS "company_profiles_accountId_key"
    `;
    
    console.log("✅ Constraints fixed");
  } catch (error) {
    console.error("Error fixing constraints:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixConstraints()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
