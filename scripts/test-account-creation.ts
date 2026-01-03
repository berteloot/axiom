import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL || "";

function createPrismaClient() {
  if (databaseUrl.startsWith("prisma+")) {
    return new PrismaClient({
      log: ["query", "error", "warn"],
      accelerateUrl: databaseUrl,
    });
  } else {
    const pool = new Pool({ 
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: ["query", "error", "warn"],
    });
  }
}

const prisma = createPrismaClient();

async function testAccountCreation() {
  const testUserId = `test-user-${Date.now()}`;
  const testAccountName = `Test Account ${Date.now()}`;
  const testSlug = `test-account-${Date.now()}`;
  
  try {
    console.log("Testing account creation transaction...\n");
    console.log(`User ID: ${testUserId}`);
    console.log(`Account Name: ${testAccountName}`);
    console.log(`Slug: ${testSlug}\n`);
    
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      console.log("1. Creating user...");
      const user = await tx.user.create({
        data: {
          id: testUserId,
          email: `${testUserId}@test.com`,
          name: "Test User",
        },
      });
      console.log(`   ✓ User created: ${user.id}`);
      
      // Create account
      console.log("2. Creating account...");
      const account = await tx.account.create({
        data: {
          name: testAccountName,
          slug: testSlug,
        },
      });
      console.log(`   ✓ Account created: ${account.id}`);
      
      // Create user-account relationship
      console.log("3. Creating user-account relationship...");
      const userAccount = await tx.userAccount.create({
        data: {
          userId: user.id,
          accountId: account.id,
          role: "OWNER",
        },
      });
      console.log(`   ✓ UserAccount created: ${userAccount.id}`);
      
      // Create session
      console.log("4. Creating session...");
      const session = await tx.session.create({
        data: {
          userId: user.id,
          accountId: account.id,
        },
      });
      console.log(`   ✓ Session created: ${session.id}`);
      
      return account;
    }, {
      timeout: 10000,
    });
    
    console.log(`\n✅ Transaction successful! Account ID: ${result.id}`);
    
    // Clean up
    console.log("\nCleaning up test data...");
    await prisma.session.deleteMany({ where: { userId: testUserId } });
    await prisma.userAccount.deleteMany({ where: { userId: testUserId } });
    await prisma.account.delete({ where: { id: result.id } });
    await prisma.user.delete({ where: { id: testUserId } });
    console.log("✓ Cleanup complete");
    
  } catch (error: any) {
    console.error("\n❌ Transaction failed!");
    console.error("Error:", error.message);
    console.error("Code:", error.code);
    console.error("Meta:", JSON.stringify(error.meta, null, 2));
    console.error("Stack:", error.stack);
    
    // Try to clean up any partial data
    try {
      await prisma.session.deleteMany({ where: { userId: testUserId } });
      await prisma.userAccount.deleteMany({ where: { userId: testUserId } });
      await prisma.account.deleteMany({ where: { slug: testSlug } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testAccountCreation();
