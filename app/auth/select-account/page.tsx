"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/lib/account-context";
import { getSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

export default function SelectAccount() {
  const { accounts, currentAccount, switchAccount, isLoading } = useAccount();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

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

  useEffect(() => {
    // If we have a current account, redirect to dashboard
    if (currentAccount && !isLoading && !checkingAuth) {
      router.push("/dashboard");
    }
  }, [currentAccount, isLoading, checkingAuth, router]);

  const handleSelectAccount = async (accountId: string) => {
    try {
      await switchAccount(accountId);
      router.push("/dashboard");
    } catch (error) {
      console.error("Error switching account:", error);
    }
  };

  if (checkingAuth || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>{checkingAuth ? "Checking authentication..." : "Loading accounts..."}</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleRefresh = async () => {
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
              You don&apos;t have any organizations yet. Let&apos;s create one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <Button onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
            <div className="pt-2">
              <Button variant="outline" onClick={handleRefresh} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh (if you just signed up)
              </Button>
            </div>
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