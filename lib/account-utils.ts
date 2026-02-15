import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

/**
 * Get the current user ID from NextAuth session
 */
export async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.id || null;
  } catch (error) {
    console.error("Error getting user session:", error);
    return null;
  }
}

/**
 * Get the current user from NextAuth session
 */
export async function getCurrentUser(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    return session?.user || null;
  } catch (error) {
    console.error("Error getting user session:", error);
    return null;
  }
}

/**
 * Get the current account ID for the user from their session
 * Returns null if no account is selected
 */
export async function getCurrentAccountId(
  request: NextRequest
): Promise<string | null> {
  try {
    const userId = await getUserId(request);
    if (!userId) return null;

    const session = await prisma.session.findUnique({
      where: { userId },
    });
    return session?.accountId || null;
  } catch (error) {
    console.error("Error getting current account ID:", error);
    return null;
  }
}

/**
 * Get the current account ID or throw an error if not found
 * Use this when an account is required for the operation
 */
export async function requireAccountId(
  request: NextRequest
): Promise<string> {
  const accountId = await getCurrentAccountId(request);
  if (!accountId) {
    throw new Error("No account selected. Please select an account first.");
  }
  return accountId;
}

/**
 * Get the current user's role in their active account
 */
export async function getCurrentUserRole(
  request: NextRequest
): Promise<UserRole | null> {
  try {
    const userId = await getUserId(request);
    const accountId = await getCurrentAccountId(request);

    if (!userId || !accountId) return null;

    const userAccount = await prisma.userAccount.findUnique({
      where: {
        userId_accountId: {
          userId,
          accountId,
        }
      }
    });

    return userAccount?.role || null;
  } catch (error) {
    console.error("Error getting current user role:", error);
    return null;
  }
}

/**
 * Check if the current user has admin/owner access to their account
 */
export async function isUserAdminOrOwner(
  request: NextRequest
): Promise<boolean> {
  const role = await getCurrentUserRole(request);
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Ensure the current user is authenticated and has access to the given account.
 * Use for integration routes (e.g. Google Ads) where accountId comes from query or state.
 * @throws Error if not authenticated or not a member of the account
 */
export async function requireAccountAccess(
  request: NextRequest,
  accountId: string
): Promise<{ userId: string }> {
  const userId = await getUserId(request);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  const ua = await prisma.userAccount.findFirst({
    where: { userId, accountId },
  });
  if (!ua) {
    throw new Error("No access to this account");
  }
  return { userId };
}
