"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Global provider that helps prevent data loss by:
 * 1. Warning before closing tab/window if there might be unsaved changes
 * 2. Clearing the warning when navigating within the app
 * 
 * Note: Individual forms use usePersistentState to save data to localStorage,
 * so data is actually preserved even if user closes the tab.
 */
export function FormPersistenceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Check if there's any persisted form data in localStorage
    const hasPersistedData = () => {
      if (typeof window === 'undefined') return false;
      
      try {
        const keys = Object.keys(window.localStorage);
        return keys.some(key => key.startsWith('persistent_'));
      } catch {
        return false;
      }
    };

    // Warn before closing/refreshing if there's persisted data
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPersistedData()) {
        // Modern browsers show a generic message
        // The custom message is not shown in most browsers anymore for security
        e.preventDefault();
        e.returnValue = ''; // Required for Chrome
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pathname]);

  return <>{children}</>;
}
