-- Add assetType column to assets table
-- This is a nullable field for marketing asset type (e.g., "Case Study", "Whitepaper")
-- Distinct from the technical fileType field

ALTER TABLE "assets" 
ADD COLUMN IF NOT EXISTS "assetType" TEXT;

-- Add comment to document the field
COMMENT ON COLUMN "assets"."assetType" IS 'Marketing asset type (e.g., "Case Study", "Whitepaper") - distinct from technical fileType';
