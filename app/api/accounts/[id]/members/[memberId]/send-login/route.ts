import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isUserAdminOrOwner } from "@/lib/account-utils";
import sgMail from "@sendgrid/mail";
import { generateVerificationToken } from "@/lib/token-utils";

export const runtime = "nodejs";

// Helper function to send login email via SendGrid - configured at runtime
async function sendLoginEmail(
  to: string,
  inviterName: string | null,
  verificationUrl: string
): Promise<{ success: boolean; error?: string }> {
  // Get environment variables at runtime
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM;

  console.log("[Send Login Email] Attempting to send...");
  console.log("[Send Login Email] SENDGRID_API_KEY present:", !!SENDGRID_API_KEY);
  console.log("[Send Login Email] EMAIL_FROM:", EMAIL_FROM);
  console.log("[Send Login Email] To:", to);

  if (!SENDGRID_API_KEY) {
    console.error("[Send Login Email] ❌ SENDGRID_API_KEY not set");
    return { success: false, error: "SENDGRID_API_KEY not configured" };
  }

  if (!EMAIL_FROM) {
    console.error("[Send Login Email] ❌ EMAIL_FROM not set");
    return { success: false, error: "FROM_EMAIL not configured" };
  }

  // Configure SendGrid at runtime
  sgMail.setApiKey(SENDGRID_API_KEY);

  try {
    const msg = {
      to,
      from: EMAIL_FROM,
      subject: "Sign in to Asset Organizer",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">Welcome to Asset Organizer</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            ${inviterName || 'An administrator'} has requested a sign-in link for your account.
          </p>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            Click the button below to sign in to your account:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Sign In</a>
          </div>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this email, you can safely ignore it.
          </p>
          <p style="color: #999; font-size: 12px;">
            This link will expire in 24 hours.
          </p>
        </div>
      `,
    };

    console.log("[Send Login Email] Sending via SendGrid...");
    await sgMail.send(msg);
    console.log("[Send Login Email] ✅ Email sent successfully to:", to);
    return { success: true };
  } catch (error: any) {
    console.error("[Send Login Email] ❌ SendGrid error:", error.message);
    console.error("[Send Login Email] Error details:", JSON.stringify(error.response?.body || error, null, 2));
    return { 
      success: false, 
      error: error.response?.body?.errors?.[0]?.message || error.message 
    };
  }
}

// POST /api/accounts/[id]/members/[memberId]/send-login - Send login email to existing team member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: accountId, memberId } = await params;
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
        { error: "Insufficient permissions. Only admins and owners can send login emails." },
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

    // Verify the member exists and belongs to this account
    const memberAccount = await prisma.userAccount.findUnique({
      where: { id: memberId },
      include: {
        user: true
      }
    });

    if (!memberAccount) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    if (memberAccount.accountId !== accountId) {
      return NextResponse.json(
        { error: "Team member does not belong to this account" },
        { status: 403 }
      );
    }

    // Generate verification token - NextAuth hashes tokens before storing
    const { raw: tokenRaw, hashed: tokenHashed } = generateVerificationToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24); // 24 hour expiry

    console.log("[Send Login] Generated tokens:");
    console.log("[Send Login] Raw token (for URL):", tokenRaw);
    console.log("[Send Login] Hashed token (for DB):", tokenHashed);

    // Delete any existing verification tokens for this email first
    await prisma.verificationToken.deleteMany({
      where: { identifier: memberAccount.user.email }
    });

    // Create a fresh verification token with HASHED token
    await prisma.verificationToken.create({
      data: {
        identifier: memberAccount.user.email,
        token: tokenHashed, // Store HASHED token in DB
        expires: expires,
      }
    });

    console.log("[Send Login] ✅ Created verification token for:", memberAccount.user.email);

    // Construct verification URL with RAW token (NextAuth will hash it)
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const verificationUrl = `${baseUrl}/api/auth/callback/email?email=${encodeURIComponent(memberAccount.user.email)}&token=${tokenRaw}&callbackUrl=${encodeURIComponent("/dashboard")}`;
    
    console.log("[Send Login] URL will use raw token:", tokenRaw);
    console.log("[Send Login] NextAuth will hash it to find:", tokenHashed);

    // Send email
    const emailResult = await sendLoginEmail(
      memberAccount.user.email,
      session.user.name || null,
      verificationUrl
    );

    if (!emailResult.success) {
      // In development, log the URL for testing
      if (process.env.NODE_ENV === "development") {
        console.log("🔗 [DEV] Verification URL (email failed):", verificationUrl);
      }
    }

    return NextResponse.json({
      success: emailResult.success,
      message: emailResult.success ? "Login email sent successfully" : "Failed to send login email",
      emailError: emailResult.error,
      ...(process.env.NODE_ENV === "development" && !emailResult.success ? { verificationUrl } : {}),
    });

  } catch (error: any) {
    console.error("Error sending login email:", error);
    return NextResponse.json(
      { 
        error: "Failed to send login email",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
