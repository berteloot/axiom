import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import sgMail from "@sendgrid/mail";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/token-utils";
import { isAllowedEmailDomain, getEmailDomainError } from "@/lib/email-validation";

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM;

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limiting: max 5 codes per hour per email address
const MAX_CODES_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Generate a 6-digit code
function generateCode(): string {
  return randomInt(100000, 999999).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
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

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Rate limiting
    const rateLimit = checkRateLimit(normalizedEmail, MAX_CODES_PER_HOUR, RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: "Too many code requests. Please try again later.",
          retryAfter: Math.ceil((rateLimit.retryAfter || 60000) / 1000 / 60) // minutes
        },
        { status: 429 }
      );
    }

    // Generate 6-digit code
    const code = generateCode();
    const hashedCode = hashToken(code); // Hash the code for storage
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 10); // Code valid for 10 minutes

    console.log("[Send Code] Generating code for:", normalizedEmail);
    console.log("[Send Code] Code (first 3):", code.substring(0, 3) + "***");
    console.log("[Send Code] Expires:", expires.toISOString());

    // Delete any existing codes for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: normalizedEmail },
    });

    // Store the hashed code (using VerificationToken table)
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token: hashedCode,
        expires: expires,
      },
    });

    console.log("[Send Code] Code stored in database");

    // Send email with code
    if (SENDGRID_API_KEY && EMAIL_FROM) {
      try {
        const msg = {
          to: normalizedEmail,
          from: EMAIL_FROM,
          subject: "Your sign-in code for Asset Organizer",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333; text-align: center; margin-bottom: 30px;">Sign In to Asset Organizer</h1>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; text-align: center;">
                Enter this code to sign in:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; padding: 20px 40px; background-color: #f5f5f5; border-radius: 8px; border: 2px dashed #ccc;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
                </div>
              </div>
              
              <p style="color: #666; font-size: 14px; text-align: center;">
                This code expires in <strong>10 minutes</strong>.
              </p>
              
              <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </div>
          `,
          text: `Your sign-in code for Asset Organizer is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`,
          // Disable click tracking (no links anyway, but just in case)
          trackingSettings: {
            clickTracking: { enable: false, enableText: false },
            openTracking: { enable: false },
          },
        };

        await sgMail.send(msg);
        console.log("[Send Code] Email sent successfully to:", normalizedEmail);

        return NextResponse.json({
          success: true,
          message: "Code sent to your email",
          expiresIn: 10, // minutes
        });
      } catch (error: any) {
        console.error("[Send Code] SendGrid error:", error.message);
        console.error("[Send Code] SendGrid details:", error.response?.body || error);
        
        return NextResponse.json(
          { error: "Failed to send email. Please try again." },
          { status: 500 }
        );
      }
    } else {
      // Dev mode: log code to console
      console.log("🔐 [DEV MODE] Sign-in code:", code);
      console.log("📧 [DEV MODE] Would be sent to:", normalizedEmail);
      
      return NextResponse.json({
        success: true,
        message: "Code sent to your email",
        expiresIn: 10,
        // Only in dev mode, include the code for testing
        ...(process.env.NODE_ENV === "development" && { devCode: code }),
      });
    }
  } catch (error: any) {
    console.error("[Send Code] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
