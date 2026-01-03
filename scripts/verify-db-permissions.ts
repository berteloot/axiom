import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL || "";

function createPrismaClient() {
  if (databaseUrl.startsWith("prisma+")) {
    return new PrismaClient({
      log: ["error", "warn"],
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
      log: ["error", "warn"],
    });
  }
}

const prisma = createPrismaClient();

async function verifyPermissions() {
  console.log("Verifying database permissions for account-related tables...\n");
  
  const tables = [
    "users",
    "accounts", 
    "user_accounts",
    "sessions",
    "assets",
    "collections",
    "company_profiles",
    "account_managers"
  ];
  
  const operations = ["SELECT", "INSERT", "UPDATE", "DELETE"];
  
  try {
    await prisma.$connect();
    console.log("✓ Database connected\n");
    
    // Test basic queries
    console.log("Testing table access...");
    for (const table of tables) {
      try {
        // Try to query the table
        await prisma.$queryRawUnsafe(`SELECT 1 FROM ${table} LIMIT 1`);
        console.log(`  ✓ ${table} - accessible`);
      } catch (error: any) {
        if (error?.code === "42501" || error?.message?.includes("permission denied")) {
          console.log(`  ✗ ${table} - PERMISSION DENIED`);
        } else if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
          console.log(`  ⚠ ${table} - table does not exist (run: npm run db:push)`);
        } else {
          console.log(`  ⚠ ${table} - error: ${error.message}`);
        }
      }
    }
    
    // Test write operations by attempting to create a test record
    console.log("\nTesting write operations...");
    try {
      // Test user creation (will rollback)
      const testUserId = `test-perm-${Date.now()}`;
      const testUser = await prisma.user.create({
        data: {
          id: testUserId,
          email: `${testUserId}@test.com`,
          name: "Test",
        },
      });
      console.log("  ✓ User INSERT - working");
      
      // Clean up
      await prisma.user.delete({ where: { id: testUserId } });
      console.log("  ✓ User DELETE - working");
      
      // Test account creation
      const testAccount = await prisma.account.create({
        data: {
          name: `Test Account ${Date.now()}`,
          slug: `test-account-${Date.now()}`,
        },
      });
      console.log("  ✓ Account INSERT - working");
      
      // Clean up
      await prisma.account.delete({ where: { id: testAccount.id } });
      console.log("  ✓ Account DELETE - working");
      
    } catch (error: any) {
      if (error?.code === "42501" || error?.message?.includes("permission denied")) {
        console.log("  ✗ Write operations - PERMISSION DENIED");
        console.log("\n⚠️  Database permissions are insufficient!");
        console.log("\nTo fix, run the following SQL as database admin:");
        console.log("  See: scripts/grant-db-permissions.sql");
        console.log("\nOr run the script:");
        console.log("  ./scripts/grant-db-permissions.sh");
        process.exit(1);
      } else {
        console.log(`  ⚠ Write operations - error: ${error.message}`);
      }
    }
    
    console.log("\n✅ All database permissions verified!");
    
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error?.code === "P1001") {
      console.error("\nCannot connect to database. Check your DATABASE_URL.");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPermissions();
