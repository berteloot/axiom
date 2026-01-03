import { prisma } from "@/lib/prisma";

/**
 * Verify database permissions for account-related tables
 * This ensures the database user has proper permissions to create accounts
 */
async function verifyDatabasePermissions(): Promise<void> {
  try {
    // Test if we can query the required tables
    await Promise.all([
      prisma.user.findFirst(),
      prisma.account.findFirst(),
      prisma.userAccount.findFirst(),
      prisma.session.findFirst(),
    ]);
  } catch (error: any) {
    // If it's a permission error, provide helpful message
    if (error?.code === "42501" || error?.message?.includes("permission denied")) {
      throw new Error(
        "Database permissions insufficient. Please run: " +
        "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user; " +
        "See scripts/grant-db-permissions.sql for details."
      );
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Create account with slug and set up user relationship
 * 
 * Infrastructure considerations:
 * - Database: Creates account, user-account relationship, and session
 * - S3: No S3 setup required at account creation (files organized by accountId in upload path)
 * - Permissions: Verifies database permissions before creating
 * 
 * @param userId - The user ID creating the account
 * @param name - Account name
 * @param slug - URL-friendly account identifier
 * @returns Created account
 */
export async function createAccountWithSlug(
  userId: string,
  name: string,
  slug: string
) {
  console.log(`createAccountWithSlug called - userId: ${userId}, name: ${name}, slug: ${slug}`);
  
  // Verify database permissions before proceeding
  try {
    await verifyDatabasePermissions();
    console.log("Database permissions verified");
  } catch (permError: any) {
    console.error("Database permission check failed:", permError);
    throw new Error(`Database permission error: ${permError.message}`);
  }
  
  // Create account and user-account relationship in a transaction
  console.log("Starting transaction...");
  const result = await prisma.$transaction(async (tx) => {
    console.log("Transaction callback started");
    // Ensure user exists, create if not
    let user = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.log(`User ${userId} not found, creating...`);
      // Create user if it doesn't exist
      // Use a unique email based on userId to avoid conflicts
      const userEmail = userId.includes("@") ? userId : `${userId}@example.com`;
      
      // Check if email already exists, if so use a different one
      let existingUserWithEmail = await tx.user.findUnique({
        where: { email: userEmail },
      });
      
      // Generate a unique email if needed
      let finalEmail = userEmail;
      let attempts = 0;
      while (existingUserWithEmail && attempts < 5) {
        finalEmail = `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
        existingUserWithEmail = await tx.user.findUnique({
          where: { email: finalEmail },
        });
        attempts++;
      }
      
      if (existingUserWithEmail) {
        throw new Error("Unable to generate unique email for user. Please try again.");
      }
      
      try {
        user = await tx.user.create({
          data: {
            id: userId,
            email: finalEmail,
            name: "User",
          },
        });
        console.log(`Created user: ${user.id} with email: ${user.email}`);
      } catch (userError: any) {
        console.error("Error creating user:", {
          error: userError,
          message: userError?.message,
          code: userError?.code,
          meta: userError?.meta,
        });
        
        // If it's a unique constraint error on ID, the user was created between our check and create
        // Try to fetch it again
        if (userError?.code === "P2002") {
          const existingUser = await tx.user.findUnique({
            where: { id: userId },
          });
          if (existingUser) {
            user = existingUser;
            console.log(`User ${userId} was created concurrently, using existing user`);
          } else {
            throw new Error(`Failed to create user: ${userError?.message || "Unknown error"}`);
          }
        } else {
          throw new Error(`Failed to create user: ${userError?.message || "Unknown error"}`);
        }
      }
    } else {
      console.log(`User ${userId} exists`);
    }

    // Create the account
    console.log(`Creating account with name: ${name}, slug: ${slug}`);
    let account;
    try {
      account = await tx.account.create({
        data: {
          name: name.trim(),
          slug,
        },
      });
      console.log(`Created account: ${account.id}`);
    } catch (accountError: any) {
      console.error("Error creating account:", {
        error: accountError,
        message: accountError?.message,
        code: accountError?.code,
        meta: accountError?.meta,
      });
      throw new Error(`Failed to create account: ${accountError?.message || "Unknown error"}`);
    }

    // Verify user exists before creating relationship
    if (!user) {
      throw new Error("User not found after creation attempt");
    }

    // Create user-account relationship with OWNER role
    console.log(`Creating user-account relationship...`);
    try {
      await tx.userAccount.create({
        data: {
          userId: user.id,
          accountId: account.id,
          role: "OWNER",
        },
      });
      console.log(`Created user-account relationship`);
    } catch (userAccountError: any) {
      console.error("Error creating user-account relationship:", {
        error: userAccountError,
        message: userAccountError?.message,
        code: userAccountError?.code,
        meta: userAccountError?.meta,
        userId: user.id,
        accountId: account.id,
      });
      
      // Check if it's a foreign key constraint error
      if (userAccountError?.code === "P2003") {
        throw new Error(`Foreign key constraint failed. User ID: ${user.id}, Account ID: ${account.id}. ${userAccountError?.message || ""}`);
      }
      
      throw new Error(`Failed to create user-account relationship: ${userAccountError?.message || "Unknown error"}`);
    }

    // Verify user exists before creating session
    if (!user) {
      throw new Error("User not found before creating session");
    }

    // Create or update session to set this as current account
    console.log(`Updating session...`);
    try {
      await tx.session.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          accountId: account.id,
        },
        update: {
          accountId: account.id,
          updatedAt: new Date(),
        },
      });
      console.log(`Session updated`);
    } catch (sessionError: any) {
      console.error("Error updating session:", {
        error: sessionError,
        message: sessionError?.message,
        code: sessionError?.code,
        meta: sessionError?.meta,
        userId: user.id,
        accountId: account.id,
      });
      
      // Check if it's a foreign key constraint error
      if (sessionError?.code === "P2003") {
        throw new Error(`Foreign key constraint failed in session. User ID: ${user.id}, Account ID: ${account.id}. ${sessionError?.message || ""}`);
      }
      
      throw new Error(`Failed to update session: ${sessionError?.message || "Unknown error"}`);
    }

    return account;
  }, {
    timeout: 10000, // 10 second timeout
  });

  return result;
}

/**
 * Get S3 prefix for account-specific file organization
 * This ensures files are organized by account for better isolation and cleanup
 * 
 * @param accountId - The account ID
 * @returns S3 key prefix (e.g., "accounts/{accountId}/uploads/")
 */
export function getAccountS3Prefix(accountId: string): string {
  return `accounts/${accountId}/uploads/`;
}

/**
 * Clean up S3 files for an account when it's deleted
 * Note: This should be called before deleting the account from the database
 * 
 * @param accountId - The account ID to clean up
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupAccountS3Files(accountId: string): Promise<void> {
  // Note: S3 cleanup is handled at the asset level when assets are deleted
  // This function is a placeholder for future bulk cleanup if needed
  // For now, individual asset deletion handles S3 cleanup via cascade
  
  console.log(`S3 cleanup for account ${accountId} - handled by asset cascade deletion`);
  
  // If you need bulk S3 cleanup, you would:
  // 1. List all objects with prefix `accounts/${accountId}/`
  // 2. Delete them in batches
  // 3. This requires ListObjectsV2Command and batch DeleteObjectsCommand
}
