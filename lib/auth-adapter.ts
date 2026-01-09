import { Adapter, AdapterUser, AdapterAccount } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";

/**
 * Custom NextAuth adapter for our schema
 * 
 * Our schema differs from NextAuth's default expectations:
 * - User.emailVerified is an enum (UNVERIFIED, VERIFIED, PENDING) not DateTime
 * - Account model is for organizations, not OAuth providers
 * - Session model is for account selection, not auth sessions
 * 
 * For email-only auth, we only need: createUser, getUser, getUserByEmail, 
 * createVerificationToken, useVerificationToken
 */
export function CustomPrismaAdapter(): Adapter {
  return {
    // Create a new user
    async createUser(user: Omit<AdapterUser, "id">) {
      console.log("🔧 [Adapter] createUser called with:", user.email);
      try {
        const dbUser = await prisma.user.create({
          data: {
            email: user.email,
            name: user.name,
            emailVerified: "PENDING", // Our enum value
          },
        });
        console.log("✅ [Adapter] User created:", dbUser.id);

        return {
          id: dbUser.id,
          email: dbUser.email,
          emailVerified: dbUser.emailVerifiedAt, // Return DateTime for NextAuth
          name: dbUser.name,
        };
      } catch (error) {
        console.error("❌ [Adapter] createUser error:", error);
        throw error;
      }
    },

    // Get user by ID
    async getUser(id) {
      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerifiedAt,
        name: user.name,
      };
    },

    // Get user by email
    async getUserByEmail(email) {
      console.log("🔧 [Adapter] getUserByEmail called with:", email);
      try {
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          console.log("🔧 [Adapter] User not found for email:", email);
          return null;
        }

        console.log("✅ [Adapter] Found user:", user.id);
        console.log("✅ [Adapter] User emailVerified:", user.emailVerified);
        console.log("✅ [Adapter] User emailVerifiedAt:", user.emailVerifiedAt);
        
        // Return user in NextAuth format
        // NextAuth expects emailVerified to be a DateTime (null if unverified)
        // Our schema uses an enum + DateTime, so we return the DateTime
        const adapterUser = {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerifiedAt || null, // NextAuth expects DateTime or null
          name: user.name,
        };
        
        console.log("✅ [Adapter] Returning user with emailVerified:", adapterUser.emailVerified);
        return adapterUser;
      } catch (error) {
        console.error("❌ [Adapter] getUserByEmail error:", error);
        throw error;
      }
    },

    // Update user
    async updateUser(user) {
      const dbUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: user.name,
          email: user.email ?? undefined,
          // If emailVerified is set, update our fields
          ...(user.emailVerified && {
            emailVerified: "VERIFIED",
            emailVerifiedAt: user.emailVerified,
          }),
        },
      });

      return {
        id: dbUser.id,
        email: dbUser.email,
        emailVerified: dbUser.emailVerifiedAt,
        name: dbUser.name,
      };
    },

    // Delete user
    async deleteUser(userId) {
      await prisma.user.delete({
        where: { id: userId },
      });
    },

    // Link account (OAuth) - not used for email auth but required by interface
    async linkAccount(account: AdapterAccount) {
      // We don't use OAuth accounts, but need to implement this
      // For email-only auth, this is never called
      return undefined as any;
    },

    // Unlink account - not used for email auth
    async unlinkAccount({ providerAccountId, provider }) {
      return undefined;
    },

    // Get user by account - not used for email auth
    async getUserByAccount({ providerAccountId, provider }) {
      return null;
    },

    // Create verification token
    // Note: NextAuth v4 hashes tokens BEFORE passing them to this method
    // So the token parameter is already hashed - we store it as-is
    async createVerificationToken({ identifier, expires, token }) {
      console.log("🔧 [Adapter] createVerificationToken called");
      console.log("🔧 [Adapter] Identifier (email):", identifier);
      console.log("🔧 [Adapter] Stored token (hashed, first 20 chars):", token?.substring(0, 20));
      console.log("🔧 [Adapter] Token length:", token?.length);
      console.log("🔧 [Adapter] NOTE: This is the HASHED token. NextAuth hashes the raw token from URL before calling this method.");
      console.log("🔧 [Adapter] Expires at:", expires);
      console.log("🔧 [Adapter] Current time:", new Date().toISOString());
      console.log("🔧 [Adapter] Time until expiry:", Math.round((new Date(expires).getTime() - Date.now()) / 1000 / 60), "minutes");
      
      try {
        // Delete any existing tokens for this identifier first
        const deletedCount = await prisma.verificationToken.deleteMany({
          where: { identifier },
        });
        if (deletedCount.count > 0) {
          console.log(`🧹 [Adapter] Deleted ${deletedCount.count} existing token(s) for ${identifier}`);
        }
        
        const verificationToken = await prisma.verificationToken.create({
          data: {
            identifier,
            token, // Already hashed by NextAuth, store as-is
            expires,
          },
        });
        
        console.log("✅ [Adapter] Token successfully created and stored in database");
        console.log("✅ [Adapter] Database ID:", verificationToken.identifier);
        console.log("✅ [Adapter] Stored token (first 20 chars):", verificationToken.token.substring(0, 20));
        console.log("✅ [Adapter] Stored token length:", verificationToken.token.length);
        console.log("✅ [Adapter] Stored expires:", verificationToken.expires);
        
        // Verify the token was actually saved
        const verifyToken = await prisma.verificationToken.findUnique({
          where: {
            identifier_token: {
              identifier,
              token,
            },
          },
        });
        
        if (verifyToken) {
          console.log("✅ [Adapter] Token verification: Successfully confirmed token exists in database");
        } else {
          console.error("❌ [Adapter] Token verification: FAILED - Token not found in database after creation!");
          console.error("❌ [Adapter] This suggests a database write issue or transaction rollback");
        }
        
        return verificationToken;
      } catch (error: any) {
        console.error("❌ [Adapter] createVerificationToken error:", error.message);
        console.error("❌ [Adapter] Error code:", error.code);
        console.error("❌ [Adapter] Error stack:", error.stack);
        throw error;
      }
    },

    // Use (consume) verification token
    // NOTE: Check server logs for user-agent and IP to identify if a bot/scanner consumed the token
    async useVerificationToken({ identifier, token }) {
      console.log("🔧 [Adapter] useVerificationToken called");
      console.log("🔧 [Adapter] Looking for identifier:", identifier);
      console.log("🔧 [Adapter] Provided token (hashed, first 20 chars):", token?.substring(0, 20));
      console.log("🔧 [Adapter] Token length:", token?.length);
      console.log("🔧 [Adapter] NOTE: This is the HASHED token. NextAuth hashes the raw token from URL before calling this method.");
      console.log("🔧 [Adapter] NOTE: Check server request logs for user-agent/IP to identify bot/scanner clicks");
      
      try {
        // First, let's see what tokens exist for this identifier
        const existingTokens = await prisma.verificationToken.findMany({
          where: { identifier },
          orderBy: { expires: 'desc' },
        });
        console.log("🔧 [Adapter] Existing tokens for this identifier:", existingTokens.length);
        
        if (existingTokens.length === 0) {
          console.error("❌ [Adapter] No tokens found for identifier:", identifier);
          console.warn("⚠️  [Adapter] WARNING: No tokens found in database for this identifier.");
          console.warn("⚠️  [Adapter] Possible causes:");
          console.warn("⚠️  [Adapter]   1. Token was never created (email send failed or adapter error)");
          console.warn("⚠️  [Adapter]   2. Token already consumed by previous click");
          console.warn("⚠️  [Adapter]   3. Token expired and was cleaned up");
          console.warn("⚠️  [Adapter]   4. Email case mismatch (check exact email casing)");
          console.warn("⚠️  [Adapter]   5. Database connection issue during token creation");
          console.warn("⚠️  [Adapter] SOLUTION: Request a NEW sign-in link from /auth/signin");
          return null;
        }
        
        existingTokens.forEach((t, i) => {
          const isExpired = new Date(t.expires) < new Date();
          console.log(`🔧 [Adapter] Token ${i + 1}: ${t.token.substring(0, 20)}... (expires: ${t.expires}, expired: ${isExpired})`);
          console.log(`🔧 [Adapter] Token ${i + 1} matches: ${t.token === token}`);
          console.log(`🔧 [Adapter] Token ${i + 1} stored length: ${t.token.length}, provided length: ${token?.length}`);
        });

        // Check for expired tokens first
        const now = new Date();
        const validTokens = existingTokens.filter(t => new Date(t.expires) >= now);
        if (validTokens.length === 0) {
          console.error("❌ [Adapter] All tokens are expired");
          // Clean up expired tokens
          await prisma.verificationToken.deleteMany({
            where: { identifier },
          });
          return null;
        }

        // Try to find and delete the matching token
        const matchingToken = validTokens.find(t => t.token === token);
        if (!matchingToken) {
          console.error("❌ [Adapter] No matching token found");
          console.error("❌ [Adapter] Expected token (first 20):", token?.substring(0, 20));
          validTokens.forEach((t, i) => {
            console.error(`❌ [Adapter] Available token ${i + 1} (first 20):`, t.token.substring(0, 20));
          });
          return null;
        }

        const verificationToken = await prisma.verificationToken.delete({
          where: {
            identifier_token: {
              identifier,
              token,
            },
          },
        });
        console.log("✅ [Adapter] Token consumed successfully for:", identifier);
        return verificationToken;
      } catch (error: any) {
        console.error("❌ [Adapter] useVerificationToken error:", error.message);
        console.error("❌ [Adapter] Error code:", error.code);
        console.error("❌ [Adapter] Error stack:", error.stack);
        // Token not found or already used
        return null;
      }
    },

    // Session methods - we use JWT strategy, so these are not used
    async createSession({ sessionToken, userId, expires }) {
      return { sessionToken, userId, expires };
    },

    async getSessionAndUser(sessionToken) {
      return null;
    },

    async updateSession({ sessionToken }) {
      return null;
    },

    async deleteSession(sessionToken) {
      return undefined;
    },
  };
}
