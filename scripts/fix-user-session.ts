import "dotenv/config";
import { prisma } from "../lib/prisma";

async function fixUserSession() {
  const invitedEmail = "stan@sharemymeals.org";
  const targetAccountName = "Lean Solutions Group";
  
  console.log(`\nFixing session for ${invitedEmail} to point to ${targetAccountName}...\n`);
  
  // Find the user
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

  if (!user) {
    console.log("User not found!");
    return;
  }

  // Find the target account
  const targetAccount = user.userAccounts.find(ua => ua.account.name === targetAccountName);
  
  if (!targetAccount) {
    console.log(`User is not a member of ${targetAccountName}`);
    return;
  }

  console.log(`Target account ID: ${targetAccount.accountId}`);

  // Update the session
  const updatedSession = await prisma.session.update({
    where: { userId: user.id },
    data: { accountId: targetAccount.accountId }
  });

  console.log(`\n✅ Session updated!`);
  console.log(`Session now points to: ${targetAccount.account.name} (${updatedSession.accountId})`);

  await prisma.$disconnect();
}

fixUserSession().catch(console.error);
