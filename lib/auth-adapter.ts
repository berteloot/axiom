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
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        console.log("🔧 [Adapter] User not found for email:", email);
        return null;
      }

      console.log("✅ [Adapter] Found user:", user.id);
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerifiedAt,
        name: user.name,
      };
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
    async createVerificationToken({ identifier, expires, token }) {
      console.log("🔧 [Adapter] createVerificationToken for:", identifier);
      try {
        const verificationToken = await prisma.verificationToken.create({
          data: {
            identifier,
            token,
            expires,
          },
        });
        console.log("✅ [Adapter] Token created for:", identifier);
        return verificationToken;
      } catch (error) {
        console.error("❌ [Adapter] createVerificationToken error:", error);
        throw error;
      }
    },

    // Use (consume) verification token
    async useVerificationToken({ identifier, token }) {
      console.log("🔧 [Adapter] useVerificationToken called");
      console.log("🔧 [Adapter] Looking for identifier:", identifier);
      console.log("🔧 [Adapter] Looking for token:", token);
      console.log("🔧 [Adapter] Token length:", token?.length);
      
      try {
        // First, let's see what tokens exist for this identifier
        const existingTokens = await prisma.verificationToken.findMany({
          where: { identifier },
        });
        console.log("🔧 [Adapter] Existing tokens for this identifier:", existingTokens.length);
        existingTokens.forEach((t, i) => {
          console.log(`🔧 [Adapter] Token ${i + 1}: ${t.token.substring(0, 10)}... (expires: ${t.expires})`);
          console.log(`🔧 [Adapter] Token ${i + 1} matches: ${t.token === token}`);
        });

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
