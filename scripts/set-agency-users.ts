/**
 * Migration script to set specific users as AGENCY account type
 * 
 * Usage: npx tsx scripts/set-agency-users.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const agencyEmails = [
    "berteloot@gmail.com",
    "sberteloot@nytromarketing.com",
  ];

  console.log("Setting users as AGENCY account type...\n");

  for (const email of agencyEmails) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        console.log(`⚠️  User not found: ${email}`);
        continue;
      }

      if (user.accountType === "AGENCY") {
        console.log(`✓ User already set as AGENCY: ${email}`);
        continue;
      }

      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          accountType: "AGENCY",
        },
      });

      console.log(`✅ Set ${email} as AGENCY account type`);
      
      // Show existing account roles (preserve existing roles)
      const userAccounts = await prisma.userAccount.findMany({
        where: { userId: updatedUser.id },
        include: { account: true },
      });

      if (userAccounts.length > 0) {
        console.log(`  → User has ${userAccounts.length} account(s):`);
        for (const userAccount of userAccounts) {
          console.log(`    - ${userAccount.account.name} (Role: ${userAccount.role})`);
        }
      } else {
        console.log(`  → User has no accounts yet`);
      }
    } catch (error: any) {
      console.error(`❌ Error updating ${email}:`, error.message);
    }
  }

  console.log("\n✅ Migration completed!");
}

main()
  .catch((e) => {
    console.error("Error running migration:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
