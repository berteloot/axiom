-- Migration script to add new fields to assets table
-- This handles the updatedAt field for existing rows

-- Step 1: Add updatedAt column with default value for existing rows
ALTER TABLE "assets" 
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 2: Update existing rows to set updatedAt = createdAt if it's NULL (shouldn't happen with DEFAULT, but safe)
UPDATE "assets" 
SET "updatedAt" = "createdAt" 
WHERE "updatedAt" IS NULL;

-- Step 3: Add other new columns
ALTER TABLE "assets"
ADD COLUMN IF NOT EXISTS "contentQualityScore" INTEGER,
ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "atomicSnippets" JSONB;

-- Step 4: Create company_profiles table
CREATE TABLE IF NOT EXISTS "company_profiles" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productName" TEXT NOT NULL,
    "productDescription" TEXT NOT NULL,
    "valueProposition" TEXT NOT NULL,
    "targetIndustries" TEXT[],
    "idealCustomerProfile" TEXT NOT NULL,
    "competitors" TEXT[],
    "brandVoice" TEXT NOT NULL,
    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- Step 5: Create collections table
CREATE TABLE IF NOT EXISTS "collections" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "collections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collections_slug_key" UNIQUE ("slug")
);

-- Step 6: Create collection_assets junction table
CREATE TABLE IF NOT EXISTS "collection_assets" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "collection_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collection_assets_collectionId_assetId_key" UNIQUE ("collectionId", "assetId")
);

-- Step 7: Create derivative_assets table
CREATE TABLE IF NOT EXISTS "derivative_assets" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    CONSTRAINT "derivative_assets_pkey" PRIMARY KEY ("id")
);

-- Step 8: Add foreign keys
DO $$ 
BEGIN
    -- Add foreign key for collection_assets -> collections
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'collection_assets_collectionId_fkey'
    ) THEN
        ALTER TABLE "collection_assets" 
        ADD CONSTRAINT "collection_assets_collectionId_fkey" 
        FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- Add foreign key for collection_assets -> assets
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'collection_assets_assetId_fkey'
    ) THEN
        ALTER TABLE "collection_assets" 
        ADD CONSTRAINT "collection_assets_assetId_fkey" 
        FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- Add foreign key for derivative_assets -> assets
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'derivative_assets_parentId_fkey'
    ) THEN
        ALTER TABLE "derivative_assets" 
        ADD CONSTRAINT "derivative_assets_parentId_fkey" 
        FOREIGN KEY ("parentId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
