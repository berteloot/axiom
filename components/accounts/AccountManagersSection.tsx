"use client";

import { Button } from "@/components/ui/button";
import { Mail, User, Edit2, Trash2, Plus } from "lucide-react";

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

interface AccountManagersSectionProps {
  account: AccountWithManagers;
  onOpenManagerDialog: (accountId: string, manager?: AccountManager) => void;
  onLoadManagers: (accountId: string) => Promise<void>;
  onDeleteManager: (accountId: string, managerId: string) => Promise<void>;
}

export function AccountManagersSection({
  account,
  onOpenManagerDialog,
  onLoadManagers,
  onDeleteManager,
}: AccountManagersSectionProps) {
  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium flex items-center gap-2 text-sm sm:text-base">
            <User className="h-4 w-4 shrink-0" />
            Account Managers
          </h4>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Contact persons for this account (informational only)
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onLoadManagers(account.id);
            onOpenManagerDialog(account.id);
          }}
          className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Manager
        </Button>
      </div>
      {account.managers && account.managers.length > 0 ? (
        <div className="space-y-2">
          {account.managers.map((manager) => (
            <div
              key={manager.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">{manager.name}</div>
                  <div className="text-xs text-muted-foreground">{manager.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onLoadManagers(account.id);
                    onOpenManagerDialog(account.id, manager);
                  }}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDeleteManager(account.id, manager.id)}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No account managers added yet</p>
      )}
    </div>
  );
}
