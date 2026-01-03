import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { getUnifiedICPTargets, extractCustomTargets } from "../lib/icp-targets";
import { ALL_JOB_TITLES } from "../lib/job-titles";

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

async function checkICPTargets() {
  try {
    console.log("\n=== Checking ICP Targets in Database ===\n");
    
    // Get all brand contexts
    const brandContexts = await prisma.brandContext.findMany({
      select: {
        id: true,
        accountId: true,
        primaryICPRoles: true,
        customICPTargets: true,
      },
    });
    
    if (brandContexts.length === 0) {
      console.log("❌ No brand contexts found in database");
      return;
    }
    
    for (const bc of brandContexts) {
      console.log(`\nBrand Context ID: ${bc.id}`);
      console.log(`Account ID: ${bc.accountId}`);
      console.log(`Primary ICP Roles:`, bc.primaryICPRoles);
      console.log(`Custom ICP Targets:`, bc.customICPTargets);
      
      // Check if "CX" is in either list
      const hasCXInPrimary = bc.primaryICPRoles.some(r => 
        r.toLowerCase().includes("cx")
      );
      const hasCXInCustom = bc.customICPTargets.some(t => 
        t.toLowerCase().includes("cx")
      );
      
      console.log(`Has "CX" in primaryICPRoles:`, hasCXInPrimary);
      console.log(`Has "CX" in customICPTargets:`, hasCXInCustom);
      
      // Get unified list
      const customFromPrimary = extractCustomTargets(bc.primaryICPRoles, ALL_JOB_TITLES);
      const allCustom = Array.from(new Set([...bc.customICPTargets, ...customFromPrimary]));
      const unified = getUnifiedICPTargets(allCustom);
      
      const hasCXInUnified = unified.some(t => t.toLowerCase().includes("cx"));
      console.log(`Has "CX" in unified list:`, hasCXInUnified);
      
      if (hasCXInUnified) {
        const cxMatches = unified.filter(t => t.toLowerCase().includes("cx"));
        console.log(`"CX" matches in unified list:`, cxMatches);
      }
    }
    
    console.log("\n✅ Check complete\n");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkICPTargets();
