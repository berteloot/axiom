-- Migration script to add manual date fields to assets table

-- Add customCreatedAt column
ALTER TABLE "assets"
ADD COLUMN IF NOT EXISTS "customCreatedAt" TIMESTAMP(3);

-- Add lastReviewedAt column
ALTER TABLE "assets"
ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMP(3);
