/**
 * Migration script to standardize ICP targets across the entire database
 * 
 * This script:
 * 1. Finds all ICP targets in assets, brand contexts, and product lines
 * 2. Standardizes their capitalization
 * 3. Merges duplicates (case-insensitive)
 * 4. Updates all records with standardized values
 * 
 * Run with: npx tsx scripts/standardize-icp-targets.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { standardizeJobTitle, standardizeICPTargets } from "../lib/icp-targets";

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

interface StandardizationMap {
  [lowercase: string]: string; // Maps lowercase -> standardized
}

async function standardizeAllICPTargets() {
  console.log("Starting ICP target standardization...\n");

  try {
    // Step 1: Collect all ICP targets from all sources
    console.log("Step 1: Collecting all ICP targets...");
    
    const assets = await prisma.asset.findMany({
      select: { id: true, accountId: true, icpTargets: true },
    });
    
    const brandContexts = await prisma.brandContext.findMany({
      select: { 
        id: true, 
        accountId: true, 
        primaryICPRoles: true, 
        customICPTargets: true 
      },
    });
    
    const productLines = await prisma.productLine.findMany({
      select: { id: true, brandContextId: true, specificICP: true },
    });

    console.log(`Found ${assets.length} assets, ${brandContexts.length} brand contexts, ${productLines.length} product lines\n`);

    // Step 2: Build standardization map
    console.log("Step 2: Building standardization map...");
    const standardizationMap: StandardizationMap = {};
    const duplicates: Array<{ original: string; standardized: string }> = [];

    // Process all ICP targets
    const allTargets = new Set<string>();
    
    assets.forEach(asset => {
      asset.icpTargets.forEach(target => allTargets.add(target));
    });
    
    brandContexts.forEach(bc => {
      bc.primaryICPRoles.forEach(target => allTargets.add(target));
      bc.customICPTargets.forEach(target => allTargets.add(target));
    });
    
    productLines.forEach(pl => {
      pl.specificICP.forEach(target => allTargets.add(target));
    });

    // Standardize each unique target
    allTargets.forEach(target => {
      const standardized = standardizeJobTitle(target);
      const lower = target.toLowerCase();
      const standardizedLower = standardized.toLowerCase();

      if (lower !== standardizedLower) {
        duplicates.push({ original: target, standardized });
      }

      // If we've seen this lowercase before, keep the standardized version
      if (!standardizationMap[lower]) {
        standardizationMap[lower] = standardized;
      } else if (standardizationMap[lower] !== standardized) {
        // If we have a conflict, prefer the standardized version
        const existing = standardizationMap[lower];
        if (existing !== standardized) {
          console.log(`  Conflict: "${existing}" vs "${standardized}" (keeping "${standardized}")`);
          standardizationMap[lower] = standardized;
        }
      }
    });

    console.log(`Found ${duplicates.length} targets that need standardization`);
    if (duplicates.length > 0) {
      console.log("Examples:");
      duplicates.slice(0, 10).forEach(({ original, standardized }) => {
        if (original !== standardized) {
          console.log(`  "${original}" -> "${standardized}"`);
        }
      });
      if (duplicates.length > 10) {
        console.log(`  ... and ${duplicates.length - 10} more`);
      }
    }
    console.log();

    // Step 3: Update assets
    console.log("Step 3: Updating assets...");
    let assetsUpdated = 0;
    for (const asset of assets) {
      const standardized = standardizeICPTargets(asset.icpTargets);
      const needsUpdate = JSON.stringify(asset.icpTargets) !== JSON.stringify(standardized);
      
      if (needsUpdate) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { icpTargets: standardized },
        });
        assetsUpdated++;
      }
    }
    console.log(`Updated ${assetsUpdated} assets\n`);

    // Step 4: Update brand contexts
    console.log("Step 4: Updating brand contexts...");
    let contextsUpdated = 0;
    for (const bc of brandContexts) {
      const standardizedPrimary = standardizeICPTargets(bc.primaryICPRoles);
      const standardizedCustom = standardizeICPTargets(bc.customICPTargets);
      const needsUpdate = 
        JSON.stringify(bc.primaryICPRoles) !== JSON.stringify(standardizedPrimary) ||
        JSON.stringify(bc.customICPTargets) !== JSON.stringify(standardizedCustom);

      if (needsUpdate) {
        await prisma.brandContext.update({
          where: { id: bc.id },
          data: {
            primaryICPRoles: standardizedPrimary,
            customICPTargets: standardizedCustom,
          },
        });
        contextsUpdated++;
      }
    }
    console.log(`Updated ${contextsUpdated} brand contexts\n`);

    // Step 5: Update product lines
    console.log("Step 5: Updating product lines...");
    let productLinesUpdated = 0;
    for (const pl of productLines) {
      const standardized = standardizeICPTargets(pl.specificICP);
      const needsUpdate = JSON.stringify(pl.specificICP) !== JSON.stringify(standardized);

      if (needsUpdate) {
        await prisma.productLine.update({
          where: { id: pl.id },
          data: { specificICP: standardized },
        });
        productLinesUpdated++;
      }
    }
    console.log(`Updated ${productLinesUpdated} product lines\n`);

    // Step 6: Summary
    console.log("=== Summary ===");
    console.log(`Total targets found: ${allTargets.size}`);
    console.log(`Targets needing standardization: ${duplicates.length}`);
    console.log(`Assets updated: ${assetsUpdated}`);
    console.log(`Brand contexts updated: ${contextsUpdated}`);
    console.log(`Product lines updated: ${productLinesUpdated}`);
    console.log("\nStandardization complete!");

  } catch (error) {
    console.error("Error during standardization:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
standardizeAllICPTargets()
  .then(() => {
    console.log("\nMigration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration failed:", error);
    process.exit(1);
  });
