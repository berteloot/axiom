import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import sgMail from "@sendgrid/mail";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/token-utils";

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM; // Support both FROM_EMAIL and EMAIL_FROM

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limiting: max 5 emails per hour per email address
const MAX_EMAILS_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Generate and store verification token (NextAuth compatible)
async function createVerificationToken(email: string) {
  // Generate raw token for URL
  const rawToken = randomBytes(32).toString("hex");
  // Hash token the same way NextAuth does (SHA256(token + NEXTAUTH_SECRET))
  const hashedToken = hashToken(rawToken);
  const expires = new Date();
  expires.setHours(expires.getHours() + 24); // 24 hours

  // Store in database using NextAuth's VerificationToken format
  // NextAuth hashes tokens before storing, so we must store the hashed version
  try {
    // Delete any existing tokens for this email first
    await (prisma as any).verificationToken.deleteMany({
      where: { identifier: email },
    });
    
    // Create new token with HASHED token (NextAuth will hash the URL token and compare)
    await (prisma as any).verificationToken.create({
      data: {
        identifier: email,
        token: hashedToken, // Store hashed token in DB
        expires: expires,
      },
    });
    
    console.log("[Send Verification] Token created:");
    console.log("[Send Verification] Raw token (for URL):", rawToken);
    console.log("[Send Verification] Hashed token (stored in DB):", hashedToken);
  } catch (error: any) {
    console.error("Error creating verification token:", error);
    console.error("Available Prisma models:", Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
    // In dev mode, still return a token even if DB fails (for testing)
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️  Database token creation failed, but continuing with generated token for testing");
      return { token: rawToken, expires };
    }
    throw error;
  }

  // Return raw token for URL (NextAuth will hash it when verifying)
  return { token: rawToken, expires };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, callbackUrl } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email address is required" },
        { status: 400 }
      );
    }

    // Rate limiting: prevent email spam/abuse
    const rateLimit = checkRateLimit(email, MAX_EMAILS_PER_HOUR, RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimit.retryAfter?.toString() || "3600",
          },
        }
      );
    }

    // Get base URL
    const baseUrl = process.env.NEXTAUTH_URL || 
                   request.headers.get("origin") || 
                   `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    // Construct callback URL
    const relativeCallbackUrl = callbackUrl || "/dashboard";
    const absoluteCallbackUrl = relativeCallbackUrl.startsWith("http")
      ? relativeCallbackUrl
      : `${baseUrl}${relativeCallbackUrl}`;

    // Validate EMAIL_FROM is set
    if (!EMAIL_FROM) {
      return NextResponse.json(
        { error: "FROM_EMAIL (or EMAIL_FROM) environment variable is required but not set" },
        { status: 500 }
      );
    }

    // Generate verification token
    const { token } = await createVerificationToken(email);

    // Construct NextAuth callback URL (format that NextAuth expects)
    const verificationUrl = `${baseUrl}/api/auth/callback/email?email=${encodeURIComponent(email)}&token=${token}&callbackUrl=${encodeURIComponent(absoluteCallbackUrl)}`;

    // Send email using SendGrid or log to console
    const emailContent = {
      to: email,
      from: EMAIL_FROM,
      subject: "Sign in to Asset Organizer",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; text-align: center;">Welcome to Asset Organizer</h1>
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

    if (SENDGRID_API_KEY) {
      try {
        await sgMail.send(emailContent);
        console.log("✅ Verification email sent via SendGrid to:", email);
        
        return NextResponse.json({
          success: true,
          message: "Verification email sent",
          // In dev mode, also return the URL for easy testing
          ...(process.env.NODE_ENV === "development"
            ? { verificationUrl }
            : {}),
        });
      } catch (error: any) {
        console.error("❌ SendGrid error:", error.message);
        console.error("SendGrid error details:", error.response?.body || error);
        
        // Extract detailed error message from SendGrid response
        const sendGridError = error.response?.body || error.message;
        let errorMessage = "Failed to send email via SendGrid";
        let errorDetails = sendGridError;

        // Common SendGrid errors with helpful messages
        if (sendGridError?.errors) {
          const firstError = sendGridError.errors[0];
          if (firstError?.message) {
            errorMessage = firstError.message;
            if (firstError.message.includes("sender") || firstError.message.includes("from")) {
              errorMessage = "Sender email not verified. Please verify your email address in SendGrid.";
            } else if (firstError.message.includes("permission") || firstError.message.includes("unauthorized")) {
              errorMessage = "SendGrid API key lacks permissions or is invalid.";
            } else if (firstError.message.includes("credits") || firstError.message.includes("quota")) {
              errorMessage = "SendGrid account has exceeded email limits.";
            }
          }
        }

        // In dev mode, still provide the URL as fallback, but show the error clearly
        if (process.env.NODE_ENV === "development") {
          console.log("🔄 [FALLBACK] SendGrid failed, logging URL to console:");
          console.log("🔗 Verification URL:", verificationUrl);
          
          return NextResponse.json({
            success: false,
            message: errorMessage,
            error: errorMessage,
            details: errorDetails,
            verificationUrl, // Still provide URL in dev mode for testing
            sendgridError: true,
          }, { status: 500 });
        }
        
        // In production, return proper error
        return NextResponse.json({
          success: false,
          message: errorMessage,
          error: errorMessage,
          sendgridError: true,
        }, { status: 500 });
      }
    } else {
      // SendGrid not configured - dev mode fallback
      if (process.env.NODE_ENV === "development") {
        console.log("🔄 [DEV MODE] SendGrid not configured, logging URL to console:");
        console.log("🔗 Verification URL:", verificationUrl);
        console.log("📧 Email content preview:", emailContent.html.substring(0, 200) + "...");
        
        return NextResponse.json({
          success: true,
          message: "Verification email URL generated (SendGrid not configured)",
          verificationUrl,
          devMode: true,
        });
      } else {
        // Production requires SendGrid
        return NextResponse.json({
          success: false,
          error: "Email service not configured. Please set SENDGRID_API_KEY environment variable.",
        }, { status: 500 });
      }
    }

  } catch (error: any) {
    console.error("Error in send-verification route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send verification email" },
      { status: 500 }
    );
  }
}
