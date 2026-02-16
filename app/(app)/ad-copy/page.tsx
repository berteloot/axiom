"use client";

import { AdCopyGenerator } from "@/components/ad-copy/AdCopyGenerator";

export default function AdCopyPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] overflow-x-hidden bg-background">
      <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 max-w-[1600px]">
        <AdCopyGenerator />
      </div>
    </div>
  );
}
