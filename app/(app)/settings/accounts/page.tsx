"use client";

import { useState, useEffect } from "react";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useAccount } from "@/lib/account-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2 } from "lucide-react";
import { CreateAccountForm } from "@/components/accounts/CreateAccountForm";
import { AccountItem } from "@/components/accounts/AccountItem";
import { ManagerDialog } from "@/components/accounts/ManagerDialog";
import { getUserMode, getAccountTerminology } from "@/lib/user-utils";

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

export default function AccountsPage() {
  const { accounts, accountType, isLoading, refreshAccounts, switchAccount, createAccount } = useAccount();
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [accountsWithManagers, setAccountsWithManagers] = useState<AccountWithManagers[]>([]);
  const [editingAccount, setEditingAccount] = useState<AccountWithManagers | null>(null);
  const [editAccountName, setEditAccountName, clearEditAccountName] = usePersistentState<string>("account-edit-name", "");
  const [isEditing, setIsEditing] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [managers, setManagers] = useState<AccountManager[]>([]);
  const [isManagerDialogOpen, setIsManagerDialogOpen] = useState(false);
  const [editingManager, setEditingManager] = useState<AccountManager | null>(null);
  const [managerName, setManagerName, clearManagerName] = usePersistentState<string>("manager-name", "");
  const [managerEmail, setManagerEmail, clearManagerEmail] = usePersistentState<string>("manager-email", "");
  const [isSavingManager, setIsSavingManager] = useState(false);
  const [isLoadingManagers, setIsLoadingManagers] = useState(false);

  // Detect user mode for adaptive terminology
  const userMode = getUserMode(accounts);
  const terminology = getAccountTerminology(userMode);

  useEffect(() => {
    if (accounts.length > 0) {
      loadAccountsWithManagers();
    }
  }, [accounts]);

  const loadAccountsWithManagers = async () => {
    const accountsData = await Promise.all(
      accounts.map(async (account) => {
        try {
          const response = await fetch(`/api/accounts/${account.id}/managers`);
          if (response.ok) {
            const data = await response.json();
            return { ...account, managers: data.managers || [] };
          }
        } catch (error) {
          console.error(`Error loading managers for account ${account.id}:`, error);
        }
        return { ...account, managers: [] };
      })
    );
    setAccountsWithManagers(accountsData);
  };

  const handleCreateAccount = async (name: string) => {
    await createAccount(name);
    await refreshAccounts();
  };

  const handleSwitchAccount = async (accountId: string) => {
    setSwitchingAccountId(accountId);
    try {
      await switchAccount(accountId);
    } catch (error) {
      console.error("Failed to switch account:", error);
      alert("Failed to switch account. Please try again.");
    } finally {
      setSwitchingAccountId(null);
    }
  };

  const handleEditAccount = (account: AccountWithManagers) => {
    setEditingAccount(account);
    setEditAccountName(account.name);
  };

  const handleSaveEdit = async () => {
    if (!editingAccount || !editAccountName.trim()) return;
    
    setIsEditing(true);
    try {
      const response = await fetch(`/api/accounts/${editingAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editAccountName.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update account");
      }

      setEditingAccount(null);
      setEditAccountName("");
      clearEditAccountName(); // Clear persisted data after successful save
      await refreshAccounts();
    } catch (error) {
      console.error("Failed to update account:", error);
      alert(error instanceof Error ? error.message : "Failed to update account. Please try again.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    setDeletingAccountId(accountId);
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete account");
      }

      await refreshAccounts();
      setDeletingAccountId(null);
    } catch (error) {
      console.error("Failed to delete account:", error);
      alert(error instanceof Error ? error.message : "Failed to delete account. Please try again.");
      setDeletingAccountId(null);
    }
  };

  const loadManagers = async (accountId: string) => {
    setIsLoadingManagers(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}/managers`);
      if (response.ok) {
        const data = await response.json();
        setManagers(data.managers || []);
      }
    } catch (error) {
      console.error("Error loading managers:", error);
    } finally {
      setIsLoadingManagers(false);
    }
  };

  const handleOpenManagerDialog = (accountId: string, manager?: AccountManager) => {
    setSelectedAccountId(accountId);
    if (manager) {
      setEditingManager(manager);
      setManagerName(manager.name);
      setManagerEmail(manager.email);
    } else {
      setEditingManager(null);
      setManagerName("");
      setManagerEmail("");
    }
    setIsManagerDialogOpen(true);
  };


  const handleSaveManager = async () => {
    if (!selectedAccountId || !managerName.trim() || !managerEmail.trim()) return;

    setIsSavingManager(true);
    try {
      const url = editingManager
        ? `/api/accounts/${selectedAccountId}/managers/${editingManager.id}`
        : `/api/accounts/${selectedAccountId}/managers`;
      
      const method = editingManager ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: managerName.trim(),
          email: managerEmail.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save manager");
      }

      setIsManagerDialogOpen(false);
      setEditingManager(null);
      setManagerName("");
      setManagerEmail("");
      clearManagerName(); // Clear persisted data after successful save
      clearManagerEmail();
      await loadManagers(selectedAccountId);
      await loadAccountsWithManagers();
    } catch (error) {
      console.error("Failed to save manager:", error);
      alert(error instanceof Error ? error.message : "Failed to save manager. Please try again.");
    } finally {
      setIsSavingManager(false);
    }
  };

  const handleDeleteManager = async (accountId: string, managerId: string) => {
    if (!confirm("Are you sure you want to delete this account manager?")) return;

    try {
      const response = await fetch(`/api/accounts/${accountId}/managers/${managerId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete manager");
      }

      await loadManagers(accountId);
      await loadAccountsWithManagers();
    } catch (error) {
      console.error("Failed to delete manager:", error);
      alert(error instanceof Error ? error.message : "Failed to delete manager. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Determine if account creation should be shown
  // Show for: Agency users, legacy users (null), or Corporate users with 0 accounts
  const canCreateAccount = accountType === "AGENCY" || 
                           accountType === null || 
                           (accountType === "CORPORATE" && accounts.length === 0);

  return (
    <div className="space-y-6">
      {canCreateAccount && (
        <CreateAccountForm 
          onCreateAccount={handleCreateAccount} 
          terminology={{
            account: terminology.account,
            accounts: terminology.accounts,
          }}
        />
      )}
      
      {!canCreateAccount && accountType === "CORPORATE" && accounts.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">
                Corporate accounts are limited to one organization. To manage multiple organizations, please upgrade to an Agency account.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts List */}
      <Card>
        <CardHeader>
          <CardTitle>Your {terminology.accounts}</CardTitle>
          <CardDescription>
            {accounts.length === 0
              ? `You don't have any ${terminology.accounts.toLowerCase()} yet. Create one to get started.`
              : userMode === "agency" 
                ? `Manage your ${terminology.accounts.toLowerCase()}, edit details, and configure account managers for each client.`
                : `Manage your ${terminology.account.toLowerCase()} settings and team members.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No {terminology.accounts.toLowerCase()} found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {accountsWithManagers.map((account) => (
                <AccountItem
                  key={account.id}
                  account={account}
                  switchingAccountId={switchingAccountId}
                  deletingAccountId={deletingAccountId}
                  onSwitchAccount={handleSwitchAccount}
                  onEditAccount={handleEditAccount}
                  onSaveEdit={handleSaveEdit}
                  onDeleteAccount={handleDeleteAccount}
                  editingAccount={editingAccount}
                  editAccountName={editAccountName}
                  onEditAccountNameChange={setEditAccountName}
                  isEditing={isEditing}
                  onCancelEdit={() => {
                    setEditingAccount(null);
                    setEditAccountName("");
                  }}
                  onOpenManagerDialog={handleOpenManagerDialog}
                  onLoadManagers={loadManagers}
                  onDeleteManager={handleDeleteManager}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ManagerDialog
        open={isManagerDialogOpen}
        onOpenChange={(open) => {
          setIsManagerDialogOpen(open);
          if (!open) {
            setEditingManager(null);
            setManagerName("");
            setManagerEmail("");
            clearManagerName(); // Clear persisted data when dialog closes
            clearManagerEmail();
          }
        }}
        editingManager={editingManager}
        managerName={managerName}
        managerEmail={managerEmail}
        onManagerNameChange={setManagerName}
        onManagerEmailChange={setManagerEmail}
        onSave={handleSaveManager}
        isSaving={isSavingManager}
      />
    </div>
  );
}
