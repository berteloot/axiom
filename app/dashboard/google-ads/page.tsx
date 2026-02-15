"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "@/lib/account-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart3, Link2, Unlink, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function DashboardGoogleAdsPage() {
  const { currentAccount } = useAccount();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{
    connected: boolean;
    email?: string;
    googleAdsCustomerId?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Read callback params
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected === "google_ads") {
      setMessage({ type: "success", text: "Google Ads account connected successfully." });
      window.history.replaceState({}, "", "/dashboard/google-ads");
    } else if (error) {
      const messages: Record<string, string> = {
        google_ads_denied: "Connection was denied or cancelled.",
        missing_params: "Invalid callback; please try connecting again.",
        unauthorized: "You don’t have access to this account.",
        token_exchange_failed: "Could not complete connection. Please try again.",
        save_failed: "Connection succeeded but saving failed. Please try again.",
        server_config: "Server configuration error. Contact support.",
      };
      setMessage({ type: "error", text: messages[error] ?? "Something went wrong." });
      window.history.replaceState({}, "", "/dashboard/google-ads");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!currentAccount?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/integrations/google-ads/status?accountId=${currentAccount.id}`, {
      headers: { "X-Suppress-Error-Log": "true" },
    })
      .then((res) => (res.ok ? res.json() : { connected: false }))
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentAccount?.id]);

  const handleConnect = () => {
    if (!currentAccount?.id) return;
    window.location.href = `/api/integrations/google-ads/connect?accountId=${currentAccount.id}`;
  };

  const handleDisconnect = async () => {
    if (!currentAccount?.id) return;
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/integrations/google-ads?accountId=${currentAccount.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setStatus({ connected: false });
        setMessage({ type: "success", text: "Google Ads account disconnected." });
      } else {
        setMessage({ type: "error", text: "Failed to disconnect." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to disconnect." });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!currentAccount) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Select an account to connect Google Ads.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-roboto-condensed text-brand-dark-blue flex items-center gap-2">
          <BarChart3 className="h-7 w-7" />
          Google Ads
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect this account’s client Google Ads to pull campaigns, ad groups, and reporting into Axiom.
        </p>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connection
          </CardTitle>
          <CardDescription>
            One Google Ads connection per account. Connect the client’s Google account that has access to their Google Ads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking connection…</span>
            </div>
          ) : status?.connected ? (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-4">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-medium">Connected</p>
                  {status.email && (
                    <p className="text-sm text-muted-foreground">{status.email}</p>
                  )}
                  {status.googleAdsCustomerId && (
                    <p className="text-sm text-muted-foreground">
                      Customer ID: {status.googleAdsCustomerId}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-muted-foreground"
              >
                {disconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Unlink className="h-4 w-4 mr-2" />
                )}
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No Google Ads account linked for this account. Connect one to use reporting and tools.
              </p>
              <Button onClick={handleConnect}>
                <Link2 className="h-4 w-4 mr-2" />
                Connect Google Ads
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
