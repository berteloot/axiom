/**
 * Migration script to add multi-account support
 * This script:
 * 1. Creates the new tables (User, Account, UserAccount, Session, AccountManager)
 * 2. Creates a default account and user
 * 3. Migrates existing assets to the default account
 * 4. Updates the schema
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf-8");
    envFile.split("\n").forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith("#")) {
        const [key, ...valueParts] = trimmedLine.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^["']|["']$/g, "");
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
}

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL || "";

function createPrismaClient() {
  if (databaseUrl.startsWith("prisma+")) {
    // Prisma Accelerate connection
    return new PrismaClient({
      log: ["error", "warn"],
      accelerateUrl: databaseUrl,
    });
  } else {
    // Direct PostgreSQL connection - requires adapter
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const pool = new Pool({ 
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false, // Render uses self-signed certificates
      },
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: ["error", "warn"],
    });
  }
}

const prisma = createPrismaClient();

async function migrate() {
  console.log("Starting migration to multi-account support...");

  try {
    // Step 1: Check if we have existing assets
    const existingAssets = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM assets
    `;
    const assetCount = Number(existingAssets[0].count);
    console.log(`Found ${assetCount} existing assets`);

    // Step 2: Create tables if they don't exist
    console.log("Creating new tables...");
    
    // Create users table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "name" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "users_pkey" PRIMARY KEY ("id")
      )
    `;

    // Create unique constraint on email
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email")
    `;

    // Create accounts table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "accounts" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
      )
    `;

    // Create unique constraint on slug
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "accounts_slug_key" ON "accounts"("slug")
    `;

    // Create user_accounts table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "user_accounts" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "accountId" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'MEMBER',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
      )
    `;

    // Create unique constraint on userId + accountId
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_accounts_userId_accountId_key" 
      ON "user_accounts"("userId", "accountId")
    `;

    // Create sessions table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "sessions" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "accountId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
      )
    `;

    // Create unique constraint on userId
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "sessions_userId_key" ON "sessions"("userId")
    `;

    // Create account_managers table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "account_managers" (
        "id" TEXT NOT NULL,
        "accountId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "account_managers_pkey" PRIMARY KEY ("id")
      )
    `;

    // Create index on accountId for account_managers
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "account_managers_accountId_idx" ON "account_managers"("accountId")
    `;

    console.log("Tables created successfully");

    // Step 3: Add accountId column to assets if it doesn't exist (nullable first)
    console.log("Adding accountId column to assets...");
    await prisma.$executeRaw`
      ALTER TABLE "assets" 
      ADD COLUMN IF NOT EXISTS "accountId" TEXT
    `;

    // Step 4: Add accountId column to collections if it doesn't exist
    await prisma.$executeRaw`
      ALTER TABLE "collections" 
      ADD COLUMN IF NOT EXISTS "accountId" TEXT
    `;

    // Step 5: Update company_profiles to add accountId if it doesn't exist
    await prisma.$executeRaw`
      ALTER TABLE "company_profiles" 
      ADD COLUMN IF NOT EXISTS "accountId" TEXT
    `;

    // Step 6: Create default user and account
    console.log("Creating default user and account...");
    
    const defaultUserId = "default-user-id";
    const defaultAccountId = "default-account-id";
    const defaultAccountSlug = "default-account";

    // Check if default user exists
    const existingUser = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${defaultUserId}
    `;

    if (existingUser.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO "users" ("id", "email", "name", "createdAt", "updatedAt")
        VALUES (${defaultUserId}, 'admin@example.com', 'Default Admin', NOW(), NOW())
      `;
      console.log("Default user created");
    } else {
      console.log("Default user already exists");
    }

    // Check if default account exists
    const existingAccount = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM accounts WHERE id = ${defaultAccountId}
    `;

    if (existingAccount.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO "accounts" ("id", "name", "slug", "createdAt", "updatedAt")
        VALUES (${defaultAccountId}, 'Default Account', ${defaultAccountSlug}, NOW(), NOW())
      `;
      console.log("Default account created");
    } else {
      console.log("Default account already exists");
    }

    // Step 7: Link user to account
    const existingUserAccount = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM user_accounts WHERE "userId" = ${defaultUserId} AND "accountId" = ${defaultAccountId}
    `;

    if (existingUserAccount.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO "user_accounts" ("id", "userId", "accountId", "role", "createdAt")
        VALUES (gen_random_uuid()::text, ${defaultUserId}, ${defaultAccountId}, 'OWNER', NOW())
      `;
      console.log("User-account link created");
    } else {
      console.log("User-account link already exists");
    }

    // Step 8: Create session
    const existingSession = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM sessions WHERE "userId" = ${defaultUserId}
    `;

    if (existingSession.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO "sessions" ("id", "userId", "accountId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${defaultUserId}, ${defaultAccountId}, NOW(), NOW())
      `;
      console.log("Session created");
    } else {
      console.log("Session already exists");
    }

    // Step 9: Migrate existing assets to default account
    if (assetCount > 0) {
      console.log(`Migrating ${assetCount} assets to default account...`);
      await prisma.$executeRaw`
        UPDATE "assets" 
        SET "accountId" = ${defaultAccountId}
        WHERE "accountId" IS NULL
      `;
      console.log("Assets migrated successfully");
    }

    // Step 10: Migrate existing collections to default account
    const existingCollections = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM collections
    `;
    const collectionCount = Number(existingCollections[0].count);
    
    if (collectionCount > 0) {
      console.log(`Migrating ${collectionCount} collections to default account...`);
      await prisma.$executeRaw`
        UPDATE "collections" 
        SET "accountId" = ${defaultAccountId}
        WHERE "accountId" IS NULL
      `;
      console.log("Collections migrated successfully");
    }

    // Step 11: Migrate existing company profiles to default account
    const existingProfiles = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM company_profiles
    `;
    const profileCount = Number(existingProfiles[0].count);
    
    if (profileCount > 0) {
      console.log(`Migrating ${profileCount} company profiles to default account...`);
      await prisma.$executeRaw`
        UPDATE "company_profiles" 
        SET "accountId" = ${defaultAccountId}
        WHERE "accountId" IS NULL
      `;
      console.log("Company profiles migrated successfully");
    }

    // Step 12: Make accountId required (add NOT NULL constraint)
    console.log("Making accountId columns required...");
    
    // First, ensure all assets have an accountId
    await prisma.$executeRaw`
      UPDATE "assets" 
      SET "accountId" = ${defaultAccountId}
      WHERE "accountId" IS NULL
    `;

    // Add NOT NULL constraint
    await prisma.$executeRaw`
      ALTER TABLE "assets" 
      ALTER COLUMN "accountId" SET NOT NULL
    `;

    // Do the same for collections
    await prisma.$executeRaw`
      UPDATE "collections" 
      SET "accountId" = ${defaultAccountId}
      WHERE "accountId" IS NULL
    `;

    await prisma.$executeRaw`
      ALTER TABLE "collections" 
      ALTER COLUMN "accountId" SET NOT NULL
    `;

    // For company_profiles, we'll make it unique but nullable (one per account, but optional)
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "company_profiles_accountId_key" 
      ON "company_profiles"("accountId")
      WHERE "accountId" IS NOT NULL
    `;

    // Step 13: Add foreign key constraints
    console.log("Adding foreign key constraints...");
    
    // Add FK for assets.accountId
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'assets_accountId_fkey'
        ) THEN
          ALTER TABLE "assets" 
          ADD CONSTRAINT "assets_accountId_fkey" 
          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `;

    // Add FK for collections.accountId
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'collections_accountId_fkey'
        ) THEN
          ALTER TABLE "collections" 
          ADD CONSTRAINT "collections_accountId_fkey" 
          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `;

    // Add FK for company_profiles.accountId
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'company_profiles_accountId_fkey'
        ) THEN
          ALTER TABLE "company_profiles" 
          ADD CONSTRAINT "company_profiles_accountId_fkey" 
          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `;

    // Add FK for user_accounts
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'user_accounts_userId_fkey'
        ) THEN
          ALTER TABLE "user_accounts" 
          ADD CONSTRAINT "user_accounts_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `;

    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'user_accounts_accountId_fkey'
        ) THEN
          ALTER TABLE "user_accounts" 
          ADD CONSTRAINT "user_accounts_accountId_fkey" 
          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `;

    // Add FK for sessions
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'sessions_userId_fkey'
        ) THEN
          ALTER TABLE "sessions" 
          ADD CONSTRAINT "sessions_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `;

    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'sessions_accountId_fkey'
        ) THEN
          ALTER TABLE "sessions" 
          ADD CONSTRAINT "sessions_accountId_fkey" 
          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `;

    // Add FK for account_managers
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'account_managers_accountId_fkey'
        ) THEN
          ALTER TABLE "account_managers" 
          ADD CONSTRAINT "account_managers_accountId_fkey" 
          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `;

    // Step 14: Add indexes for performance
    console.log("Adding indexes...");
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "assets_accountId_idx" ON "assets"("accountId")
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "collections_accountId_idx" ON "collections"("accountId")
    `;

    console.log("\n✅ Migration completed successfully!");
    console.log("\nSummary:");
    console.log(`- Created default user: ${defaultUserId}`);
    console.log(`- Created default account: ${defaultAccountId}`);
    console.log(`- Migrated ${assetCount} assets`);
    console.log(`- Migrated ${collectionCount} collections`);
    console.log(`- Migrated ${profileCount} company profiles`);
    console.log("\nYou can now use the application with multi-account support!");

  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrate()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
