import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

// Force dynamic rendering - this page uses client-side hooks that require runtime data
// NOTE: This only works if deployed as Web Service (SSR), not Static Site
// Ensure Render is configured as "Web Service" not "Static Site"
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Loading skeleton for dashboard
function DashboardSkeleton() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div className="min-w-0 flex-1">
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-48 bg-gray-200 rounded mt-2 animate-pulse"></div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-10 w-40 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>

        {/* KPI Cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>

        {/* Content skeleton */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}

// Server Component page - wraps client component in Suspense
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardClient />
    </Suspense>
  );
}
