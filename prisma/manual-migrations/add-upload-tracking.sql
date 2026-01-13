-- Add uploadedById column to assets table
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "uploadedById" TEXT;

-- Add uploadedByNameOverride column for custom name override
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "uploadedByNameOverride" TEXT;

-- Add foreign key constraint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploadedById_fkey" 
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") 
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS "assets_uploadedById_idx" ON "assets"("uploadedById");
