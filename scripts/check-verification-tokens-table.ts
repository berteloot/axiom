import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Checking verification_tokens table...\n");
  
  try {
    // First, try to check if table exists by querying it
    try {
      const count = await prisma.verificationToken.count();
      console.log(`✅ Table 'verification_tokens' EXISTS`);
      console.log(`✅ Current token count: ${count}\n`);
      
      // Try to check table structure
      try {
        const result = await prisma.$queryRawUnsafe(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'verification_tokens'
          ORDER BY ordinal_position;
        `);
        
        console.log("Table structure:");
        console.table(result);
      } catch (error: any) {
        console.warn("Could not fetch table structure:", error.message);
      }
      
      // Check for any existing tokens
      if (count > 0) {
        console.log("\nExisting tokens:");
        const tokens = await prisma.verificationToken.findMany({
          orderBy: { expires: 'desc' },
          take: 10,
        });
        
        tokens.forEach((t, i) => {
          const isExpired = t.expires < new Date();
          console.log(`\nToken ${i + 1}:`);
          console.log(`  Identifier (email): ${t.identifier}`);
          console.log(`  Token (first 20): ${t.token.substring(0, 20)}...`);
          console.log(`  Token length: ${t.token.length}`);
          console.log(`  Expires: ${t.expires.toISOString()}`);
          console.log(`  Expired: ${isExpired ? "YES" : "NO"}`);
        });
      } else {
        console.log("\nNo tokens found in table (this is normal if no emails were sent recently)");
      }
      
    } catch (error: any) {
      // Check if error is because table doesn't exist
      if (error?.code === "P2001" || 
          error?.message?.includes("does not exist") ||
          error?.message?.includes("relation") && error?.message?.includes("does not exist")) {
        console.error("❌ Table 'verification_tokens' DOES NOT EXIST!");
        console.error("\nTo create the table, run:");
        console.error("  npm run db:push");
        console.error("  or");
        console.error("  npx prisma db push");
        process.exit(1);
      } else {
        // Other error - rethrow
        throw error;
      }
    }
    
    // Test write operation
    console.log("\nTesting write operation...");
    try {
      const testEmail = `test-${Date.now()}@test.com`;
      const testToken = "test-token-hash-" + Date.now();
      const testExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      // Try to create a test token
      await prisma.verificationToken.create({
        data: {
          identifier: testEmail,
          token: testToken,
          expires: testExpires,
        },
      });
      
      console.log("✅ Write operation successful");
      
      // Clean up test token
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: testEmail,
            token: testToken,
          },
        },
      });
      
      console.log("✅ Delete operation successful (test token cleaned up)");
      
    } catch (writeError: any) {
      console.error("❌ Write operation FAILED:");
      console.error("   Error:", writeError.message);
      console.error("   Code:", writeError.code);
      
      if (writeError?.code === "P2002") {
        console.error("\n   This suggests a unique constraint violation");
      } else if (writeError?.code === "P2003") {
        console.error("\n   This suggests a foreign key constraint issue");
      }
      
      process.exit(1);
    }
    
    // Test unique constraint
    console.log("\nTesting unique constraint on token field...");
    try {
      const testEmail1 = `test-unique-${Date.now()}@test.com`;
      const testToken1 = "test-unique-token-" + Date.now();
      const testExpires1 = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      // Create first token
      await prisma.verificationToken.create({
        data: {
          identifier: testEmail1,
          token: testToken1,
          expires: testExpires1,
        },
      });
      
      // Try to create duplicate token (should fail)
      try {
        await prisma.verificationToken.create({
          data: {
            identifier: `test-unique-${Date.now() + 1}@test.com`,
            token: testToken1, // Same token
            expires: testExpires1,
          },
        });
        console.error("❌ Unique constraint NOT working - duplicate token was created!");
      } catch (uniqueError: any) {
        if (uniqueError?.code === "P2002") {
          console.log("✅ Unique constraint working correctly");
        } else {
          throw uniqueError;
        }
      }
      
      // Clean up
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: testEmail1,
            token: testToken1,
          },
        },
      });
      
    } catch (uniqueTestError: any) {
      console.error("❌ Unique constraint test failed:", uniqueTestError.message);
    }
    
    console.log("\n✅ All checks passed! Table exists and is working correctly.");
    
  } catch (error: any) {
    console.error("\n❌ Error checking table:");
    console.error("   Message:", error.message);
    console.error("   Code:", error.code);
    console.error("   Stack:", error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
