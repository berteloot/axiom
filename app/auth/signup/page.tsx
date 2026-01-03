"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import Link from "next/link";

type AccountType = "CORPORATE" | "AGENCY";

function SignUpForm() {
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!accountType) {
      alert("Please select an account type");
      return;
    }

    if (!email || !email.includes("@")) {
      alert("Please enter a valid email address");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          accountType,
          callbackUrl: callbackUrl || "/dashboard",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setEmailSent(true);
      } else {
        alert(data.error || "Failed to send sign-up email. Please try again.");
      }
    } catch (error: any) {
      console.error("Sign up error:", error);
      alert(`Error: ${error?.message || "Failed to send sign-up email. Please try again."}`);
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-xl sm:text-2xl">Check your email</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              We&apos;ve sent a sign-up link to <strong className="text-foreground">{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the link in the email to complete your sign-up and create your account.
            </p>
            <Button
              variant="outline"
              onClick={() => setEmailSent(false)}
              className="w-full"
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Choose your account type and enter your email to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accountType">Account Type</Label>
              <Select
                value={accountType}
                onValueChange={(value) => setAccountType(value as AccountType)}
                required
                disabled={loading}
              >
                <SelectTrigger id="accountType">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORPORATE">Corporate - Single organization</SelectItem>
                  <SelectItem value="AGENCY">Agency - Multiple organizations</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {accountType === "CORPORATE" && "Perfect for companies managing their own assets with unlimited team members."}
                {accountType === "AGENCY" && "Perfect for agencies managing multiple client organizations with unlimited team members."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email || !accountType}
            >
              {loading ? "Sending..." : "Continue"}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href={`/auth/signin${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SignUpLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignUp() {
  return (
    <Suspense fallback={<SignUpLoading />}>
      <SignUpForm />
    </Suspense>
  );
}
