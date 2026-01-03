"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const router = useRouter();

  const errorMessages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration.",
    AccessDenied: "You do not have permission to sign in.",
    Verification: "The verification token has expired or has already been used. Please request a new sign-in link.",
    Default: "An error occurred during authentication.",
  };

  const errorMessage = errorMessages[error || "Default"] || errorMessages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-xl sm:text-2xl">Authentication Error</CardTitle>
          <CardDescription className="text-sm sm:text-base">{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {error === "Verification" && (
            <p className="text-sm text-muted-foreground">
              Verification links can only be used once and expire after 24 hours. Please request a new sign-in link.
            </p>
          )}
          <div className="space-y-2">
            <Button
              onClick={() => router.push("/auth/signin")}
              className="w-full"
            >
              Try again
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="w-full"
            >
              Go to home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-xl sm:text-2xl">Authentication Error</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
