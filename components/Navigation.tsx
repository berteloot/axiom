"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Upload, Settings, Menu, X, Shield, FolderSearch } from "lucide-react";
import Image from "next/image";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SmartCollectionList } from "@/components/smart-collections";

const ADMIN_EMAIL = "berteloot@gmail.com";

const baseNavigation = [
  {
    name: "Upload",
    href: "/",
    icon: Upload,
  },
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Settings",
    href: "/settings/profile",
    icon: Settings,
  },
];

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { currentAccount } = useAccount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Show admin settings only for berteloot@gmail.com
  const isSuperAdmin = session?.user?.email === ADMIN_EMAIL;

  const navigation = [
    ...baseNavigation,
    ...(isSuperAdmin ? [{
      name: "Admin",
      href: "/settings/admin",
      icon: Shield,
    }] : []),
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-brand-dark-blue/20 bg-brand-dark-blue backdrop-blur supports-[backdrop-filter]:bg-brand-dark-blue/95">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 min-w-0 flex-shrink-0">
            <Image 
              src="/NYTRO.png" 
              alt="AXIOM Logo" 
              width={40} 
              height={40} 
              className="shrink-0 h-8 w-8 sm:h-10 sm:w-10"
            />
            <span className="text-lg sm:text-xl font-semibold truncate font-roboto-condensed text-brand-orange">AXIOM</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2 lg:gap-4">
            <div className="flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== "/" && pathname?.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 lg:px-4 py-2 text-sm font-medium transition-colors min-h-[44px]",
                      isActive
                        ? "bg-brand-orange text-white"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden lg:inline">{item.name}</span>
                  </Link>
                );
              })}
              
              {/* Smart Collections Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 lg:px-4 py-2 text-sm font-medium transition-colors min-h-[44px]",
                      "text-white/80 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <FolderSearch className="h-4 w-4 shrink-0" />
                    <span className="hidden lg:inline">Collections</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <SmartCollectionList defaultOpen={true} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="hidden lg:block">
              <AccountSwitcher />
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="flex md:hidden items-center gap-2">
            <div className="lg:hidden">
              <AccountSwitcher />
            </div>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-white hover:bg-white/10"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-2">
                  {navigation.map((item) => {
                    const isActive = pathname === item.href || 
                      (item.href !== "/" && pathname?.startsWith(item.href));
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors min-h-[48px]",
                          isActive
                            ? "bg-brand-orange text-white"
                            : "text-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {item.name}
                      </Link>
                    );
                  })}
                  
                  {/* Smart Collections Section */}
                  <div className="pt-4 border-t">
                    <div className="px-2">
                      <SmartCollectionList 
                        defaultOpen={false} 
                        className="px-2"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <div className="px-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2 px-2">
                        Account
                      </p>
                      <AccountSwitcher />
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
