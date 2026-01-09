-- Add PPC campaign preferences to accounts table
-- These preferences store the location and language for keyword research

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS "ppcLocationName" TEXT NOT NULL DEFAULT 'United States',
ADD COLUMN IF NOT EXISTS "ppcLanguageName" TEXT NOT NULL DEFAULT 'English';

-- Add comments for documentation
COMMENT ON COLUMN accounts."ppcLocationName" IS 'Location for keyword research (DataForSEO location_name). Default: United States';
COMMENT ON COLUMN accounts."ppcLanguageName" IS 'Language for keyword research (DataForSEO language_name). Default: English';
