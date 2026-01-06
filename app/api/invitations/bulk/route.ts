import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { generateVerificationToken } from "@/lib/token-utils";
import { bulkInviteMemberSchema } from "@/lib/validations";
import sgMail from "@sendgrid/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helper function to send email via SendGrid - configured at runtime
async function sendBulkInvitationEmail(
  to: string,
  accountNames: string[],
  inviterName: string | null,
  role: string,
  inviteUrl: string
): Promise<{ success: boolean; error?: string }> {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM;

  if (!SENDGRID_API_KEY) {
    console.error("[Bulk Invitation Email] ❌ SENDGRID_API_KEY not set");
    return { success: false, error: "SENDGRID_API_KEY not configured" };
  }

  if (!EMAIL_FROM) {
    console.error("[Bulk Invitation Email] ❌ EMAIL_FROM not set");
    return { success: false, error: "FROM_EMAIL not configured" };
  }

  sgMail.setApiKey(SENDGRID_API_KEY);

  try {
    const accountList = accountNames.map(name => `<li><strong>${name}</strong></li>`).join("");
    const accountCount = accountNames.length;
    const accountText = accountCount === 1 ? "account" : "accounts";

    const msg = {
      to,
      from: EMAIL_FROM,
      subject: `You're invited to join ${accountCount} ${accountText} on Asset Organizer`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">You're Invited!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            ${inviterName || 'Someone'} has invited you to join the following ${accountText} on Asset Organizer:
          </p>
          <ul style="color: #666; font-size: 16px; line-height: 1.8; margin: 20px 0;">
            ${accountList}
          </ul>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            As a ${role.toLowerCase()}, you'll have access to collaborate on assets and projects in these ${accountText}.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitations & Sign In</a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Click the button above to sign in and join the teams. If you don't have an account yet, one will be created for you automatically.
          </p>
          <p style="color: #999; font-size: 12px;">
            These invitations will expire in 7 days.
          </p>
        </div>
      `,
    };

    await sgMail.send(msg);
    console.log("[Bulk Invitation Email] ✅ Email sent successfully to:", to);
    return { success: true };
  } catch (error: any) {
    console.error("[Bulk Invitation Email] ❌ SendGrid error:", error.message);
    return { 
      success: false, 
      error: error.response?.body?.errors?.[0]?.message || error.message 
    };
  }
}

/**
 * POST /api/invitations/bulk
 * Send invitations to a user for multiple accounts at once
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();

    // Validate request body
    const validation = bulkInviteMemberSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: "Invalid request", 
          details: validation.error.issues.map(issue => issue.message).join(", ")
        },
        { status: 400 }
      );
    }

    const { email, accountIds, role = "MEMBER" } = validation.data;

    // Verify user has permission to invite to all specified accounts
    const userAccounts = await prisma.userAccount.findMany({
      where: {
        userId,
        accountId: {
          in: accountIds
        },
        role: {
          in: ["OWNER", "ADMIN"]
        }
      },
      include: {
        account: true
      }
    });

    const accessibleAccountIds = userAccounts.map(ua => ua.accountId);
    const invalidAccountIds = accountIds.filter(id => !accessibleAccountIds.includes(id));

    if (invalidAccountIds.length > 0) {
      return NextResponse.json(
        { error: "You don't have permission to invite members to one or more of these accounts." },
        { status: 403 }
      );
    }

    // Check if user is already a member of any of these accounts
    const existingMembers = await prisma.userAccount.findMany({
      where: {
        accountId: {
          in: accountIds
        },
        user: { email }
      },
      include: {
        account: {
          select: {
            name: true
          }
        }
      }
    });

    if (existingMembers.length > 0) {
      const accountNames = existingMembers.map(m => m.account.name).join(", ");
      return NextResponse.json(
        { error: `User is already a member of: ${accountNames}` },
        { status: 409 }
      );
    }

    // Check for existing pending invitations
    const existingInvitations = await prisma.invitation.findMany({
      where: {
        email,
        accountId: {
          in: accountIds
        },
        status: "PENDING"
      },
      include: {
        account: {
          select: {
            name: true
          }
        }
      }
    });

    if (existingInvitations.length > 0) {
      const accountNames = existingInvitations.map(inv => inv.account.name).join(", ");
      return NextResponse.json(
        { error: `Pending invitations already exist for: ${accountNames}` },
        { status: 409 }
      );
    }

    // Filter out accounts with existing invitations
    const accountsToInvite = userAccounts.filter(
      ua => !existingInvitations.some(inv => inv.accountId === ua.accountId)
    );

    if (accountsToInvite.length === 0) {
      return NextResponse.json(
        { error: "No accounts available to invite to." },
        { status: 400 }
      );
    }

    // Generate tokens for login
    const { raw: loginTokenRaw, hashed: loginTokenHashed } = generateVerificationToken();
    const loginExpires = new Date();
    loginExpires.setDate(loginExpires.getDate() + 7); // Match invitation expiry (7 days instead of 24 hours)

    // Create invitations for each account
    const invitations = [];
    const accountNames = [];

    for (const userAccount of accountsToInvite) {
      const invitationToken = randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await prisma.invitation.create({
        data: {
          email,
          token: invitationToken,
          role: role as "MEMBER" | "ADMIN",
          expiresAt,
          invitedById: userId,
          accountId: userAccount.accountId,
        }
      });

      invitations.push(invitation);
      accountNames.push(userAccount.account.name);
    }

    // Delete any existing verification tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: email }
    });

    // Create a fresh NextAuth verification token for direct login
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: loginTokenHashed,
        expires: loginExpires,
      }
    });

    // Build the invitation URL
    // For bulk invitations, we'll use the first invitation token in the URL
    // The user can accept all invitations through the accept-invite flow
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const acceptInviteUrl = `/auth/accept-invite?token=${invitations[0].token}`;
    const inviteUrl = `${baseUrl}/api/auth/callback/email?email=${encodeURIComponent(email)}&token=${loginTokenRaw}&callbackUrl=${encodeURIComponent(acceptInviteUrl)}`;

    // Send email
    const emailResult = await sendBulkInvitationEmail(
      email,
      accountNames,
      session.user.name || null,
      role,
      inviteUrl
    );

    return NextResponse.json({
      invitations: invitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        accountId: inv.accountId,
        expiresAt: inv.expiresAt.toISOString(),
        status: inv.status,
      })),
      emailSent: emailResult.success,
      emailError: emailResult.error,
      message: emailResult.success 
        ? `Invitations sent successfully to ${accountNames.length} account${accountNames.length > 1 ? 's' : ''}`
        : "Invitations created but email may not have been sent. Check server logs.",
      ...(process.env.NODE_ENV === "development" && !emailResult.success ? { inviteUrl } : {}),
    });

  } catch (error: any) {
    console.error("[Bulk Invitation] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to send invitations",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
