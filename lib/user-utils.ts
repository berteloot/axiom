/**
 * User Type Detection Utilities
 * 
 * Determines if a user is managing multiple organizations (agency mode)
 * or a single organization (regular mode) and provides helper functions
 * for adapting the UI accordingly.
 */

import { Account } from "@/lib/account-context";

export type UserMode = "agency" | "regular";

/**
 * Detect if user is in agency mode (managing multiple accounts)
 * or regular mode (single account)
 */
export function getUserMode(accounts: Account[]): UserMode {
  return accounts.length > 1 ? "agency" : "regular";
}

/**
 * Check if user is an agency user (multiple accounts)
 */
export function isAgencyUser(accounts: Account[]): boolean {
  return getUserMode(accounts) === "agency";
}

/**
 * Check if user is a regular user (single account)
 */
export function isRegularUser(accounts: Account[]): boolean {
  return getUserMode(accounts) === "regular";
}

/**
 * Get appropriate terminology based on user mode
 */
export function getAccountTerminology(mode: UserMode) {
  return {
    account: mode === "agency" ? "Client" : "Organization",
    accounts: mode === "agency" ? "Clients" : "Organizations",
    manageAccounts: mode === "agency" ? "Manage Clients" : "Account Settings",
    createAccount: mode === "agency" ? "Add Client" : "Create Organization",
    switchAccount: mode === "agency" ? "Switch Client" : "Switch Organization",
  };
}

/**
 * Determine if account switcher should be shown
 * 
 * Logic:
 * - Always show if 2+ accounts (agency mode)
 * - Hide if only 1 account (regular mode) - can be overridden
 * - Show placeholder if no accounts yet
 */
export function shouldShowAccountSwitcher(
  accounts: Account[],
  options?: {
    alwaysShow?: boolean; // Force show even for single account
    hideForNoAccounts?: boolean; // Hide if no accounts
  }
): boolean {
  const { alwaysShow = false, hideForNoAccounts = false } = options || {};

  // No accounts yet
  if (accounts.length === 0) {
    return !hideForNoAccounts;
  }

  // Multiple accounts - always show
  if (accounts.length > 1) {
    return true;
  }

  // Single account - only show if forced
  return alwaysShow;
}

/**
 * Get account switcher mode
 * 
 * Returns how the account switcher should be rendered:
 * - "full": Full switcher with dropdown (agency mode)
 * - "simple": Simple display of current account (regular mode)
 * - "hidden": Don't show at all
 */
export function getAccountSwitcherMode(accounts: Account[]): "full" | "simple" | "hidden" {
  if (accounts.length === 0) {
    return "hidden";
  }

  if (accounts.length === 1) {
    return "simple";
  }

  return "full";
}

/**
 * Get navigation items based on user mode
 */
export function getNavigationItems(mode: UserMode) {
  const terminology = getAccountTerminology(mode);

  return {
    settings: {
      label: mode === "agency" ? "Settings" : "Settings",
      items: [
        { label: "Profile", href: "/settings/profile" },
        { label: terminology.manageAccounts, href: "/settings/accounts" },
        { label: "Billing", href: "/billing" },
      ],
    },
  };
}

/**
 * Get onboarding message based on account count
 */
export function getOnboardingMessage(accounts: Account[], currentAccount: Account | null) {
  if (accounts.length === 0) {
    return {
      title: "Welcome to Asset Organizer",
      message: "Create your first organization to get started.",
      action: "Create Organization",
    };
  }

  if (accounts.length === 1 && currentAccount) {
    return {
      title: `Welcome to ${currentAccount.name}`,
      message: "Start by uploading your first asset or setting up your brand profile.",
      action: "Upload Asset",
    };
  }

  return {
    title: "Manage Your Clients",
    message: `You're managing ${accounts.length} client accounts. Switch between them using the account switcher.`,
    action: "View Clients",
  };
}

/**
 * Get appropriate empty state message for asset list
 */
export function getEmptyStateMessage(mode: UserMode) {
  if (mode === "agency") {
    return {
      title: "No assets yet for this client",
      message: "Upload your first asset for this client to get started with AI-powered organization.",
    };
  }

  return {
    title: "No assets yet",
    message: "Upload your first asset to get started with AI-powered organization.",
  };
}

/**
 * Get role badge display
 */
export function getRoleBadgeText(role?: string, mode?: UserMode) {
  if (!role) return null;

  const badges: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: mode === "agency" ? "Manager" : "Admin",
    MEMBER: mode === "agency" ? "Team" : "Member",
  };

  return badges[role] || role;
}

/**
 * Check if user can perform admin actions
 */
export function canPerformAdminActions(role?: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Check if user can delete account
 */
export function canDeleteAccount(role?: string): boolean {
  return role === "OWNER";
}

/**
 * Get account creation limit message
 * Returns null if unlimited, otherwise returns a message
 */
export function getAccountCreationLimit(
  accounts: Account[],
  subscriptionTier?: string
): string | null {
  // For future: implement limits based on subscription
  // For now, unlimited
  return null;

  // Example future logic:
  // if (subscriptionTier === "free" && accounts.length >= 1) {
  //   return "Upgrade to Pro to manage multiple client accounts";
  // }
  // if (subscriptionTier === "pro" && accounts.length >= 10) {
  //   return "Upgrade to Enterprise for unlimited client accounts";
  // }
  // return null;
}
