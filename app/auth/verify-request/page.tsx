"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

function VerifyRequestContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-xl sm:text-2xl">Check your email</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {email ? (
              <>We&apos;ve sent a verification link to <strong className="text-foreground">{email}</strong></>
            ) : (
              "We&apos;ve sent you a verification link"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Click the link in the email to verify your account and sign in.
          </p>
          <Button
            variant="outline"
            onClick={() => router.push("/auth/signin")}
            className="w-full sm:w-auto"
          >
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function VerifyRequestLoading() {
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

export default function VerifyRequest() {
  return (
    <Suspense fallback={<VerifyRequestLoading />}>
      <VerifyRequestContent />
    </Suspense>
  );
}
