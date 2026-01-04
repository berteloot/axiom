-- Migration: Convert Asset-ProductLine relationship from one-to-many to many-to-many
-- This migration creates a join table and migrates existing data

-- Step 1: Create the join table
CREATE TABLE IF NOT EXISTS "asset_product_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetId" TEXT NOT NULL,
  "productLineId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_product_lines_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "asset_product_lines_productLineId_fkey" FOREIGN KEY ("productLineId") REFERENCES "product_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS "asset_product_lines_assetId_idx" ON "asset_product_lines"("assetId");
CREATE INDEX IF NOT EXISTS "asset_product_lines_productLineId_idx" ON "asset_product_lines"("productLineId");

-- Step 3: Create unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "asset_product_lines_assetId_productLineId_key" ON "asset_product_lines"("assetId", "productLineId");

-- Step 4: Migrate existing data (copy productLineId to join table)
INSERT INTO "asset_product_lines" ("id", "assetId", "productLineId", "createdAt")
SELECT 
  gen_random_uuid()::text,
  "id",
  "productLineId",
  CURRENT_TIMESTAMP
FROM "assets"
WHERE "productLineId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 5: Drop the old productLineId column (commented out - uncomment after verifying migration)
-- ALTER TABLE "assets" DROP COLUMN "productLineId";
-- DROP INDEX IF EXISTS "assets_productLineId_idx";
