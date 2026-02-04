-- Add applicableIndustries column to assets table
-- This field stores AI-extracted industries where the asset would be most relevant
-- (e.g., "Hospital & Health Care", "Financial Services", "Computer Software")

ALTER TABLE "assets" 
ADD COLUMN IF NOT EXISTS "applicableIndustries" TEXT[] DEFAULT '{}';

-- Add comment to document the field
COMMENT ON COLUMN "assets"."applicableIndustries" IS 'Industries where this asset is relevant - extracted by AI from content analysis';
