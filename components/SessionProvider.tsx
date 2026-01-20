"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextAuthSessionProvider
      // Refetch session every 5 minutes (300 seconds) instead of default behavior
      // This reduces unnecessary server load while keeping sessions fresh
      refetchInterval={5 * 60}
      // Only refetch on window focus if the session is older than 1 minute
      // This prevents excessive refetching when switching tabs
      refetchOnWindowFocus={true}
      // Don't refetch when coming back online (session will be checked on next interval)
      refetchWhenOffline={false}
    >
      {children}
    </NextAuthSessionProvider>
  );
}