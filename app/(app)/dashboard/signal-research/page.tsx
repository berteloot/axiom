"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SignalResearchPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/abm");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      Redirecting to ABM…
    </div>
  );
}
