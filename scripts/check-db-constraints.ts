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

async function checkConstraints() {
  try {
    console.log("Checking database constraints...\n");
    
    // Check if tables exist
    console.log("1. Checking if tables exist...");
    const tables = ["users", "accounts", "user_accounts", "sessions"];
    for (const table of tables) {
      try {
        const result = await prisma.$queryRawUnsafe(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, table);
        console.log(`   ${table}: ${result ? "✓ exists" : "✗ missing"}`);
      } catch (e: any) {
        console.log(`   ${table}: ✗ error - ${e.message}`);
      }
    }
    
    // Check foreign key constraints
    console.log("\n2. Checking foreign key constraints...");
    const fkQuery = `
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('user_accounts', 'sessions')
      ORDER BY tc.table_name, kcu.column_name;
    `;
    
    const fks = await prisma.$queryRawUnsafe(fkQuery) as any[];
    console.log(`   Found ${fks.length} foreign key constraints:`);
    fks.forEach(fk => {
      console.log(`   - ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    
    // Test creating a user
    console.log("\n3. Testing user creation...");
    const testUserId = `test-${Date.now()}`;
    try {
      const testUser = await prisma.user.create({
        data: {
          id: testUserId,
          email: `${testUserId}@test.com`,
          name: "Test User",
        },
      });
      console.log(`   ✓ User created: ${testUser.id}`);
      
      // Clean up
      await prisma.user.delete({ where: { id: testUserId } });
      console.log(`   ✓ Test user cleaned up`);
    } catch (e: any) {
      console.log(`   ✗ Error: ${e.message}`);
      console.log(`   Code: ${e.code}`);
    }
    
    console.log("\n✅ Database constraint check complete");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkConstraints();
