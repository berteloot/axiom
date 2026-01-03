"use client";

import { useState, FormEvent } from "react";
import { usePersistentState } from "@/lib/use-persistent-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface CreateAccountFormProps {
  onCreateAccount: (name: string) => Promise<void>;
  terminology?: {
    account: string;
    accounts: string;
  };
}

export function CreateAccountForm({ 
  onCreateAccount, 
  terminology = { account: "Account", accounts: "Accounts" } 
}: CreateAccountFormProps) {
  // Use persistent state to preserve form data across tab switches/refreshes
  const [newAccountName, setNewAccountName, clearAccountName] = usePersistentState("create-account-name", "");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<{ message: string; accountName: string } | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!newAccountName.trim()) {
      setError(`${terminology.account} name is required`);
      return;
    }
    
    const accountName = newAccountName.trim();
    setIsCreating(true);
    setError(null);
    setSuccessState(null);
    
    try {
      await onCreateAccount(accountName);
      setNewAccountName("");
      clearAccountName(); // Clear persisted data after successful submission
      setSuccessState({
        message: `${terminology.account} created successfully!`,
        accountName: accountName,
      });
    } catch (error) {
      console.error("Failed to create account:", error);
      const errorMessage = error instanceof Error ? error.message : `Failed to create ${terminology.account.toLowerCase()}. Please try again.`;
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const isAgency = terminology.account === "Client";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New {terminology.account}</CardTitle>
        <CardDescription>
          {isAgency 
            ? `Create a new client ${terminology.account.toLowerCase()} to organize their assets separately. After creating, configure the client's Brand Identity for better AI analysis.`
            : `Create a new ${terminology.account.toLowerCase()} to organize your assets separately. After creating, configure its Brand Identity for better AI analysis.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
            <Input
              placeholder={`${terminology.account} name (e.g., ${isAgency ? "Acme Corp (Client)" : "Acme Corp"})`}
              value={newAccountName}
              onChange={(e) => {
                setNewAccountName(e.target.value);
                // Clear error when user starts typing
                if (error) setError(null);
                if (successState) setSuccessState(null);
              }}
              disabled={isCreating}
              className="flex-1 min-h-[44px]"
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "account-error" : successState ? "account-status" : undefined}
            />
            <Button
              type="submit"
              disabled={isCreating || !newAccountName.trim()}
              className="min-h-[44px] w-full sm:w-auto"
              size="lg"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </>
              )}
            </Button>
          </div>
          
          {/* Error message */}
          {error && (
            <div
              id="account-error"
              role="alert"
              aria-live="polite"
              className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-sm"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {/* Success message with next steps */}
          {successState && (
            <div
              id="account-status"
              role="status"
              aria-live="polite"
              className="p-4 rounded-lg bg-green-500/10 border border-green-500/20"
            >
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <span className="font-medium">{successState.message}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                <strong>{successState.accountName}</strong> is now your active {terminology.account.toLowerCase()}. 
                Configure {isAgency ? "their" : "its"} Brand Identity and Product Lines to help the AI provide better analysis for your assets.
              </p>
              <Button asChild size="sm" variant="outline" className="gap-2">
                <Link href="/settings/profile">
                  Configure {isAgency ? "Client" : "Company"} Context
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
