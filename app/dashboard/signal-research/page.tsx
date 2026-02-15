"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SignalResearchPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/abm");
  }, [router]);
  return null;
}
