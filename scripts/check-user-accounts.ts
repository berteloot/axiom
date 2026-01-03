import "dotenv/config";
import { prisma } from "../lib/prisma";

async function checkUserAccounts() {
  // Find the invited user
  const invitedEmail = "stan@sharemymeals.org";
  
  console.log(`\n=== Checking user: ${invitedEmail} ===\n`);
  
  const user = await prisma.user.findUnique({
    where: { email: invitedEmail },
    include: {
      userAccounts: {
        include: {
          account: true
        }
      },
    }
  });
  
  // Get session separately
  const session = await prisma.session.findFirst({
    where: { userId: user?.id }
  });

  if (!user) {
    console.log("User not found!");
    return;
  }

  console.log("User ID:", user.id);
  console.log("User Name:", user.name);
  console.log("User Email:", user.email);
  console.log("Account Type:", user.accountType);
  console.log("\nCurrent Session Account ID:", session?.accountId);
  
  console.log("\n=== User's Accounts ===");
  for (const ua of user.userAccounts) {
    console.log(`\n- Account: ${ua.account.name}`);
    console.log(`  ID: ${ua.accountId}`);
    console.log(`  Role: ${ua.role}`);
    console.log(`  Joined: ${ua.createdAt}`);
  }

  // Check invitations for this user
  console.log("\n=== Invitations ===");
  const invitations = await prisma.invitation.findMany({
    where: { email: invitedEmail },
    include: {
      account: true,
    }
  });

  for (const inv of invitations) {
    console.log(`\n- Invitation to: ${inv.account.name}`);
    console.log(`  Account ID: ${inv.accountId}`);
    console.log(`  Status: ${inv.status}`);
    console.log(`  Accepted: ${inv.acceptedAt}`);
  }

  // Check which account is the session pointing to
  if (session) {
    const sessionAccount = await prisma.account.findUnique({
      where: { id: session.accountId }
    });
    console.log(`\n=== Current Session Account ===`);
    console.log(`Name: ${sessionAccount?.name}`);
    console.log(`ID: ${sessionAccount?.id}`);
  }

  await prisma.$disconnect();
}

checkUserAccounts().catch(console.error);
