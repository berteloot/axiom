-- Migration script to add inUse field to assets table
-- Run this script to add the "inUse" boolean column

-- Add the inUse column with a default value of false
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "inUse" BOOLEAN DEFAULT false NOT NULL;

-- Create an index on inUse for efficient filtering
CREATE INDEX IF NOT EXISTS idx_assets_in_use ON assets ("inUse");

-- Update the column comment for documentation
COMMENT ON COLUMN assets."inUse" IS 'Whether the asset is currently being used in campaigns or projects';
