"use client";

import { SeoAuditForm } from "@/components/seo/SeoAuditForm";
import { useAccount } from "@/lib/account-context";

export default function SeoAuditPage() {
  const { currentAccount } = useAccount();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8">
        <SeoAuditForm accountId={currentAccount?.id} />
      </div>
    </div>
  );
}
