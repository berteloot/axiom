import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Checking verification tokens...\n");
  
  const tokens = await prisma.verificationToken.findMany();
  console.log(`Found ${tokens.length} verification token(s):\n`);
  
  tokens.forEach((t, i) => {
    const isExpired = t.expires < new Date();
    console.log(`Token ${i + 1}:`);
    console.log(`  Identifier (email): ${t.identifier}`);
    console.log(`  Token: ${t.token}`);
    console.log(`  Token length: ${t.token.length}`);
    console.log(`  Expires: ${t.expires.toISOString()}`);
    console.log(`  Expired: ${isExpired}`);
    console.log('');
  });
  
  if (tokens.length === 0) {
    console.log("No tokens found. This could mean:");
    console.log("1. No invitations have been sent");
    console.log("2. All tokens have been consumed");
    console.log("3. Tokens were deleted");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
