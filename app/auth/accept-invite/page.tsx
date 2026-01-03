"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

interface InvitationData {
  email: string;
  role: string;
  account: {
    name: string;
  };
  invitedBy: {
    name: string;
  };
}

function AcceptInviteForm() {
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  useEffect(() => {
    const checkTokenAndSession = async () => {
      if (!token) {
        setError("Invalid invitation link");
        setLoading(false);
        return;
      }

      const session = await getSession();

      if (!session) {
        // Redirect to sign in with callback to this page
        router.push(`/auth/signin?callbackUrl=${encodeURIComponent(window.location.href)}`);
        return;
      }

      // Fetch actual invitation details from the server
      try {
        const response = await fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (response.ok) {
          setInvitation({
            email: data.email,
            role: data.role,
            account: { name: data.account.name },
            invitedBy: { name: data.invitedBy.name || "Someone" }
          });
        } else {
          setError(data.error || "Invalid invitation");
        }
      } catch (err) {
        console.error("Error fetching invitation:", err);
        setError("Failed to load invitation details");
      }

      setLoading(false);
    };

    checkTokenAndSession();
  }, [token, router]);

  const handleAcceptInvite = async () => {
    if (!token) return;

    setAccepting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      } else {
        setError(data.error || "Failed to accept invitation");
      }
    } catch (error) {
      setError("An unexpected error occurred");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading invitation...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push("/auth/signin")}>
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Invitation Accepted!</CardTitle>
            <CardDescription>
              Welcome to {invitation?.account.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Redirecting you to your dashboard...
            </p>
            <Button onClick={() => router.push("/dashboard")}>
              Go to Dashboard
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
          <CardTitle>You&apos;re Invited!</CardTitle>
          <CardDescription>
            {invitation?.invitedBy.name} has invited you to join {invitation?.account.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm">
              <strong>Account:</strong> {invitation?.account.name}
            </div>
            <div className="text-sm mt-1">
              <strong>Role:</strong> {invitation?.role}
            </div>
          </div>

          {error && (
            <Alert>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Button
              onClick={handleAcceptInvite}
              disabled={accepting}
              className="w-full"
            >
              {accepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                "Accept Invitation"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="w-full"
            >
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AcceptInviteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading...</span>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvite() {
  return (
    <Suspense fallback={<AcceptInviteLoading />}>
      <AcceptInviteForm />
    </Suspense>
  );
}
