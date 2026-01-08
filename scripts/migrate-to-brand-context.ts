/**
 * Migration Script: CompanyProfile → BrandContext + ProductLine
 * 
 * This script migrates existing CompanyProfile data to the new architecture:
 * - Converts CompanyProfile to BrandContext (global company identity)
 * - Creates a ProductLine for each existing product
 * 
 * Run: npx tsx scripts/migrate-to-brand-context.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

async function migrateCompanyProfiles() {
  console.log("Starting migration from CompanyProfile to BrandContext...\n");

  try {
    // Find all existing CompanyProfiles
    const profiles = await prisma.companyProfile.findMany({
      include: {
        account: true,
      },
    });

    console.log(`Found ${profiles.length} company profiles to migrate.\n`);

    for (const profile of profiles) {
      console.log(`Migrating profile for account: ${profile.account.name}`);

      // Check if BrandContext already exists (avoid duplicates)
      const existingContext = await prisma.brandContext.findUnique({
        where: { accountId: profile.accountId },
      });

      if (existingContext) {
        console.log(`  ⚠️  BrandContext already exists for ${profile.account.name}, skipping...`);
        continue;
      }

      // 1. Create BrandContext (global company identity)
      // Convert old brandVoice string to array format
      const brandVoiceArray = profile.brandVoice 
        ? [profile.brandVoice] 
        : [];
      
      const brandContext = await prisma.brandContext.create({
        data: {
          accountId: profile.accountId,
          brandVoice: brandVoiceArray,
          competitors: profile.competitors,
          targetIndustries: profile.targetIndustries,
          websiteUrl: null, // New field, set to null initially
        },
      });

      console.log(`  ✓ Created BrandContext`);

      // 2. Create ProductLine from the existing product
      const productLine = await prisma.productLine.create({
        data: {
          brandContextId: brandContext.id,
          name: profile.productName,
          description: profile.productDescription,
          valueProposition: profile.valueProposition,
          specificICP: [], // Empty array - will need manual configuration after migration
        },
      });

      console.log(`  ✓ Created ProductLine: "${productLine.name}"`);

      // 3. Link all existing assets to this product line
      // Note: This is a legacy migration script. The productLineId field no longer exists.
      // Assets are now linked via the AssetProductLine junction table.
      // This migration is kept for historical reference only.
      const assets = await prisma.asset.findMany({
        where: {
          accountId: profile.accountId,
        },
      });

      // Create associations via junction table
      if (assets.length > 0) {
        await prisma.assetProductLine.createMany({
          data: assets.map(asset => ({
            assetId: asset.id,
            productLineId: productLine.id,
          })),
          skipDuplicates: true,
        });
      }

      const updatedAssets = { count: assets.length };

      console.log(`  ✓ Linked ${updatedAssets.count} assets to this product line\n`);
    }

    console.log("✅ Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Review the new Brand Context and Product Lines in Settings");
    console.log("2. You can now add additional product lines if needed");
    console.log("3. The legacy CompanyProfile model can be removed in a future update");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateCompanyProfiles()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
