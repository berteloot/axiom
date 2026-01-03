"use client";

import { getProviders, signIn, getSession } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

function SignInForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  useEffect(() => {
    // Check if user is already signed in
    const checkSession = async () => {
      const session = await getSession();
      if (session) {
        router.push(callbackUrl);
      }
    };
    checkSession();
  }, [router, callbackUrl]);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Use NextAuth's signIn function which will use the custom sendVerificationRequest
      // configured in the EmailProvider. This ensures tokens are created correctly.
      const result = await signIn("email", {
        email,
        callbackUrl: callbackUrl || "/dashboard",
        redirect: false,
      });

      if (result?.ok) {
        setEmailSent(true);
      } else if (result?.error) {
        // Handle errors from NextAuth
        const errorMsg = result.error === "Verification" 
          ? "The verification link has expired or is invalid. Please try again."
          : `Failed to send sign-in email: ${result.error}`;
        alert(errorMsg);
      } else {
        alert("Failed to send sign-in email. Please try again.");
      }
    } catch (error: any) {
      console.error("Sign in error:", error);
      alert(`Error: ${error?.message || "Failed to send sign-in email. Please try again."}`);
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
              We&apos;ve sent a sign-in link to <strong className="text-foreground">{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the link in the email to sign in to your account.
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Sign in to Asset Organizer</CardTitle>
          <CardDescription>
            Enter your email address to receive a secure sign-in link.
          </CardDescription>
          <p className="text-xs text-muted-foreground mt-2">
            No password needed. New users will have an account created automatically.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSignIn} className="space-y-4">
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
              disabled={loading || !email}
            >
              {loading ? "Sending..." : "Send sign-in link"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href={`/auth/signup${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="text-primary hover:underline">
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-xl sm:text-2xl">Sign in to Asset Organizer</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}