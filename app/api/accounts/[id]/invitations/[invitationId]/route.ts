import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isUserAdminOrOwner } from "@/lib/account-utils";
import { randomBytes } from "crypto";
import sgMail from "@sendgrid/mail";
import { generateVerificationToken } from "@/lib/token-utils";

export const runtime = "nodejs";

// Helper function to send email via SendGrid - configured at runtime
async function sendInvitationEmail(
  to: string,
  accountName: string,
  inviterName: string | null,
  role: string,
  inviteUrl: string
): Promise<{ success: boolean; error?: string }> {
  // Get environment variables at runtime
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM;

  console.log("[Resend Invitation] Attempting to send...");
  console.log("[Resend Invitation] SENDGRID_API_KEY present:", !!SENDGRID_API_KEY);
  console.log("[Resend Invitation] EMAIL_FROM:", EMAIL_FROM);
  console.log("[Resend Invitation] To:", to);

  if (!SENDGRID_API_KEY) {
    console.error("[Resend Invitation] ❌ SENDGRID_API_KEY not set");
    return { success: false, error: "SENDGRID_API_KEY not configured" };
  }

  if (!EMAIL_FROM) {
    console.error("[Resend Invitation] ❌ EMAIL_FROM not set");
    return { success: false, error: "FROM_EMAIL not configured" };
  }

  // Configure SendGrid at runtime
  sgMail.setApiKey(SENDGRID_API_KEY);

  try {
    const msg = {
      to,
      from: EMAIL_FROM,
      subject: `You're invited to join ${accountName} on Asset Organizer`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">You're Invited!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            ${inviterName || 'Someone'} has invited you to join <strong>${accountName}</strong> on Asset Organizer.
          </p>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            As a ${role.toLowerCase()}, you'll have access to collaborate on assets and projects.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation & Sign In</a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Click the button above to sign in and join the team. If you don't have an account yet, one will be created for you automatically.
          </p>
          <p style="color: #999; font-size: 12px;">
            This invitation will expire in 7 days.
          </p>
        </div>
      `,
    };

    console.log("[Resend Invitation] Sending via SendGrid...");
    await sgMail.send(msg);
    console.log("[Resend Invitation] ✅ Email sent successfully to:", to);
    return { success: true };
  } catch (error: any) {
    console.error("[Resend Invitation] ❌ SendGrid error:", error.message);
    console.error("[Resend Invitation] Error details:", JSON.stringify(error.response?.body || error, null, 2));
    return { 
      success: false, 
      error: error.response?.body?.errors?.[0]?.message || error.message 
    };
  }
}

// DELETE /api/accounts/[id]/invitations/[invitationId] - Delete a pending invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const { id: accountId, invitationId } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify user has permission (admin/owner only)
    const hasPermission = await isUserAdminOrOwner(request);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only admins and owners can manage invitations." },
        { status: 403 }
      );
    }

    // Verify the account exists and user is a member
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId: session.user.id,
          accountId,
        }
      },
      include: { account: true }
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or you don't have access to it." },
        { status: 404 }
      );
    }

    // Verify the invitation exists and belongs to this account
    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        accountId,
      }
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Delete the invitation
    await prisma.invitation.delete({
      where: { id: invitationId }
    });

    return NextResponse.json({
      success: true,
      message: "Invitation deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting invitation:", error);
    return NextResponse.json(
      { error: "Failed to delete invitation" },
      { status: 500 }
    );
  }
}

// PATCH /api/accounts/[id]/invitations/[invitationId] - Resend an invitation
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const { id: accountId, invitationId } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify user has permission (admin/owner only)
    const hasPermission = await isUserAdminOrOwner(request);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only admins and owners can resend invitations." },
        { status: 403 }
      );
    }

    // Verify the account exists and user is a member
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId: session.user.id,
          accountId,
        }
      },
      include: { account: true }
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or you don't have access to it." },
        { status: 404 }
      );
    }

    // Get the invitation
    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        accountId,
      },
      include: {
        invitedBy: {
          select: { name: true, email: true }
        }
      }
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending invitations can be resent" },
        { status: 400 }
      );
    }

    // Generate new tokens and extend expiration
    const newInvitationToken = randomBytes(32).toString('hex');
    // Generate verification token - NextAuth hashes tokens before storing
    const { raw: loginTokenRaw, hashed: loginTokenHashed } = generateVerificationToken();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    const loginExpires = new Date();
    loginExpires.setHours(loginExpires.getHours() + 24);
    
    console.log("[Resend] Generated tokens:");
    console.log("[Resend] Raw token (for URL):", loginTokenRaw);
    console.log("[Resend] Hashed token (for DB):", loginTokenHashed);

    // Update invitation and create new verification token
    const updatedInvitation = await prisma.$transaction(async (tx) => {
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: {
          token: newInvitationToken,
          expiresAt,
        }
      });

      // Delete any existing verification tokens for this email first
      await tx.verificationToken.deleteMany({
        where: { identifier: invitation.email }
      });

      // Create a fresh verification token with HASHED token
      await tx.verificationToken.create({
        data: {
          identifier: invitation.email,
          token: loginTokenHashed, // Store HASHED token in DB
          expires: loginExpires,
        }
      });

      console.log("[Resend] ✅ Created verification token for:", invitation.email);
      console.log("[Resend] Hashed token stored in DB:", loginTokenHashed);

      return updated;
    });

    // Build the invitation URL with RAW token (NextAuth will hash it)
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const acceptInviteUrl = `/auth/accept-invite?token=${newInvitationToken}`;
    const inviteUrl = `${baseUrl}/api/auth/callback/email?email=${encodeURIComponent(invitation.email)}&token=${loginTokenRaw}&callbackUrl=${encodeURIComponent(acceptInviteUrl)}`;
    
    console.log("[Resend] URL will use raw token:", loginTokenRaw);
    console.log("[Resend] NextAuth will hash it to find:", loginTokenHashed);

    // Send email
    const emailResult = await sendInvitationEmail(
      invitation.email,
      userAccount.account.name,
      session.user.name || null,
      invitation.role,
      inviteUrl
    );

    return NextResponse.json({
      success: true,
      invitation: {
        id: updatedInvitation.id,
        email: updatedInvitation.email,
        role: updatedInvitation.role,
        expiresAt: updatedInvitation.expiresAt.toISOString(),
        status: updatedInvitation.status,
      },
      emailSent: emailResult.success,
      emailError: emailResult.error,
      message: emailResult.success ? "Invitation resent successfully" : "Invitation updated but email may not have been sent",
      ...(process.env.NODE_ENV === "development" && !emailResult.success ? { inviteUrl } : {}),
    });

  } catch (error: any) {
    console.error("Error resending invitation:", error);
    return NextResponse.json(
      { 
        error: "Failed to resend invitation",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
