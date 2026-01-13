import { NextRequest, NextResponse } from "next/server";
import { signIn } from "next-auth/react";
import { prisma } from "@/lib/prisma";
import sgMail from "@sendgrid/mail";
import { setAccountType } from "@/lib/account-type-store";
import { generateVerificationToken } from "@/lib/token-utils";
import { isAllowedEmailDomain, getEmailDomainError } from "@/lib/email-validation";

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM;

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/signup - Handle signup with account type
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, accountType, accountName, callbackUrl } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email address is required" },
        { status: 400 }
      );
    }

    // Check if email is from allowed domain
    if (!isAllowedEmailDomain(email)) {
      return NextResponse.json(
        { error: getEmailDomainError() },
        { status: 403 }
      );
    }

    if (!accountType || !["CORPORATE", "AGENCY"].includes(accountType)) {
      return NextResponse.json(
        { error: "Valid account type is required (CORPORATE or AGENCY)" },
        { status: 400 }
      );
    }

    // Validate account name
    if (!accountName || typeof accountName !== "string" || accountName.trim().length === 0) {
      return NextResponse.json(
        { error: `${accountType === "AGENCY" ? "Agency" : "Organization"} name is required` },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in instead." },
        { status: 409 }
      );
    }

    // Store accountType and accountName temporarily for retrieval in createUser event
    setAccountType(email, accountType, accountName.trim());

    // Store accountType temporarily in database (we'll use a simple approach)
    // We'll store it in a cookie-like mechanism or pass it in the callback URL
    // For now, we'll pass it in the callback URL as a query parameter

    // Generate verification token using NextAuth's approach
    // We'll use NextAuth's email provider but customize the callback URL
    const baseUrl = process.env.NEXTAUTH_URL || 
                   request.headers.get("origin") || 
                   "http://localhost:3000";

    // Create a custom callback URL that includes accountType
    const customCallbackUrl = callbackUrl || "/dashboard";
    const callbackUrlWithAccountType = `${customCallbackUrl}?accountType=${accountType}`;

    // Use NextAuth's signIn function which will trigger the email sending
    // But we need to customize the verification URL to include accountType
    // Since NextAuth's sendVerificationRequest doesn't give us direct access,
    // we'll need to modify the approach in lib/auth.ts to read accountType from callbackUrl

    // For now, let's create the verification token manually and send email
    // This is similar to what NextAuth does internally
    // NextAuth hashes tokens before storing, so we need raw (for URL) and hashed (for DB)
    const { raw: tokenRaw, hashed: tokenHashed } = generateVerificationToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24); // 24 hour expiry

    console.log("[Signup] Generated tokens:");
    console.log("[Signup] Raw token (for URL):", tokenRaw);
    console.log("[Signup] Hashed token (for DB):", tokenHashed);

    // Store the accountType with the verification token
    // We'll use a custom approach: store accountType in the callback URL
    // and parse it in the auth callback

    // Delete any existing verification tokens for this email first
    await prisma.verificationToken.deleteMany({
      where: { identifier: email }
    });

    // Create a fresh verification token with HASHED token
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: tokenHashed, // Store HASHED token in DB
        expires: expires,
      }
    });

    console.log("[Signup] ✅ Created verification token for:", email);

    // Construct verification URL with RAW token (NextAuth will hash it)
    const verificationUrl = `${baseUrl}/api/auth/callback/email?email=${encodeURIComponent(email)}&token=${tokenRaw}&callbackUrl=${encodeURIComponent(callbackUrlWithAccountType)}`;

    // Validate EMAIL_FROM is set
    if (!EMAIL_FROM) {
      return NextResponse.json(
        { error: "FROM_EMAIL (or EMAIL_FROM) environment variable is required but not set" },
        { status: 500 }
      );
    }

    // Send email
    const msg = {
      to: email,
      from: EMAIL_FROM,
      subject: "Sign up for Asset Organizer",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">Welcome to Asset Organizer</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            Click the button below to complete your sign-up and create your ${accountType === "CORPORATE" ? "corporate" : "agency"} account:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Complete Sign Up</a>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #333; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">
            ${verificationUrl}
          </p>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this email, you can safely ignore it.
          </p>
          <p style="color: #999; font-size: 12px;">
            This link will expire in 24 hours.
          </p>
        </div>
      `,
      text: `Sign up for Asset Organizer\n\nClick this link to complete your sign-up:\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nIf you didn't request this email, you can safely ignore it.`,
      // CRITICAL: Disable click tracking to prevent SendGrid from consuming the token
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: false },
      },
    };

    if (SENDGRID_API_KEY) {
      try {
        await sgMail.send(msg);
        console.log("✅ Sign-up email sent via SendGrid to:", email);
      } catch (error: any) {
        console.error("❌ SendGrid error:", error.message);
        if (process.env.NODE_ENV === "development") {
          console.log("🔄 [FALLBACK] SendGrid failed, logging URL to console:");
          console.log("🔗 Verification URL:", verificationUrl);
        } else {
          throw error;
        }
      }
    } else {
      if (process.env.NODE_ENV === "development") {
        console.log("🔄 [DEV MODE] SendGrid not configured, logging URL to console:");
        console.log("🔗 Verification URL:", verificationUrl);
        console.log("📧 Account Type:", accountType);
      } else {
        return NextResponse.json(
          { error: "SendGrid not configured. Please set SENDGRID_API_KEY environment variable." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Sign-up email sent successfully",
    });

  } catch (error: any) {
    console.error("Error in signup:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process sign-up request" },
      { status: 500 }
    );
  }
}
