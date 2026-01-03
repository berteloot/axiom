import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { extractCustomTargets, mergeCustomTargets } from "../lib/icp-targets";
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

async function syncCustomTargets() {
  try {
    console.log("\n=== Syncing Custom ICP Targets ===\n");
    
    const brandContexts = await prisma.brandContext.findMany({
      select: {
        id: true,
        accountId: true,
        primaryICPRoles: true,
        customICPTargets: true,
      },
    });
    
    if (brandContexts.length === 0) {
      console.log("No brand contexts found");
      return;
    }
    
    for (const bc of brandContexts) {
      console.log(`\nProcessing Brand Context: ${bc.id} (Account: ${bc.accountId})`);
      console.log(`  Primary ICP Roles:`, bc.primaryICPRoles);
      console.log(`  Current Custom ICP Targets:`, bc.customICPTargets);
      
      // Extract custom targets from primaryICPRoles
      const customFromPrimary = extractCustomTargets(bc.primaryICPRoles, ALL_JOB_TITLES);
      console.log(`  Custom targets from primaryICPRoles:`, customFromPrimary);
      
      if (customFromPrimary.length > 0) {
        // Merge with existing customICPTargets
        const merged = mergeCustomTargets(bc.customICPTargets, customFromPrimary);
        console.log(`  Merged custom targets:`, merged);
        
        // Update if there are changes
        if (JSON.stringify(merged.sort()) !== JSON.stringify(bc.customICPTargets.sort())) {
          await prisma.brandContext.update({
            where: { id: bc.id },
            data: { customICPTargets: merged }
          });
          console.log(`  ✅ Updated customICPTargets`);
        } else {
          console.log(`  ℹ️  No changes needed`);
        }
      } else {
        console.log(`  ℹ️  No custom targets to sync`);
      }
    }
    
    console.log("\n✅ Sync complete\n");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

syncCustomTargets();
