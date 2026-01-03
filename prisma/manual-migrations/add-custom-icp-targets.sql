-- Add customICPTargets field to brand_contexts table
-- This field stores custom ICP job titles created by accounts

ALTER TABLE "brand_contexts" 
ADD COLUMN IF NOT EXISTS "customICPTargets" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add comment to document the field
COMMENT ON COLUMN "brand_contexts"."customICPTargets" IS 'Custom ICP job titles created by the account, merged with standard list for unified access';
