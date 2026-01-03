"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

export interface Account {
  id: string;
  name: string;
  slug: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
  subscriptionStatus?: "TRIAL" | "ACTIVE" | "CANCELLED" | "EXPIRED";
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  createdAt: string;
}

interface AccountContextType {
  currentAccount: Account | null;
  accounts: Account[];
  accountType: "CORPORATE" | "AGENCY" | null;
  isLoading: boolean;
  isTrialExpired: boolean;
  isSubscriptionExpired: boolean;
  switchAccount: (accountId: string) => Promise<void>;
  refreshAccounts: () => Promise<void>;
  createAccount: (name: string) => Promise<Account>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountType, setAccountType] = useState<"CORPORATE" | "AGENCY" | null>(null);
  // Don't start in loading state - only show loading when actually fetching data
  const [isLoading, setIsLoading] = useState(false);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [isSubscriptionExpired, setIsSubscriptionExpired] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Handle unauthenticated state immediately - don't wait
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      setIsLoading(false);
      setCurrentAccount(null);
      setAccounts([]);
      setAccountType(null);
      setIsTrialExpired(false);
      setIsSubscriptionExpired(false);
    }
  }, [sessionStatus]);

  const fetchCurrentAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/accounts/current", {
        // Suppress error logs for expected 404/401 responses
        headers: { "X-Suppress-Error-Log": "true" }
      });
      if (response.ok) {
        const data = await response.json();
        const account = data.account;

        // Check subscription status
        const now = new Date();
        const trialExpired = account.subscriptionStatus === "TRIAL" &&
                            account.trialEndsAt &&
                            new Date(account.trialEndsAt) < now;
        const subscriptionExpired = (account.subscriptionStatus === "CANCELLED") ||
                                   (account.subscriptionStatus === "ACTIVE" &&
                                    account.subscriptionEndsAt &&
                                    new Date(account.subscriptionEndsAt) < now);

        setCurrentAccount(account);
        setIsTrialExpired(trialExpired);
        setIsSubscriptionExpired(subscriptionExpired);
        
        // Cache the current account
        sessionStorage.setItem('account-current', JSON.stringify({
          account,
          trialExpired,
          subscriptionExpired
        }));
      } else if (response.status === 404 || response.status === 401) {
        // No account selected yet or not authenticated - this is expected
        setCurrentAccount(null);
        setIsTrialExpired(false);
        setIsSubscriptionExpired(false);
        sessionStorage.removeItem('account-current');
      }
    } catch (error) {
      // Silently handle errors - user might not be authenticated yet
      setCurrentAccount(null);
      setIsTrialExpired(false);
      setIsSubscriptionExpired(false);
      sessionStorage.removeItem('account-current');
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/accounts", {
        // Suppress error logs for expected 401/404 responses
        headers: { "X-Suppress-Error-Log": "true" }
      });
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
        setAccountType(data.accountType || null);
        // Cache the accounts list
        sessionStorage.setItem('account-list', JSON.stringify(data.accounts || []));
      } else if (response.status === 401 || response.status === 404) {
        // User not authenticated or no accounts - this is expected
        setAccounts([]);
        setAccountType(null);
        sessionStorage.removeItem('account-list');
      }
    } catch (error) {
      // Silently handle errors - user might not be authenticated yet
      setAccounts([]);
      setAccountType(null);
      sessionStorage.removeItem('account-list');
    }
  }, []);

  const refreshAccounts = useCallback(async () => {
    await Promise.all([fetchAccounts(), fetchCurrentAccount()]);
  }, [fetchAccounts, fetchCurrentAccount]);

  const switchAccount = useCallback(async (accountId: string) => {
    try {
      const response = await fetch("/api/accounts/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (!response.ok) {
        throw new Error("Failed to switch account");
      }

      const data = await response.json();
      setCurrentAccount(data.account);
      
      // Clear all caches when switching accounts
      sessionStorage.clear();
      
      // Clear all persisted form data to prevent browser warning on reload
      // Since we're switching accounts, the data is no longer relevant anyway
      if (typeof window !== 'undefined') {
        try {
          const keys = Object.keys(window.localStorage);
          keys.forEach(key => {
            if (key.startsWith('persistent_')) {
              window.localStorage.removeItem(key);
            }
          });
        } catch (error) {
          // Ignore errors when clearing localStorage
        }
      }
      
      // Reload the page to refresh all data with new account context
      window.location.reload();
    } catch (error) {
      console.error("Error switching account:", error);
      throw error;
    }
  }, []);

  const createAccount = useCallback(async (name: string): Promise<Account> => {
    try {
      console.log("Creating account with name:", name);
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const responseData = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        const errorMessage = responseData.error || `Failed to create account (${response.status})`;
        console.error("Account creation failed:", {
          status: response.status,
          error: responseData,
        });
        throw new Error(errorMessage);
      }

      const newAccount = responseData.account;
      console.log("Account created successfully:", newAccount);
      
      if (!newAccount || !newAccount.id) {
        throw new Error("Invalid response from server: account data missing");
      }
      
      // Refresh accounts list
      try {
        await refreshAccounts();
      } catch (refreshError) {
        console.warn("Failed to refresh accounts list:", refreshError);
        // Continue anyway
      }
      
      // Automatically switch to the new account
      try {
        await switchAccount(newAccount.id);
      } catch (switchError) {
        console.warn("Failed to switch to new account:", switchError);
        // Continue anyway - the account was created successfully
      }
      
      return newAccount;
    } catch (error) {
      console.error("Error creating account:", error);
      throw error;
    }
  }, [refreshAccounts, switchAccount]);

  // Mark component as mounted to prevent hydration mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Only fetch data after component is mounted (client-side only)
    if (!mounted) return;

    // Handle unauthenticated state (already handled in previous useEffect, but double-check)
    if (sessionStatus === "unauthenticated") {
      return; // Already handled above
    }

    // Wait for session to be ready - but don't block UI with loading state
    if (sessionStatus === "loading") {
      // Don't fetch yet, but also don't show loading spinner
      // Keep current state (isLoading should already be false)
      return;
    }

    // Only fetch if authenticated
    if (sessionStatus === "authenticated" && session?.user) {
      // Check cache first
      const cachedAccounts = sessionStorage.getItem('account-list');
      const cachedCurrent = sessionStorage.getItem('account-current');
      
      if (cachedAccounts || cachedCurrent) {
        // Load from cache immediately
        try {
          if (cachedAccounts) {
            const accounts = JSON.parse(cachedAccounts);
            setAccounts(accounts);
          }
          if (cachedCurrent) {
            const { account, trialExpired, subscriptionExpired } = JSON.parse(cachedCurrent);
            setCurrentAccount(account);
            setIsTrialExpired(trialExpired);
            setIsSubscriptionExpired(subscriptionExpired);
          }
          // Fetch in background to update
          Promise.all([fetchAccounts(), fetchCurrentAccount()]).catch(error => {
            console.error("Error refreshing account data:", error);
          });
        } catch (error) {
          console.error("Error loading cached account data:", error);
          // Cache is invalid, fetch fresh data
          setIsLoading(true);
          const loadData = async () => {
            try {
              await Promise.all([fetchAccounts(), fetchCurrentAccount()]);
            } catch (error) {
              console.error("Error loading account data:", error);
            } finally {
              setIsLoading(false);
            }
          };
          loadData();
        }
      } else {
        // No cache, fetch with loading state
        setIsLoading(true);
        const loadData = async () => {
          try {
            await Promise.all([fetchAccounts(), fetchCurrentAccount()]);
          } catch (error) {
            console.error("Error loading account data:", error);
            // Don't block the UI - set loading to false even on error
          } finally {
            setIsLoading(false);
          }
        };
        loadData();
      }
    } else {
      // Session exists but no user or unknown state - stop loading
      setIsLoading(false);
    }
  }, [mounted, sessionStatus, session, fetchAccounts, fetchCurrentAccount]);

  return (
    <AccountContext.Provider
      value={{
        currentAccount,
        accounts,
        accountType,
        isLoading,
        isTrialExpired,
        isSubscriptionExpired,
        switchAccount,
        refreshAccounts,
        createAccount,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error("useAccount must be used within an AccountProvider");
  }
  return context;
}
