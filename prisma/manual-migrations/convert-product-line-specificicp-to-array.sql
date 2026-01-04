-- Migration: Convert ProductLine.specificICP from String to String[]
-- This migration converts the specificICP column from a TEXT type to TEXT[] (string array)
-- 
-- IMPORTANT: Run this migration manually on your database
-- After running, deploy the code with the updated Prisma schema

-- Step 1: Add a temporary column to hold the array data
ALTER TABLE product_lines ADD COLUMN specific_icp_array TEXT[] DEFAULT '{}';

-- Step 2: Copy existing data (if any exists, treat the old text as a single-element array)
-- This handles the case where specificICP was already empty or had text content
UPDATE product_lines 
SET specific_icp_array = CASE 
    WHEN "specificICP" IS NULL OR "specificICP" = '' THEN '{}'
    ELSE ARRAY["specificICP"]::TEXT[]
END;

-- Step 3: Drop the old column
ALTER TABLE product_lines DROP COLUMN "specificICP";

-- Step 4: Rename the new column to the original name
ALTER TABLE product_lines RENAME COLUMN specific_icp_array TO "specificICP";

-- Step 5: Set NOT NULL constraint if needed (optional, depends on your requirements)
-- ALTER TABLE product_lines ALTER COLUMN "specificICP" SET NOT NULL;
