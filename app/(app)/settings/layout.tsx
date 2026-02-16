"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/lib/account-context";
import { cn } from "@/lib/utils";
import { User, Building2, Loader2 } from "lucide-react";
import { AccountSwitcher } from "@/components/AccountSwitcher";

const settingsNav = [
  {
    name: "Accounts",
    href: "/settings/accounts",
    icon: Building2,
    description: "Create and manage accounts",
  },
  {
    name: "Company Context",
    href: "/settings/profile",
    icon: User,
    description: "Brand & product lines",
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { currentAccount, isLoading } = useAccount();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header with current account indicator */}
          <div className="mb-4 sm:mb-6 lg:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold font-roboto-condensed text-brand-dark-blue">Settings</h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
                  Manage your accounts and configure company context
                </p>
              </div>
              
              {/* Current account indicator */}
              <div className="flex items-center gap-3">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : currentAccount ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground hidden sm:inline">Current:</span>
                    <AccountSwitcher />
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700">
                      No account selected
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
            {/* Sidebar Navigation */}
            <aside className="w-full lg:w-64 shrink-0">
              <nav className="flex lg:flex-col gap-2 lg:gap-1 overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
                {settingsNav.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap min-h-[48px] lg:min-h-0",
                        isActive
                          ? "bg-brand-orange text-white"
                          : "text-muted-foreground hover:bg-brand-orange/10 hover:text-brand-orange"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="flex flex-col">
                        <span>{item.name}</span>
                        <span className="text-xs font-normal text-muted-foreground hidden lg:inline">
                          {item.description}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </nav>

              {/* Help text */}
              <div className="hidden lg:block mt-6 p-4 bg-muted/50 rounded-lg border border-border">
                <h3 className="text-sm font-medium mb-2">Getting Started</h3>
                <ol className="text-xs text-muted-foreground space-y-2">
                  <li className="flex gap-2">
                    <span className="font-medium shrink-0">1.</span>
                    <span>Create an account in the Accounts section</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium shrink-0">2.</span>
                    <span>Set up Brand Identity and Product Lines</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium shrink-0">3.</span>
                    <span>Switch accounts using the dropdown above</span>
                  </li>
                </ol>
              </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
