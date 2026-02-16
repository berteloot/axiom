"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface AccountInfo {
  id: string;
  name: string;
  subscriptionStatus: string;
  trialEndsAt: string;
  subscriptionEndsAt?: string;
}

function BillingContent() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  useEffect(() => {
    const fetchAccountInfo = async () => {
      try {
        const response = await fetch("/api/accounts/current");
        if (response.ok) {
          const data = await response.json();
          setAccount({
            id: data.account.id,
            name: data.account.name,
            subscriptionStatus: "TRIAL", // TODO: Get from API
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // TODO: Get from API
          });
        }
      } catch (error) {
        console.error("Error fetching account info:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAccountInfo();
  }, []);

  const getReasonMessage = () => {
    switch (reason) {
      case "trial_expired":
        return "Your free trial has expired. Upgrade to continue using Asset Organizer.";
      case "subscription_expired":
        return "Your subscription has expired. Renew to continue using Asset Organizer.";
      default:
        return "Manage your subscription and billing information.";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading billing information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8 lg:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">{getReasonMessage()}</p>
        </div>

        {reason && (
          <Alert className="mb-6">
            <AlertDescription className="text-sm">{getReasonMessage()}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg sm:text-xl">Current Plan</CardTitle>
              <CardDescription className="text-sm">
                {account?.name} - {account?.subscriptionStatus}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={reason === "trial_expired" ? "destructive" : "default"}>
                  {account?.subscriptionStatus}
                </Badge>
              </div>

              {account?.trialEndsAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Trial ends:</span>
                  <span className="font-medium">
                    {new Date(account.trialEndsAt).toLocaleDateString()}
                  </span>
                </div>
              )}

              <div className="pt-4">
                <Button className="w-full" size="lg">
                  Upgrade to Pro
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg sm:text-xl">Pro Plan Features</CardTitle>
              <CardDescription className="text-sm">
                Everything you need for professional asset management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full shrink-0"></div>
                <span className="text-sm">Unlimited assets and storage</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full shrink-0"></div>
                <span className="text-sm">Multi-user collaboration</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full shrink-0"></div>
                <span className="text-sm">Advanced analytics and reporting</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full shrink-0"></div>
                <span className="text-sm">Priority support</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full shrink-0"></div>
                <span className="text-sm">API access</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 sm:mt-8 text-center px-4">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Need help? Contact our support team at{" "}
            <a href="mailto:support@assetorganizer.com" className="text-primary hover:underline font-medium">
              support@assetorganizer.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function BillingLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function Billing() {
  return (
    <Suspense fallback={<BillingLoading />}>
      <BillingContent />
    </Suspense>
  );
}
