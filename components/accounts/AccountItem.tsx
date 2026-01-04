"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Edit2, Trash2, X, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AccountManagersSection } from "./AccountManagersSection";
import { TeamMembersSection } from "./TeamMembersSection";
import { getAccountColorScheme } from "@/lib/account-color-utils";

interface AccountManager {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface AccountWithManagers {
  id: string;
  name: string;
  slug: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
  managers?: AccountManager[];
}

interface AccountItemProps {
  account: AccountWithManagers;
  switchingAccountId: string | null;
  deletingAccountId: string | null;
  onSwitchAccount: (accountId: string) => Promise<void>;
  onEditAccount: (account: AccountWithManagers) => void;
  onSaveEdit: () => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
  editingAccount: AccountWithManagers | null;
  editAccountName: string;
  onEditAccountNameChange: (name: string) => void;
  isEditing: boolean;
  onCancelEdit: () => void;
  onOpenManagerDialog: (accountId: string, manager?: AccountManager) => void;
  onLoadManagers: (accountId: string) => Promise<void>;
  onDeleteManager: (accountId: string, managerId: string) => Promise<void>;
}

export function AccountItem({
  account,
  switchingAccountId,
  deletingAccountId,
  onSwitchAccount,
  onEditAccount,
  onSaveEdit,
  onDeleteAccount,
  editingAccount,
  editAccountName,
  onEditAccountNameChange,
  isEditing,
  onCancelEdit,
  onOpenManagerDialog,
  onLoadManagers,
  onDeleteManager,
}: AccountItemProps) {
  const isEditingThisAccount = editingAccount?.id === account.id;
  const colorScheme = getAccountColorScheme(account.id, account.name);

  return (
    <div className={`border-2 ${colorScheme.border} rounded-lg p-4 space-y-4 ${colorScheme.bg} transition-colors`}>
      {/* Account Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`${colorScheme.accent} rounded-md p-1.5 shrink-0`}>
            <Building2 className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            {isEditingThisAccount ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Input
                  value={editAccountName}
                  onChange={(e) => onEditAccountNameChange(e.target.value)}
                  className="flex-1 min-h-[44px]"
                  disabled={isEditing}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={onSaveEdit}
                    disabled={isEditing || !editAccountName.trim()}
                    className="min-h-[44px] flex-1 sm:flex-initial"
                  >
                    {isEditing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onCancelEdit}
                    disabled={isEditing}
                    className="min-h-[44px] min-w-[44px]"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="font-medium text-base sm:text-lg truncate">{account.name}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {account.role && (
                    <span className="capitalize">{account.role.toLowerCase()}</span>
                  )}
                  {account.role && " • "}
                  Created {new Date(account.createdAt).toLocaleDateString()}
                </div>
              </>
            )}
          </div>
        </div>
        {!isEditingThisAccount && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {(account.role === "OWNER" || account.role === "ADMIN") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditAccount(account)}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                {account.role === "OWNER" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deletingAccountId === account.id}
                        className="min-h-[44px] min-w-[44px]"
                      >
                        {deletingAccountId === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="mx-4 sm:mx-0 max-w-[calc(100vw-2rem)]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Account</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete &quot;{account.name}&quot;? This action cannot be undone.
                          All assets, collections, and related data will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                        <AlertDialogCancel className="w-full sm:w-auto min-h-[44px]">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDeleteAccount(account.id)}
                          className="w-full sm:w-auto min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSwitchAccount(account.id)}
              disabled={switchingAccountId === account.id}
              className="min-h-[44px]"
            >
              {switchingAccountId === account.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  <span className="hidden sm:inline">Switching...</span>
                </>
              ) : (
                "Switch"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Team Members Section */}
      {(account.role === "OWNER" || account.role === "ADMIN") && (
        <div className={`border-t ${colorScheme.border} pt-4`}>
          <TeamMembersSection
            accountId={account.id}
            accountName={account.name}
            colorScheme={colorScheme}
          />
        </div>
      )}

      {/* Account Managers Section */}
      {(account.role === "OWNER" || account.role === "ADMIN") && (
        <AccountManagersSection
          account={account}
          onOpenManagerDialog={onOpenManagerDialog}
          onLoadManagers={onLoadManagers}
          onDeleteManager={onDeleteManager}
        />
      )}
    </div>
  );
}
