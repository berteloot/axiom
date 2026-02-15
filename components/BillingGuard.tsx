"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAccount } from "@/lib/account-context";
import { useSession } from "next-auth/react";

interface BillingGuardProps {
  children: React.ReactNode;
}

export function BillingGuard({ children }: BillingGuardProps) {
  const { currentAccount, isTrialExpired, isSubscriptionExpired, isLoading } = useAccount();
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Ensure this component only runs client-side logic after mount
  // This prevents hydration mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if we're on an auth page that should be allowed without an account
  const isAuthPage = pathname?.startsWith("/auth/") || pathname === "/auth";
  // SEO audit page doesn't require an account (brand consistency is optional)
  const isSeoAuditPage = pathname?.startsWith("/seo-audit");
  // Public pages: no login required (for OAuth verification and general access)
  const isPublicPage =
    pathname === "/" ||
    pathname?.startsWith("/privacy") ||
    pathname?.startsWith("/terms");

  useEffect(() => {
    // Don't run redirects until component is mounted
    if (!mounted) return;

    // Don't redirect while loading or if already on billing/auth/seo-audit/public pages
    if (
      sessionStatus === "loading" ||
      isLoading ||
      pathname.startsWith("/billing") ||
      isAuthPage ||
      isSeoAuditPage ||
      isPublicPage
    ) {
      return;
    }

    // First check: If user is not authenticated, redirect to sign in
    if (sessionStatus === "unauthenticated") {
      const callbackUrl = encodeURIComponent(pathname || "/dashboard");
      router.push(`/auth/signin?callbackUrl=${callbackUrl}`);
      return;
    }

    // Only check account-related redirects if user is authenticated
    if (sessionStatus === "authenticated") {
      // TRIAL PERIOD DISABLED: All @NytroMarketing.com users have full access
      // Preserved trial expiration redirect below for future re-enablement:
      // if (isTrialExpired) {
      //   router.push("/billing?reason=trial_expired");
      //   return;
      // }
      
      // Trial period check is disabled - skip redirect

      if (isSubscriptionExpired) {
        router.push("/billing?reason=subscription_expired");
        return;
      }

      // Redirect to account selection if no account is selected (but user is authenticated)
      // Exception: SEO audit page doesn't require an account
      if (!currentAccount && !isLoading && !isSeoAuditPage) {
        router.push("/auth/select-account");
        return;
      }
    }
  }, [currentAccount, isTrialExpired, isSubscriptionExpired, isLoading, router, pathname, isAuthPage, isSeoAuditPage, isPublicPage, mounted, sessionStatus]);

  // On initial render (server or before mount), always render children
  // to prevent hydration mismatch. Redirects will happen in useEffect.
  if (!mounted) {
    return <>{children}</>;
  }

  // Always allow auth, public, and SEO audit pages to render without login
  if (isAuthPage || isSeoAuditPage || isPublicPage) {
    return <>{children}</>;
  }

  // Show loading state while checking authentication or account status
  if (sessionStatus === "loading" || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Redirect logic happens in useEffect - don't block rendering here
  // This ensures the UI doesn't go completely blank
  return <>{children}</>;
}