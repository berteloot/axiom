import { NextAuthOptions } from "next-auth"
import { CustomPrismaAdapter } from "@/lib/auth-adapter"
import EmailProvider from "next-auth/providers/email"
import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"
import sgMail from "@sendgrid/mail"
import { getAccountType, removeAccountType } from "@/lib/account-type-store"

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.FROM_EMAIL || process.env.EMAIL_FROM; // Support both FROM_EMAIL and EMAIL_FROM

if (!EMAIL_FROM) {
  console.warn("⚠️  FROM_EMAIL (or EMAIL_FROM) environment variable is not set. Email sending will fail.");
}

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log("✅ SendGrid configured - emails will be sent via SendGrid");
} else {
  console.log("⚠️  SendGrid not configured - emails will be logged to console (DEV MODE)");
}

// Ensure NEXTAUTH_URL is always set
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

// NEXTAUTH_SECRET is required in production
// Note: Runtime validation is handled in instrumentation.ts (server startup)
// We only warn here to avoid breaking the build process
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
if (!NEXTAUTH_SECRET && process.env.NODE_ENV !== "production") {
  // In development, warn but allow (developer can use .env file)
  console.warn(
    "⚠️  WARNING: NEXTAUTH_SECRET environment variable is not set. " +
    "Add it to your .env file for development. " +
    "Generate with: openssl rand -base64 32"
  );
}

// Log configuration for debugging
if (process.env.NODE_ENV === "development") {
  console.log("🔐 NextAuth Config:");
  console.log("   NEXTAUTH_URL:", NEXTAUTH_URL);
  console.log("   NEXTAUTH_SECRET:", NEXTAUTH_SECRET ? "✅ Set" : "❌ Missing");
}

export const authOptions: NextAuthOptions = {
  adapter: CustomPrismaAdapter(),
  session: {
    strategy: "jwt",
  },
  secret: NEXTAUTH_SECRET || undefined, // NextAuth will handle missing secret in dev
  // Let NextAuth auto-detect the URL from the request
  // This avoids client-side URL construction issues
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
  },
  providers: [
    EmailProvider({
      // No SMTP server config - we use SendGrid via custom sendVerificationRequest
      // EMAIL_FROM must be set via environment variable (no hardcoded fallback)
      // Validation happens in sendVerificationRequest - this will be undefined if not set
      from: EMAIL_FROM,
      async sendVerificationRequest({
        identifier: email,
        url,
        provider: { from },
      }) {
        // Validate EMAIL_FROM is set before proceeding
        if (!EMAIL_FROM) {
          throw new Error("FROM_EMAIL (or EMAIL_FROM) environment variable is required but not set. Please set FROM_EMAIL in your environment variables.");
        }

        // Validate URL before using it
        if (!url || typeof url !== "string") {
          console.error("Invalid URL provided by NextAuth:", url);
          throw new Error("Failed to generate verification URL");
        }

        try {
          // Validate it's a proper URL
          new URL(url);
        } catch (e) {
          console.error("URL validation failed:", url, e);
          throw new Error("Invalid verification URL format");
        }

        // Send email via SendGrid if configured
        if (SENDGRID_API_KEY) {
          try {
            const msg = {
              to: email,
              from: EMAIL_FROM, // Always use EMAIL_FROM from environment variable
              subject: "Sign in to Asset Organizer",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h1 style="color: #333; text-align: center;">Welcome to Asset Organizer</h1>
                  <p style="color: #666; font-size: 16px; line-height: 1.5;">
                    Click the button below to sign in to your account:
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Sign In</a>
                  </div>
                  <p style="color: #666; font-size: 14px; margin-top: 20px;">
                    Or copy and paste this link into your browser:
                  </p>
                  <p style="color: #333; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">
                    ${url}
                  </p>
                  <p style="color: #666; font-size: 14px;">
                    If you didn't request this email, you can safely ignore it.
                  </p>
                  <p style="color: #999; font-size: 12px;">
                    This link will expire in 24 hours.
                  </p>
                </div>
              `,
              text: `Sign in to Asset Organizer\n\nClick this link to sign in:\n${url}\n\nThis link will expire in 24 hours.\n\nIf you didn't request this email, you can safely ignore it.`,
              // CRITICAL: Disable click tracking to prevent SendGrid from consuming the token
              trackingSettings: {
                clickTracking: { enable: false, enableText: false },
                openTracking: { enable: false },
              },
            };
            await sgMail.send(msg);
            console.log("✅ Verification email sent via SendGrid to:", email);
          } catch (error: any) {
            console.error("❌ SendGrid error:", error.message);
            console.error("SendGrid error details:", error.response?.body || error);
            
            // In dev mode, fall back to console logging
            if (process.env.NODE_ENV === "development") {
              console.log("🔄 [FALLBACK] SendGrid failed, logging URL to console:");
              console.log("🔗 Verification URL:", url);
              console.log("📋 Copy this URL and paste it in your browser to sign in");
            } else {
              // In production, re-throw the error
              throw error;
            }
          }
        } else {
          // Dev mode: log to console if SendGrid not configured
          if (process.env.NODE_ENV === "development") {
            console.log("🔄 [DEV MODE] SendGrid not configured, logging URL to console:");
            console.log("🔗 Verification URL:", url);
            console.log("📋 Copy this URL and paste it in your browser to sign in");
          } else {
            // In production, require SendGrid
            throw new Error("SendGrid not configured. Please set SENDGRID_API_KEY environment variable.");
          }
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Get user from database to include verification status
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! }
        })
        if (dbUser) {
          token.emailVerified = dbUser.emailVerified
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.emailVerified = token.emailVerified as string
      }
      return session
    },
    async signIn({ user, account, profile }) {
      // For passwordless email auth, clicking the email link IS the verification step
      // Don't block sign-in - the email link itself proves ownership
      // We mark email as verified in the signIn event instead
      return true
    },
  },
  events: {
    async createUser({ user }) {
      // Get accountType from temporary store (set during signup)
      const accountType = user.email ? getAccountType(user.email) : null;
      
      // Determine default account name based on accountType
      let accountName: string;
      if (accountType === "CORPORATE") {
        accountName = `${user.name || "My"} Organization`;
      } else if (accountType === "AGENCY") {
        accountName = `${user.name || "My"} Agency`;
      } else {
        // Legacy users or sign-in without signup (default to organization)
        accountName = `${user.name || "My"} Organization`;
      }

      // Update user with accountType and verification status
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: "PENDING",
          accountType: accountType || null,
        }
      })

      // Remove accountType from temporary store after use
      if (user.email && accountType) {
        removeAccountType(user.email);
      }

      // Set up default trial account for new users
      const trialEndDate = new Date()
      trialEndDate.setDate(trialEndDate.getDate() + 14) // 14 days trial

      const account = await prisma.account.create({
        data: {
          name: accountName,
          slug: `org-${randomBytes(4).toString('hex')}`,
          subscriptionStatus: "TRIAL",
          trialEndsAt: trialEndDate,
        }
      })

      await prisma.userAccount.create({
        data: {
          userId: user.id,
          accountId: account.id,
          role: "OWNER",
        }
      })

      // Set as current session
      await prisma.session.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          accountId: account.id,
        },
        update: {
          accountId: account.id,
        }
      })
    },
    async signIn({ user, account, profile }) {
      // Mark email as verified when user successfully signs in
      if (account?.provider === "email" && user.email) {
        await prisma.user.update({
          where: { email: user.email },
          data: {
            emailVerified: "VERIFIED",
            emailVerifiedAt: new Date(),
          }
        })
      }
    },
  },
}