import { NextAuthOptions } from "next-auth"
import { CustomPrismaAdapter } from "@/lib/auth-adapter"
import EmailProvider from "next-auth/providers/email"
import { prisma } from "@/lib/prisma"
import { randomBytes, createHash } from "crypto"
import sgMail from "@sendgrid/mail"
import { getAccountType, getAccountName, removeAccountType } from "@/lib/account-type-store"

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

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

// In production, this MUST be set and stable across all instances.
// If it changes between issuing and consuming the email link, the verification token lookup will fail.
if (!NEXTAUTH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ CRITICAL: NEXTAUTH_SECRET is missing in production.");
    console.error("❌ Email magic links will fail because token hashing will not be consistent.");
    throw new Error("NEXTAUTH_SECRET is required in production");
  }

  // In development, warn but allow (developer can use .env file)
  console.warn(
    "⚠️  WARNING: NEXTAUTH_SECRET environment variable is not set. " +
    "Add it to your .env file for development. " +
    "Generate with: openssl rand -base64 32"
  );
}

// Log configuration for debugging (always log in production to verify URL)
console.log("🔐 NextAuth Config:");
console.log("   NEXTAUTH_URL:", NEXTAUTH_URL);
console.log("   NEXTAUTH_SECRET:", NEXTAUTH_SECRET ? "✅ Set" : "❌ Missing");
if (NEXTAUTH_URL.includes("localhost") && process.env.NODE_ENV === "production") {
  console.error("❌ CRITICAL: NEXTAUTH_URL is set to localhost in production!");
  console.error("❌ This will cause verification links to use localhost URLs");
  console.error("❌ Please set NEXTAUTH_URL to your production domain in Render environment variables");
}

export const authOptions: NextAuthOptions = {
  // Enable debug mode to see NextAuth's internal flow
  debug: process.env.NODE_ENV !== "production" || process.env.NEXTAUTH_DEBUG === "true",
  adapter: CustomPrismaAdapter(),
  session: {
    strategy: "jwt",
  },
  secret: NEXTAUTH_SECRET || undefined, // NextAuth will handle missing secret in dev
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
      console.log("📧 [EmailProvider] ========================================");
      console.log("📧 [EmailProvider] sendVerificationRequest called for:", email);
      console.log("📧 [EmailProvider] URL provided by NextAuth:", url);
      console.log("📧 [EmailProvider] Email will be sent from:", EMAIL_FROM);
      console.log("📧 [EmailProvider] NOTE: NextAuth should have called createVerificationToken BEFORE this");
      console.log("📧 [EmailProvider] Check logs above for 'createVerificationToken' logs");
      console.log("📧 [EmailProvider] ========================================");
      
      // Log token hashing for verification and diagnose casing issues
      try {
        const urlObj = new URL(url);
        const rawTokenFromUrl = urlObj.searchParams.get("token") || "";
        const emailFromUrl = urlObj.searchParams.get("email") || "";

        const normalizedIdentifier = (email || "").trim().toLowerCase();
        if (email && normalizedIdentifier !== email) {
          console.warn("⚠️  [EmailProvider] Identifier has uppercase or whitespace. Consider normalizing at sign-in form and in adapter.");
          console.warn("⚠️  [EmailProvider] Identifier provided:", email);
          console.warn("⚠️  [EmailProvider] Identifier normalized:", normalizedIdentifier);
        }
        if (emailFromUrl && normalizedIdentifier && emailFromUrl !== normalizedIdentifier) {
          console.warn("⚠️  [EmailProvider] Email param in URL differs from normalized identifier:", emailFromUrl);
        }

        if (rawTokenFromUrl && NEXTAUTH_SECRET) {
          // NextAuth hashes the raw token with the secret before persisting/looking it up via the adapter.
          const expectedHash = createHash("sha256")
            .update(`${rawTokenFromUrl}${NEXTAUTH_SECRET}`)
            .digest("hex");
          console.log("📧 [EmailProvider] Raw token in URL (first 20):", rawTokenFromUrl.substring(0, 20));
          console.log("📧 [EmailProvider] Expected hash for adapter lookup (first 20):", expectedHash.substring(0, 20));
        }
      } catch (e) {
        console.warn("⚠️  [EmailProvider] Failed to parse verification URL for diagnostics:", e);
      }
        
        // Validate EMAIL_FROM is set before proceeding
        if (!EMAIL_FROM) {
          console.error("❌ [EmailProvider] EMAIL_FROM is not set!");
          throw new Error("FROM_EMAIL (or EMAIL_FROM) environment variable is required but not set. Please set FROM_EMAIL in your environment variables.");
        }

        // Validate URL before using it
        if (!url || typeof url !== "string") {
          console.error("Invalid URL provided by NextAuth:", url);
          throw new Error("Failed to generate verification URL");
        }

        // CRITICAL FIX: Replace localhost URLs with production URL
        // NextAuth sometimes generates localhost URLs even in production
        if (url.includes("localhost") && NEXTAUTH_URL && !NEXTAUTH_URL.includes("localhost")) {
          console.warn("⚠️  NextAuth generated localhost URL, replacing with NEXTAUTH_URL");
          console.warn("⚠️  Original URL:", url);
          // Replace localhost with the production URL
          const urlObj = new URL(url);
          const productionUrl = new URL(NEXTAUTH_URL);
          url = url.replace(urlObj.origin, productionUrl.origin);
          console.warn("⚠️  Fixed URL:", url);
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
            console.log("📧 [EmailProvider] Sending email via SendGrid...");
            await sgMail.send(msg);
            console.log("✅ [EmailProvider] Verification email sent via SendGrid to:", email);
            console.log("📧 [EmailProvider] Verification URL in email:", url);
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
    async jwt({ token, user, trigger }) {
      console.log("🔄 [JWT Callback] Called with trigger:", trigger || "initial");
      if (user) {
        console.log("🔄 [JWT Callback] User object present, email:", user.email, "id:", user.id);
        // CRITICAL: Set token.sub FIRST before any database calls
        // token.sub is required for session callback to work
        token.sub = user.id
        token.email = user.email || undefined
        
        try {
          // Get user from database to include verification status
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email! }
          })
          if (dbUser) {
            console.log("✅ [JWT Callback] Found user, emailVerified:", dbUser.emailVerified);
            token.emailVerified = dbUser.emailVerified
          } else {
            console.warn("⚠️  [JWT Callback] User not found in database:", user.email);
            // Still allow authentication even if database lookup fails
            token.emailVerified = "UNVERIFIED"
          }
        } catch (error) {
          console.error("❌ [JWT Callback] Error fetching user from database:", error);
          // Don't fail the JWT callback if database query fails
          // The user will still be authenticated, just without emailVerified status
          token.emailVerified = "UNVERIFIED"
        }
      } else {
        console.log("🔄 [JWT Callback] No user object, using existing token");
        console.log("🔄 [JWT Callback] Existing token sub:", token.sub);
      }
      
      if (!token.sub) {
        console.error("❌ [JWT Callback] WARNING: token.sub is not set! This will cause session creation to fail.");
      }
      
      console.log("🔄 [JWT Callback] Returning token with sub:", token.sub, "email:", token.email, "emailVerified:", token.emailVerified);
      return token
    },
    async session({ session, token }) {
      console.log("🔄 [Session Callback] Called");
      console.log("🔄 [Session Callback] Token sub:", token.sub);
      console.log("🔄 [Session Callback] Token emailVerified:", token.emailVerified);
      if (session.user) {
        if (!token.sub) {
          console.error("❌ [Session Callback] Token.sub is missing!");
        }
        session.user.id = token.sub!
        session.user.emailVerified = (token.emailVerified as string) || "UNVERIFIED"
        console.log("✅ [Session Callback] Session created for user:", session.user.email, "id:", session.user.id);
      } else {
        console.error("❌ [Session Callback] session.user is missing!");
      }
      return session
    },
    async signIn({ user, account, profile }) {
      // For passwordless email auth, clicking the email link IS the verification step
      // Don't block sign-in - the email link itself proves ownership
      // We mark email as verified in the signIn event instead
      try {
        console.log("✅ [SignIn Callback] User signing in:", user.email);
        console.log("✅ [SignIn Callback] User ID:", user.id);
        console.log("✅ [SignIn Callback] Account provider:", account?.provider);
        return true;
      } catch (error) {
        console.error("❌ [SignIn Callback] Error during sign-in:", error);
        // Return false to block sign-in on error, or true to allow
        // For now, we'll allow it since the token verification already happened
        return true;
      }
    },
    async redirect({ url, baseUrl }) {
      console.log("🔄 [Redirect Callback] Called");
      console.log("🔄 [Redirect Callback] URL:", url);
      console.log("🔄 [Redirect Callback] Base URL:", baseUrl);
      
      // If redirecting to error page, allow it (don't override)
      if (url.includes("/auth/error")) {
        console.log("⚠️  [Redirect Callback] NextAuth is redirecting to error page - allowing it");
        console.log("⚠️  [Redirect Callback] This suggests authentication failed");
        return url;
      }
      
      // If url is relative, make it absolute
      if (url.startsWith("/")) {
        const redirectUrl = `${baseUrl}${url}`;
        console.log("✅ [Redirect Callback] Redirecting to:", redirectUrl);
        return redirectUrl;
      }
      // If url is on the same origin, allow it
      if (new URL(url).origin === baseUrl) {
        console.log("✅ [Redirect Callback] Redirecting to same origin:", url);
        return url;
      }
      // Default to dashboard
      const defaultUrl = `${baseUrl}/dashboard`;
      console.log("✅ [Redirect Callback] Default redirect to:", defaultUrl);
      return defaultUrl;
    },
  },
  events: {
    async createUser({ user }) {
      // Get accountType from temporary store (set during signup)
      const accountType = user.email ? getAccountType(user.email) : null;
      
      // Get accountName from temporary store (set during signup)
      const storedAccountName = user.email ? getAccountName(user.email) : null;
      
      // Use stored account name if available, otherwise fall back to default
      let accountName: string;
      if (storedAccountName) {
        accountName = storedAccountName;
      } else {
        // Fallback to default naming if name wasn't provided during signup
        if (accountType === "CORPORATE") {
          accountName = `${user.name || "My"} Organization`;
        } else if (accountType === "AGENCY") {
          accountName = `${user.name || "My"} Agency`;
        } else {
          // Legacy users or sign-in without signup (default to organization)
          accountName = `${user.name || "My"} Organization`;
        }
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
        try {
          console.log("✅ [SignIn Event] Marking email as verified for:", user.email);
          await prisma.user.update({
            where: { email: user.email },
            data: {
              emailVerified: "VERIFIED",
              emailVerifiedAt: new Date(),
            }
          });
          console.log("✅ [SignIn Event] Email marked as verified");
        } catch (error) {
          console.error("❌ [SignIn Event] Error marking email as verified:", error);
          // Don't throw - we don't want to block authentication if this fails
          // The user can still sign in, we'll just mark it as verified later
        }
      }
    },
  },
}