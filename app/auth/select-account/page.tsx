"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/lib/account-context";
import { getSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

export default function SelectAccount() {
  const { accounts, currentAccount, switchAccount, isLoading, refreshAccounts } = useAccount();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairAttempted, setRepairAttempted] = useState(false);

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      const session = await getSession();
      if (!session) {
        // Redirect to sign in if not authenticated
        router.push(`/auth/signin?callbackUrl=${encodeURIComponent("/auth/select-account")}`);
        return;
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, [router]);

  // Auto-repair: When user has no accounts after loading, trigger a refresh
  // The /api/accounts endpoint will automatically create an account for orphaned users
  const attemptRepair = useCallback(async () => {
    if (repairAttempted || isRepairing) return;
    
    setIsRepairing(true);
    setRepairAttempted(true);
    
    console.log("🔧 [SelectAccount] User has no accounts, attempting auto-repair...");
    
    // Clear cache first
    sessionStorage.clear();
    
    try {
      // Call refreshAccounts which will hit /api/accounts
      // The API will automatically repair orphaned users
      await refreshAccounts();
      
      // Give a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log("✅ [SelectAccount] Repair attempt completed");
    } catch (error) {
      console.error("❌ [SelectAccount] Repair failed:", error);
    } finally {
      setIsRepairing(false);
    }
  }, [repairAttempted, isRepairing, refreshAccounts]);

  useEffect(() => {
    // If we have a current account, redirect to dashboard
    if (currentAccount && !isLoading && !checkingAuth) {
      router.push("/dashboard");
    }
  }, [currentAccount, isLoading, checkingAuth, router]);

  // Trigger auto-repair when we detect no accounts
  useEffect(() => {
    if (!checkingAuth && !isLoading && accounts.length === 0 && !repairAttempted) {
      attemptRepair();
    }
  }, [checkingAuth, isLoading, accounts.length, repairAttempted, attemptRepair]);

  const handleSelectAccount = async (accountId: string) => {
    try {
      await switchAccount(accountId);
      router.push("/dashboard");
    } catch (error) {
      console.error("Error switching account:", error);
    }
  };

  if (checkingAuth || isLoading || isRepairing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>
              {checkingAuth 
                ? "Checking authentication..." 
                : isRepairing 
                  ? "Setting up your account..." 
                  : "Loading accounts..."}
            </span>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleRefresh = async () => {
    setRepairAttempted(false); // Allow another repair attempt
    // Clear browser cache
    sessionStorage.clear();
    // Force reload to get fresh data
    window.location.reload();
  };

  if (accounts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Welcome!</CardTitle>
            <CardDescription>
              We&apos;re setting up your organization. If this persists, click the button below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <Button onClick={handleRefresh} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Setup
            </Button>
            <p className="text-xs text-muted-foreground">
              If you continue to see this message, please contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Select Organization</CardTitle>
          <CardDescription>
            Choose which organization you&apos;d like to work with
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
              onClick={() => handleSelectAccount(account.id)}
            >
              <div>
                <h3 className="font-medium">{account.name}</h3>
                <p className="text-sm text-gray-600">{account.slug}</p>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="outline">{account.role}</Badge>
                <Button size="sm">
                  Select
                </Button>
              </div>
            </div>
          ))}

          <div className="pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="w-full"
            >
              Create New Organization
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}