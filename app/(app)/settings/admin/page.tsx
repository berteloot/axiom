"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useAccount } from "@/lib/account-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Users,
  Settings,
  Shield,
  Database,
  CreditCard,
  Mail,
  Key,
  Bell,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Calendar,
  UserX,
  Clock,
  Zap,
  Building2,
  Search,
  TrendingUp
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ADMIN_EMAIL = "berteloot@gmail.com";

export default function AdminSettings() {
  const { data: session, status } = useSession();
  const { currentAccount, isLoading: accountLoading, refreshAccounts } = useAccount();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [orgSettings, setOrgSettings, clearOrgSettings] = usePersistentState("admin-org-settings", {
    name: "",
    description: "",
    website: "",
    allowPublicSharing: false,
    requireApproval: true,
    maxFileSize: 100,
    retentionDays: 365,
    emailNotifications: true,
    webhookUrl: "",
    apiRateLimit: 1000,
  });

  const [billingSettings] = useState({
    plan: "Professional",
    status: "Active",
    nextBilling: "2025-01-15",
    seatsUsed: 5,
    seatsLimit: 10,
  });

  // User management state
  interface User {
    id: string;
    email: string;
    name: string | null;
    role: "OWNER" | "ADMIN" | "MEMBER";
    emailVerified: string;
    joinedAt: string;
    userCreatedAt: string;
  }

  interface AllUser {
    id: string;
    email: string;
    name: string | null;
    emailVerified: string;
    accountType: string | null;
    createdAt: string;
    accountCount: number;
    assetCount: number;
    accounts: Array<{
      accountId: string;
      accountName: string;
      accountSlug: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
      joinedAt: string;
    }>;
  }

  interface AccountInfo {
    id: string;
    name: string;
    subscriptionStatus: "TRIAL" | "ACTIVE" | "CANCELLED" | "EXPIRED";
    trialEndsAt: string | null;
    subscriptionEndsAt: string | null;
  }

  interface AllAccount {
    id: string;
    name: string;
    slug: string;
    subscriptionStatus: "TRIAL" | "ACTIVE" | "CANCELLED" | "EXPIRED";
    trialEndsAt: string | null;
    subscriptionEndsAt: string | null;
    createdAt: string;
    userCount: number;
    assetCount: number;
    owners: Array<{
      id: string;
      email: string;
      name: string | null;
    }>;
  }

  const [allAccounts, setAllAccounts] = useState<AllAccount[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [revokeUserId, setRevokeUserId] = useState<string | null>(null);
  const [revokeUserName, setRevokeUserName] = useState<string>("");
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingUserRole, setEditingUserRole] = useState<"OWNER" | "ADMIN" | "MEMBER">("MEMBER");
  const [showRoleEditDialog, setShowRoleEditDialog] = useState(false);
  const [extendTrialDays, setExtendTrialDays] = useState<number>(14);
  const [searchAccountsQuery, setSearchAccountsQuery] = useState<string>("");
  const [searchUsersQuery, setSearchUsersQuery] = useState<string>("");

  // Access control: Only berteloot@gmail.com can access this page
  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    if (session?.user?.email !== ADMIN_EMAIL) {
      router.push("/dashboard");
      return;
    }
  }, [session, status, router]);

  // Load current settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!currentAccount?.id) return;

      try {
        const response = await fetch(`/api/accounts/${currentAccount.id}/settings`);
        if (response.ok) {
          const data = await response.json();
          setOrgSettings({
            name: data.account.name || "",
            description: data.account.description || "",
            website: data.account.website || "",
            allowPublicSharing: data.account.allowPublicSharing || false,
            requireApproval: data.account.requireApproval ?? true,
            maxFileSize: data.account.maxFileSize || 100,
            retentionDays: data.account.retentionDays || 365,
            emailNotifications: data.account.emailNotifications ?? true,
            webhookUrl: data.account.webhookUrl || "",
            apiRateLimit: data.account.apiRateLimit || 1000,
          });
        }
      } catch (error) {
        // Error logged silently - user sees error message via UI
      } finally {
        setSettingsLoading(false);
      }
    };

    loadSettings();
  }, [currentAccount]);

  // Load all accounts
  const loadAllAccounts = async () => {
    setAccountsLoading(true);
    try {
      const response = await fetch(`/api/admin/accounts`);
      if (response.ok) {
        const data = await response.json();
        setAllAccounts(data.accounts || []);
        // Auto-select current account if available, otherwise first account
        if (!selectedAccountId && currentAccount?.id) {
          setSelectedAccountId(currentAccount.id);
        } else if (!selectedAccountId && data.accounts?.length > 0) {
          setSelectedAccountId(data.accounts[0].id);
        }
      } else {
        setErrorMessage("Failed to load accounts");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to load accounts");
    } finally {
      setAccountsLoading(false);
    }
  };

  // Load users for the selected account
  const loadUsers = async (accountId: string) => {
    if (!accountId) return;

    setUsersLoading(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}/users`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
        setAccountInfo(data.account || null);
      } else {
        setErrorMessage("Failed to load users");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  // Load all users in the system
  const loadAllUsers = async () => {
    setAllUsersLoading(true);
    try {
      const response = await fetch(`/api/admin/users`);
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data.users || []);
      } else {
        setErrorMessage("Failed to load users");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to load users");
    } finally {
      setAllUsersLoading(false);
    }
  };

  // Load all accounts on mount
  useEffect(() => {
    loadAllAccounts();
    loadAllUsers();
  }, []);

  // Load users when selected account changes
  useEffect(() => {
    if (selectedAccountId) {
      loadUsers(selectedAccountId);
    }
  }, [selectedAccountId]);

  // Handle extend trial
  const handleExtendTrial = async () => {
    if (!selectedAccountId) return;

    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/accounts/${selectedAccountId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extend_trial", days: extendTrialDays }),
      });

      if (response.ok) {
        setSuccessMessage(`Trial extended by ${extendTrialDays} days`);
        await loadUsers(selectedAccountId);
        await loadAllAccounts();
        await refreshAccounts();
      } else {
        const data = await response.json();
        setErrorMessage(data.error || "Failed to extend trial");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to extend trial");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle activate subscription
  const handleActivateSubscription = async () => {
    if (!selectedAccountId) return;

    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/accounts/${selectedAccountId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });

      if (response.ok) {
        setSuccessMessage("Subscription activated successfully");
        await loadUsers(selectedAccountId);
        await loadAllAccounts();
        await refreshAccounts();
      } else {
        const data = await response.json();
        setErrorMessage(data.error || "Failed to activate subscription");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to activate subscription");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle revoke access
  const handleRevokeAccess = async () => {
    if (!selectedAccountId || !revokeUserId) return;

    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/accounts/${selectedAccountId}/users/${revokeUserId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSuccessMessage(`Access revoked for ${revokeUserName}`);
        setShowRevokeDialog(false);
        setRevokeUserId(null);
        setRevokeUserName("");
        await loadUsers(selectedAccountId);
        await loadAllAccounts();
        await loadAllUsers();
      } else {
        const data = await response.json();
        setErrorMessage(data.error || "Failed to revoke access");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to revoke access");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle update user role
  const handleUpdateUserRole = async () => {
    if (!selectedAccountId || !editingUser) return;

    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/admin/accounts/${selectedAccountId}/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: editingUserRole }),
      });

      if (response.ok) {
        setSuccessMessage(`User role updated to ${editingUserRole}`);
        setShowRoleEditDialog(false);
        setEditingUser(null);
        await loadUsers(selectedAccountId);
        await loadAllAccounts();
        await loadAllUsers();
      } else {
        const data = await response.json();
        setErrorMessage(data.error || "Failed to update user role");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to update user role");
    } finally {
      setIsLoading(false);
    }
  };

  // Open revoke dialog
  const openRevokeDialog = (user: User) => {
    setRevokeUserId(user.id);
    setRevokeUserName(user.name || user.email);
    setShowRevokeDialog(true);
  };

  // Open role edit dialog
  const openRoleEditDialog = (user: User) => {
    setEditingUser(user);
    setEditingUserRole(user.role);
    setShowRoleEditDialog(true);
  };

  // Show loading while checking authorization
  if (status === "loading" || accountLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Block access if not the admin
  if (session?.user?.email !== ADMIN_EMAIL) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-destructive" />
              Unauthorized Access
            </CardTitle>
            <CardDescription>
              You do not have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")} className="w-full">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSaveSettings = async () => {
    if (!currentAccount?.id) return;

    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/accounts/${currentAccount.id}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orgSettings),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage("Settings saved successfully!");
        // Refresh account data to reflect changes
        await refreshAccounts();
      } else {
        setErrorMessage(data.error || "Failed to save settings. Please try again.");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to save settings. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!currentAccount?.id) return;

    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/accounts/${currentAccount.id}/export`, {
        method: "POST",
      });

      if (response.ok) {
        // Get the filename from content-disposition header
        const contentDisposition = response.headers.get("content-disposition");
        const filename = contentDisposition
          ? contentDisposition.split("filename=")[1].replace(/"/g, "")
          : `organization-export-${new Date().toISOString().split('T')[0]}.json`;

        // Create blob from response and trigger download
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setSuccessMessage("Data export completed successfully!");
      } else {
        const error = await response.json();
        setErrorMessage(error.error || "Failed to export data.");
      }
    } catch (error) {
      // Error logged silently - user sees error message via UI
      setErrorMessage("Failed to export data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!confirm("Are you sure you want to delete this organization? This action cannot be undone and will permanently delete all data.")) {
      return;
    }

    setIsLoading(true);
    try {
      // TODO: Implement organization deletion
      alert("Organization deletion not yet implemented");
    } catch (error) {
      setErrorMessage("Failed to delete organization.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground">
            Manage your organization settings and preferences (Admin Only)
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-3 py-1">
          SUPER ADMIN
        </Badge>
      </div>

      {successMessage && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">All Accounts</TabsTrigger>
          <TabsTrigger value="users">All Users</TabsTrigger>
          <TabsTrigger value="account-management">Account Management</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Accounts</CardDescription>
                <CardTitle className="text-3xl font-bold">{allAccounts.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4 mr-1" />
                  Organizations in system
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Users</CardDescription>
                <CardTitle className="text-3xl font-bold">{allUsers.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Users className="h-4 w-4 mr-1" />
                  Registered users
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Subscriptions</CardDescription>
                <CardTitle className="text-3xl font-bold">
                  {allAccounts.filter(a => a.subscriptionStatus === "ACTIVE").length}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Paid accounts
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Trial Accounts</CardDescription>
                <CardTitle className="text-3xl font-bold">
                  {allAccounts.filter(a => a.subscriptionStatus === "TRIAL").length}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-1" />
                  In trial period
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest accounts and users created</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Recent Accounts</h4>
                  <div className="space-y-2">
                    {allAccounts.slice(0, 5).map((account) => (
                      <div key={account.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-medium">{account.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {account.userCount} users • {account.assetCount} assets
                          </p>
                        </div>
                        <Badge variant={account.subscriptionStatus === "ACTIVE" ? "default" : "secondary"}>
                          {account.subscriptionStatus}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                All Accounts
              </CardTitle>
              <CardDescription>
                View and manage all accounts in the system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search accounts by name or slug..."
                    value={searchAccountsQuery}
                    onChange={(e) => setSearchAccountsQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {accountsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : allAccounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No accounts found
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead>Assets</TableHead>
                        <TableHead>Owners</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allAccounts
                        .filter((account) => {
                          if (!searchAccountsQuery) return true;
                          const query = searchAccountsQuery.toLowerCase();
                          return (
                            account.name.toLowerCase().includes(query) ||
                            account.slug.toLowerCase().includes(query)
                          );
                        })
                        .map((account) => (
                          <TableRow key={account.id}>
                            <TableCell className="font-medium">{account.name}</TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{account.slug}</code>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  account.subscriptionStatus === "ACTIVE"
                                    ? "default"
                                    : account.subscriptionStatus === "TRIAL"
                                    ? "secondary"
                                    : "destructive"
                                }
                              >
                                {account.subscriptionStatus}
                              </Badge>
                            </TableCell>
                            <TableCell>{account.userCount}</TableCell>
                            <TableCell>{account.assetCount}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {account.owners.slice(0, 2).map((owner) => (
                                  <span key={owner.id} className="text-sm">
                                    {owner.name || owner.email}
                                  </span>
                                ))}
                                {account.owners.length > 2 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{account.owners.length - 2} more
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(account.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedAccountId(account.id);
                                  // Switch to account management tab
                                  const tabsList = document.querySelector('[role="tablist"]');
                                  const accountManagementTab = Array.from(tabsList?.querySelectorAll('button') || [])
                                    .find(btn => btn.getAttribute('data-state') !== 'active' && btn.textContent?.includes('Account Management'));
                                  accountManagementTab?.click();
                                }}
                              >
                                Manage
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Users
              </CardTitle>
              <CardDescription>
                View all users in the system and their account associations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users by email or name..."
                    value={searchUsersQuery}
                    onChange={(e) => setSearchUsersQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {allUsersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : allUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No users found
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Account Type</TableHead>
                        <TableHead>Accounts</TableHead>
                        <TableHead>Assets</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allUsers
                        .filter((user) => {
                          if (!searchUsersQuery) return true;
                          const query = searchUsersQuery.toLowerCase();
                          return (
                            user.email.toLowerCase().includes(query) ||
                            (user.name && user.name.toLowerCase().includes(query))
                          );
                        })
                        .map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">
                              {user.name || "—"}
                            </TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                              <Badge
                                variant={user.emailVerified === "VERIFIED" ? "default" : "secondary"}
                              >
                                {user.emailVerified === "VERIFIED" ? "Verified" : "Unverified"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {user.accountType || (
                                <span className="text-muted-foreground">Legacy</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {user.accounts.slice(0, 3).map((acc) => (
                                  <div key={acc.accountId} className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {acc.role}
                                    </Badge>
                                    <span className="text-sm">{acc.accountName}</span>
                                  </div>
                                ))}
                                {user.accounts.length > 3 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{user.accounts.length - 3} more
                                  </span>
                                )}
                                {user.accounts.length === 0 && (
                                  <span className="text-sm text-muted-foreground">No accounts</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{user.assetCount}</TableCell>
                            <TableCell>
                              {new Date(user.createdAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Organization Profile
              </CardTitle>
              <CardDescription>
                Basic information about your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    value={orgSettings.name}
                    onChange={(e) => setOrgSettings(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-website">Website</Label>
                  <Input
                    id="org-website"
                    type="url"
                    placeholder="https://yourcompany.com"
                    value={orgSettings.website}
                    onChange={(e) => setOrgSettings(prev => ({ ...prev, website: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-description">Description</Label>
                <Textarea
                  id="org-description"
                  placeholder="Brief description of your organization..."
                  value={orgSettings.description}
                  onChange={(e) => setOrgSettings(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Asset Management Settings</CardTitle>
              <CardDescription>
                Configure how assets are handled in your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Public Sharing</Label>
                  <p className="text-sm text-muted-foreground">
                    Let users create public links to assets
                  </p>
                </div>
                <Switch
                  checked={orgSettings.allowPublicSharing}
                  onCheckedChange={(checked) =>
                    setOrgSettings(prev => ({ ...prev, allowPublicSharing: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Approval</Label>
                  <p className="text-sm text-muted-foreground">
                    New assets need approval before being visible
                  </p>
                </div>
                <Switch
                  checked={orgSettings.requireApproval}
                  onCheckedChange={(checked) =>
                    setOrgSettings(prev => ({ ...prev, requireApproval: checked }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-file-size">Max File Size (MB)</Label>
                  <Input
                    id="max-file-size"
                    type="number"
                    value={orgSettings.maxFileSize}
                    onChange={(e) =>
                      setOrgSettings(prev => ({ ...prev, maxFileSize: parseInt(e.target.value) || 100 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retention-days">Data Retention (Days)</Label>
                  <Input
                    id="retention-days"
                    type="number"
                    value={orgSettings.retentionDays}
                    onChange={(e) =>
                      setOrgSettings(prev => ({ ...prev, retentionDays: parseInt(e.target.value) || 365 }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure security policies for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Require 2FA for all users
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Session Timeout</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically log out inactive users
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>IP Restrictions</Label>
                  <p className="text-sm text-muted-foreground">
                    Limit access to specific IP ranges
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Manage API keys for external integrations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Production API Key</p>
                  <p className="text-sm text-muted-foreground">•••••••••••••••••••••••••••••••abc123</p>
                </div>
                <div className="space-x-2">
                  <Button variant="outline" size="sm">Regenerate</Button>
                  <Button variant="outline" size="sm">Revoke</Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Development API Key</p>
                  <p className="text-sm text-muted-foreground">•••••••••••••••••••••••••••••••def456</p>
                </div>
                <div className="space-x-2">
                  <Button variant="outline" size="sm">Regenerate</Button>
                  <Button variant="outline" size="sm">Revoke</Button>
                </div>
              </div>

              <Button variant="outline" className="w-full">
                Create New API Key
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account-management" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Account User Management
              </CardTitle>
              <CardDescription>
                Select an account to manage its users and their access rights
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-select">Select Account</Label>
                {accountsLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading accounts...</span>
                  </div>
                ) : (
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger id="account-select" className="w-full">
                      <SelectValue placeholder="Select an account to manage users" />
                    </SelectTrigger>
                    <SelectContent>
                      {allAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.userCount} users, {account.assetCount} assets)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedAccountId && accountInfo && (
                <div className="p-4 border rounded-lg bg-muted/50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Account Name</Label>
                      <p className="text-lg font-semibold">{accountInfo.name}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Status</Label>
                      <Badge 
                        variant={
                          accountInfo.subscriptionStatus === "ACTIVE" ? "default" :
                          accountInfo.subscriptionStatus === "TRIAL" ? "secondary" :
                          "destructive"
                        }
                        className="mt-1"
                      >
                        {accountInfo.subscriptionStatus}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Users</Label>
                      <p className="text-lg font-semibold">{users.length}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Created</Label>
                      <p className="text-sm">{allAccounts.find(a => a.id === selectedAccountId)?.createdAt 
                        ? new Date(allAccounts.find(a => a.id === selectedAccountId)!.createdAt).toLocaleDateString()
                        : "—"}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedAccountId ? (
                usersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    No users found in this account
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.name || "—"}
                          </TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={user.role === "OWNER" ? "default" : user.role === "ADMIN" ? "secondary" : "outline"}>
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.emailVerified === "VERIFIED" ? "default" : "secondary"}>
                              {user.emailVerified === "VERIFIED" ? "Verified" : "Unverified"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(user.joinedAt).toLocaleDateString()}
                          </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openRoleEditDialog(user)}
                              >
                                <Shield className="h-4 w-4 mr-1" />
                                Edit Role
                              </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRevokeDialog(user)}
                              className="text-destructive hover:text-destructive"
                            >
                              <UserX className="h-4 w-4 mr-1" />
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Please select an account to manage its users
                </div>
              )}

              <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke Access</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to revoke access for <strong>{revokeUserName}</strong>? 
                      This will remove their access to this account immediately.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRevokeAccess}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Revoke Access
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={showRoleEditDialog} onOpenChange={setShowRoleEditDialog}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Edit User Role</AlertDialogTitle>
                    <AlertDialogDescription>
                      Change the role for <strong>{editingUser?.name || editingUser?.email}</strong> in this account.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="role-select">Role</Label>
                      <Select value={editingUserRole} onValueChange={(value) => setEditingUserRole(value as "OWNER" | "ADMIN" | "MEMBER")}>
                        <SelectTrigger id="role-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OWNER">OWNER - Full control, can delete account</SelectItem>
                          <SelectItem value="ADMIN">ADMIN - Can manage users and settings</SelectItem>
                          <SelectItem value="MEMBER">MEMBER - Can create and manage assets only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleUpdateUserRole}
                      disabled={isLoading}
                    >
                      {isLoading ? "Updating..." : "Update Role"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Billing & Subscription
              </CardTitle>
              <CardDescription>
                Manage subscription and trial status for selected account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!selectedAccountId ? (
                <div className="text-center py-8 text-muted-foreground">
                  Please select an account from the Users tab to manage billing
                </div>
              ) : accountInfo && (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label className="text-sm font-medium">Account Name</Label>
                      <p className="text-lg font-semibold">{accountInfo.name}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Status</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant={
                            accountInfo.subscriptionStatus === "ACTIVE" ? "default" :
                            accountInfo.subscriptionStatus === "TRIAL" ? "secondary" :
                            "destructive"
                          }
                        >
                          {accountInfo.subscriptionStatus}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {accountInfo.subscriptionStatus === "TRIAL" && accountInfo.trialEndsAt && (
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4" />
                        <Label className="text-sm font-medium">Trial Information</Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Trial ends: <strong>{new Date(accountInfo.trialEndsAt).toLocaleDateString()}</strong>
                      </p>
                    </div>
                  )}

                  {accountInfo.subscriptionStatus === "ACTIVE" && accountInfo.subscriptionEndsAt && (
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4" />
                        <Label className="text-sm font-medium">Subscription Information</Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Subscription ends: <strong>{new Date(accountInfo.subscriptionEndsAt).toLocaleDateString()}</strong>
                      </p>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Extend Trial</Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        Add additional days to the trial period
                      </p>
                      <div className="flex gap-2">
                        <Select
                          value={extendTrialDays.toString()}
                          onValueChange={(value) => setExtendTrialDays(parseInt(value))}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">7 days</SelectItem>
                            <SelectItem value="14">14 days</SelectItem>
                            <SelectItem value="30">30 days</SelectItem>
                            <SelectItem value="60">60 days</SelectItem>
                            <SelectItem value="90">90 days</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={handleExtendTrial}
                          disabled={isLoading}
                          variant="outline"
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Extend Trial
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <Label className="text-sm font-medium mb-2 block">Convert to Active Subscription</Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        Convert trial account to active paid subscription (1 year)
                      </p>
                      <Button
                        onClick={handleActivateSubscription}
                        disabled={isLoading || accountInfo.subscriptionStatus === "ACTIVE"}
                        variant="default"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Activate Subscription
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {!accountInfo && !usersLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  No account information available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email & Notifications
              </CardTitle>
              <CardDescription>
                Configure email settings and notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send email notifications for important events
                  </p>
                </div>
                <Switch
                  checked={orgSettings.emailNotifications}
                  onCheckedChange={(checked) =>
                    setOrgSettings(prev => ({ ...prev, emailNotifications: checked }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://yourapp.com/webhook"
                  value={orgSettings.webhookUrl}
                  onChange={(e) => setOrgSettings(prev => ({ ...prev, webhookUrl: e.target.value }))}
                />
                <p className="text-sm text-muted-foreground">
                  Receive real-time notifications about asset events
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Rate Limiting</CardTitle>
              <CardDescription>
                Control API usage and prevent abuse
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-rate-limit">Requests per Hour</Label>
                <Input
                  id="api-rate-limit"
                  type="number"
                  value={orgSettings.apiRateLimit}
                  onChange={(e) =>
                    setOrgSettings(prev => ({ ...prev, apiRateLimit: parseInt(e.target.value) || 1000 }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Management
              </CardTitle>
              <CardDescription>
                Export, backup, and manage your organization data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button variant="outline" onClick={handleExportData} disabled={isLoading}>
                  <Download className="h-4 w-4 mr-2" />
                  {isLoading ? "Exporting..." : "Export All Data"}
                </Button>

                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Import Data
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <span className="text-sm">Audit Logs</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  View detailed logs of all organization activity
                </p>
                <Button variant="outline">View Audit Logs</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg">
                <div>
                  <h4 className="font-medium text-red-600">Delete Organization</h4>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this organization and all associated data
                  </p>
                </div>
                <Button variant="destructive" onClick={handleDeleteOrganization}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}