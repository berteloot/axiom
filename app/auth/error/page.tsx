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
    Configuration: "There is a problem with the server configuration. Check that NEXTAUTH_URL and NEXTAUTH_SECRET are set correctly in Render.",
    AccessDenied: "You do not have permission to sign in.",
    Verification: "The verification token has expired or has already been used. Please request a new sign-in link.",
    Default: "An error occurred during authentication. This could be due to an expired token, database connection issue, or misconfigured environment variables. Please check Render logs for details.",
  };

  const errorMessage = errorMessages[error || "Default"] || errorMessages.Default;
  
  // If no specific error code, show more helpful message
  const showDebugInfo = !error;

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
          {showDebugInfo && (
            <div className="text-sm text-muted-foreground space-y-2 p-4 bg-muted rounded-lg">
              <p className="font-semibold">Common causes:</p>
              <ul className="text-left space-y-1 list-disc list-inside">
                <li>Token expired (links expire after 24 hours)</li>
                <li>Token already used (each link works only once)</li>
                <li>Database connection issue (check Render logs)</li>
                <li>NEXTAUTH_URL not set correctly (should be https://axiom-ray0.onrender.com)</li>
              </ul>
              <p className="text-xs mt-2">
                Check Render dashboard → Logs for detailed error messages.
              </p>
            </div>
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
