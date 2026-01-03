import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Cleaning up all verification tokens...\n");
  
  const deleted = await prisma.verificationToken.deleteMany({});
  console.log(`Deleted ${deleted.count} token(s)`);
  
  // Verify
  const remaining = await prisma.verificationToken.count();
  console.log(`Remaining tokens: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
