import { createHash, randomBytes } from "crypto";

/**
 * NextAuth hashes verification tokens before storing them in the database.
 * This utility provides the same hashing function so we can create tokens
 * that work with NextAuth's email callback.
 * 
 * The hash format is: SHA256(token + secret)
 */

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "development-secret-key-change-this-in-production-12345678901234567890";

/**
 * Hash a verification token the same way NextAuth does
 * @param token The raw token to hash
 * @returns The hashed token
 */
export function hashToken(token: string): string {
  return createHash("sha256")
    .update(`${token}${NEXTAUTH_SECRET}`)
    .digest("hex");
}

/**
 * Generate a random token and return both raw and hashed versions
 * @returns Object with raw token (for URL) and hashed token (for database)
 */
export function generateVerificationToken(): { raw: string; hashed: string } {
  const raw = randomBytes(32).toString("hex");
  const hashed = hashToken(raw);
  return { raw, hashed };
}
