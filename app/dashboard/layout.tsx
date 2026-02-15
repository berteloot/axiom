"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/lib/account-context";
import { cn } from "@/lib/utils";
import { LayoutDashboard, BarChart3, Target, Search } from "lucide-react";

const dashboardNav = [
  {
    name: "Assets",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Assets, matrix & campaigns",
  },
  {
    name: "ABM",
    href: "/dashboard/abm",
    icon: Target,
    description: "Account-based marketing & outreach",
  },
  {
    name: "Google Ads",
    href: "/dashboard/google-ads",
    icon: BarChart3,
    description: "Connect client Google Ads",
  },
  {
    name: "Signal Research",
    href: "/dashboard/signal-research",
    icon: Search,
    description: "Research buying signals from web, forums, jobs & press",
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { currentAccount, isLoading } = useAccount();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8">
        {/* Dashboard sub-navigation */}
        <div className="mb-4 sm:mb-6">
          <nav
            className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit"
            aria-label="Dashboard sections"
          >
            {dashboardNav.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white text-brand-dark-blue shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Page content */}
        <div className={cn(
          pathname?.startsWith("/dashboard/google-ads") ? "max-w-4xl" : "",
          pathname?.startsWith("/dashboard/abm") ? "max-w-6xl" : "",
          pathname?.startsWith("/dashboard/signal-research") ? "max-w-6xl" : ""
        )}>
          {children}
        </div>
      </div>
    </div>
  );
}
