import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7: For direct PostgreSQL connections, we need to use an adapter
// For Prisma Accelerate (prisma+postgres://), we use accelerateUrl
const databaseUrl = process.env.DATABASE_URL || "";

function createPrismaClient() {
  try {
    if (databaseUrl.startsWith("prisma+")) {
      // Prisma Accelerate connection
      return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
        accelerateUrl: databaseUrl,
      });
    } else {
      // Direct PostgreSQL connection - requires adapter
      if (!databaseUrl) {
        console.warn("⚠️  DATABASE_URL environment variable is not set. Database operations will fail.");
        // Return a client anyway - it will fail on first use, but won't crash the app
        return new PrismaClient({
          log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
        });
      }
      // Render and most cloud Postgres require SSL
      const pool = new Pool({ 
        connectionString: databaseUrl,
        ssl: {
          rejectUnauthorized: false, // Render uses self-signed certificates
        },
      });
      const adapter = new PrismaPg(pool);
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
      });
    }
  } catch (error) {
    console.error("Error creating Prisma client:", error);
    // Return a basic client instead of throwing - this prevents the app from crashing
    console.warn("⚠️  Falling back to basic Prisma client. Database operations may fail.");
    return new PrismaClient({
      log: ["error"],
    });
  }
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
