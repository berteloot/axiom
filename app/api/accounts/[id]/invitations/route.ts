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
  // Get environment variables at runtime (not module load time)
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM;

  console.log("[Invitation Email] Attempting to send...");
  console.log("[Invitation Email] SENDGRID_API_KEY present:", !!SENDGRID_API_KEY);
  console.log("[Invitation Email] EMAIL_FROM:", EMAIL_FROM);
  console.log("[Invitation Email] To:", to);

  if (!SENDGRID_API_KEY) {
    console.error("[Invitation Email] ❌ SENDGRID_API_KEY not set");
    return { success: false, error: "SENDGRID_API_KEY not configured" };
  }

  if (!EMAIL_FROM) {
    console.error("[Invitation Email] ❌ EMAIL_FROM not set");
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

    console.log("[Invitation Email] Sending via SendGrid...");
    await sgMail.send(msg);
    console.log("[Invitation Email] ✅ Email sent successfully to:", to);
    return { success: true };
  } catch (error: any) {
    console.error("[Invitation Email] ❌ SendGrid error:", error.message);
    console.error("[Invitation Email] Error details:", JSON.stringify(error.response?.body || error, null, 2));
    return { 
      success: false, 
      error: error.response?.body?.errors?.[0]?.message || error.message 
    };
  }
}

// POST /api/accounts/[id]/invitations - Send invitation to join account
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;

    // Verify user has permission to invite (admin/owner only)
    const hasPermission = await isUserAdminOrOwner(request);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only admins and owners can send invitations." },
        { status: 403 }
      );
    }

    // Verify the account exists and user is a member
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
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

    const body = await request.json();
    const { email, role = "MEMBER" } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email address is required" },
        { status: 400 }
      );
    }

    if (!["MEMBER", "ADMIN"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be MEMBER or ADMIN." },
        { status: 400 }
      );
    }

    // Check if user is already a member of this account
    const existingMember = await prisma.userAccount.findFirst({
      where: {
        accountId,
        user: { email }
      }
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this account." },
        { status: 409 }
      );
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email,
        accountId,
        status: "PENDING"
      }
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: "An invitation has already been sent to this email address." },
        { status: 409 }
      );
    }

    // Generate secure tokens
    const invitationToken = randomBytes(32).toString('hex');
    // Generate verification token - NextAuth hashes tokens before storing
    // So we need raw token for URL and hashed token for database
    const { raw: loginTokenRaw, hashed: loginTokenHashed } = generateVerificationToken();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry for invitation
    
    const loginExpires = new Date();
    loginExpires.setHours(loginExpires.getHours() + 24); // 24 hours for login token
    
    console.log("[Invitation] Generated tokens:");
    console.log("[Invitation] Raw token (for URL):", loginTokenRaw);
    console.log("[Invitation] Hashed token (for DB):", loginTokenHashed);

    // Create invitation first
    const invitation = await prisma.invitation.create({
      data: {
        email,
        token: invitationToken,
        role: role as "MEMBER" | "ADMIN",
        expiresAt,
        invitedById: userId,
        accountId,
      }
    });

    // Delete any existing verification tokens for this email
    const deletedCount = await prisma.verificationToken.deleteMany({
      where: { identifier: email }
    });
    console.log("[Invitation] Deleted existing tokens:", deletedCount.count);

    // Create a fresh NextAuth verification token for direct login
    // IMPORTANT: Store the HASHED token in the database (NextAuth hashes tokens before lookup)
    const verificationToken = await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: loginTokenHashed, // Store HASHED token in DB
        expires: loginExpires,
      }
    });

    console.log("[Invitation] ✅ Created verification token");
    console.log("[Invitation] Identifier (email):", email);
    console.log("[Invitation] Hashed token stored in DB:", loginTokenHashed);
    console.log("[Invitation] Token expires:", loginExpires.toISOString());

    // Build the invitation URL that ALSO logs the user in
    // IMPORTANT: Use RAW token in URL (NextAuth will hash it before looking up)
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const acceptInviteUrl = `/auth/accept-invite?token=${invitationToken}`;
    const inviteUrl = `${baseUrl}/api/auth/callback/email?email=${encodeURIComponent(email)}&token=${loginTokenRaw}&callbackUrl=${encodeURIComponent(acceptInviteUrl)}`;
    
    console.log("[Invitation] ========== URL Details ==========");
    console.log("[Invitation] Full URL:", inviteUrl);
    console.log("[Invitation] Email in URL:", encodeURIComponent(email));
    console.log("[Invitation] Raw token in URL:", loginTokenRaw);
    console.log("[Invitation] (NextAuth will hash this to find:", loginTokenHashed, ")");
    console.log("[Invitation] ================================");

    // Send email via SendGrid
    const emailResult = await sendInvitationEmail(
      email,
      userAccount.account.name,
      session.user.name || null,
      role,
      inviteUrl
    );

    if (!emailResult.success) {
      // In development, log the URL for testing
      if (process.env.NODE_ENV === "development") {
        console.log("🔗 [DEV] Invite URL (email failed):", inviteUrl);
      }
      
      // Still return success but indicate email might not have been sent
      return NextResponse.json({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt.toISOString(),
          status: invitation.status,
        },
        emailSent: false,
        emailError: emailResult.error,
        // Include invite URL in dev mode for manual testing
        ...(process.env.NODE_ENV === "development" ? { inviteUrl } : {}),
        message: "Invitation created but email may not have been sent. Check server logs.",
      });
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        status: invitation.status,
      },
      emailSent: true,
      message: "Invitation sent successfully",
    });

  } catch (error: any) {
    console.error("[Invitation] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to send invitation",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// GET /api/accounts/[id]/invitations - List pending invitations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;

    // Verify user has permission to view invitations (admin/owner only)
    const hasPermission = await isUserAdminOrOwner(request);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only admins and owners can view invitations." },
        { status: 403 }
      );
    }

    // Verify the account exists and user is a member
    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId,
        }
      }
    });

    if (!userAccount) {
      return NextResponse.json(
        { error: "Account not found or you don't have access to it." },
        { status: 404 }
      );
    }

    const invitations = await prisma.invitation.findMany({
      where: {
        accountId,
        status: "PENDING"
      },
      include: {
        invitedBy: {
          select: { name: true, email: true }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({ invitations });

  } catch (error) {
    console.error("Error fetching invitations:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}
