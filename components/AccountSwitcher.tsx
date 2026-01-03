"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useAccount } from "@/lib/account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Check, ChevronDown, Building2, Plus, Loader2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  getUserMode, 
  getAccountTerminology 
} from "@/lib/user-utils";

interface AccountSwitcherProps {
  /**
   * Force show account management features (create new) even for single account
   * Useful for settings page where user might want to create more accounts
   */
  forceFullMode?: boolean;
}

export function AccountSwitcher({ forceFullMode = false }: AccountSwitcherProps) {
  const { currentAccount, accounts, isLoading, switchAccount, createAccount } = useAccount();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");

  // Detect user mode and get appropriate terminology
  const userMode = getUserMode(accounts);
  const terminology = getAccountTerminology(userMode);
  
  // Determine what features to show
  const hasMultipleAccounts = accounts.length > 1;
  const showAccountManagement = forceFullMode || hasMultipleAccounts;

  const handleSwitch = async (accountId: string) => {
    if (accountId === currentAccount?.id) {
      setOpen(false);
      return;
    }
    
    try {
      await switchAccount(accountId);
      setOpen(false);
    } catch (error) {
      console.error("Failed to switch account:", error);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) return;
    
    setIsCreating(true);
    try {
      await createAccount(newAccountName.trim());
      setNewAccountName("");
      setOpen(false);
    } catch (error) {
      console.error("Failed to create account:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create account. Please try again.";
      alert(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    try {
      await signOut({ callbackUrl: "/auth/signin" });
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <Button variant="outline" disabled className="w-full sm:w-[200px] min-h-[44px] sm:min-h-0">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading...
      </Button>
    );
  }

  // Don't render if no accounts
  if (accounts.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          aria-haspopup="true"
          className="w-full sm:w-[200px] justify-between min-h-[44px] sm:min-h-0"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm sm:text-base">
              {currentAccount?.name || terminology.account}
            </span>
          </div>
          <ChevronDown className={cn(
            "ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform duration-200",
            open && "rotate-180"
          )} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[280px] p-0" align="end">
        <Command>
          {/* Search only shown when there are multiple accounts */}
          {showAccountManagement && (
            <CommandInput placeholder={`Search ${terminology.accounts.toLowerCase()}...`} />
          )}
          <CommandList>
            {showAccountManagement && (
              <CommandEmpty>No {terminology.account.toLowerCase()} found</CommandEmpty>
            )}
            
            {/* Account list */}
            <CommandGroup heading={showAccountManagement ? terminology.accounts : undefined}>
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={account.id}
                  onSelect={() => handleSwitch(account.id)}
                  className="flex items-center gap-2 min-h-[48px] sm:min-h-0 py-2 sm:py-1.5"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      currentAccount?.id === account.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-sm sm:text-base">{account.name}</span>
                  {account.role && showAccountManagement && (
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                      {account.role}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>

            {/* Create new account - only when managing multiple accounts */}
            {showAccountManagement && (
              <CommandGroup>
                <div className="px-2 py-2 sm:py-1.5 border-t">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder={`New ${terminology.account.toLowerCase()} name`}
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isCreating) {
                          handleCreateAccount();
                        }
                      }}
                      className="flex-1 h-10 sm:h-8 text-sm min-h-[44px] sm:min-h-0"
                      disabled={isCreating}
                    />
                    <Button
                      size="sm"
                      onClick={handleCreateAccount}
                      disabled={isCreating || !newAccountName.trim()}
                      className="shrink-0 h-10 sm:h-8 px-3 sm:px-2 min-w-[44px] sm:min-w-0"
                    >
                      {isCreating ? (
                        <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 sm:h-3 sm:w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </CommandGroup>
            )}

            <CommandSeparator />

            {/* Sign out - always available */}
            <CommandGroup>
              <CommandItem
                onSelect={handleLogout}
                className="flex items-center gap-2 min-h-[48px] sm:min-h-0 py-2 sm:py-1.5 text-destructive cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
