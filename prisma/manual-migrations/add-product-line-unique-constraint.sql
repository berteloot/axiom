-- Manual Migration: Add unique constraint to ProductLine
-- This ensures no duplicate product line names within the same brand context
-- 
-- Run this SQL manually if you have the necessary database permissions:
-- psql <your-database-url> -f prisma/manual-migrations/add-product-line-unique-constraint.sql
--
-- Or in your database GUI (pgAdmin, DBeaver, etc.)

-- Step 1: Check for existing duplicates (optional, for verification)
SELECT 
    "brandContextId", 
    "name", 
    COUNT(*) as count
FROM "product_lines"
GROUP BY "brandContextId", "name"
HAVING COUNT(*) > 1;

-- If the query above returns any rows, you have duplicates that need to be resolved first.
-- You may need to rename or delete duplicates before proceeding.

-- Step 2: Add the unique constraint
ALTER TABLE "product_lines"
ADD CONSTRAINT "product_lines_brandContextId_name_key" 
UNIQUE ("brandContextId", "name");

-- Verification: Check if constraint was added
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'product_lines'::regclass
AND conname = 'product_lines_brandContextId_name_key';

-- Expected output: One row with constraint_name = 'product_lines_brandContextId_name_key' and constraint_type = 'u' (unique)
