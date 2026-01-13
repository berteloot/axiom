"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Loader2, Mail, Clock, CheckCircle2, Trash2, RefreshCw, Edit2, Send, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";

interface TeamMember {
  id: string; // UserAccount ID (for API calls)
  userId: string; // User ID
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: "MEMBER" | "ADMIN";
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  createdAt: string;
  invitedBy: {
    name: string | null;
    email: string;
  };
}

interface TeamMembersSectionProps {
  accountId: string;
  accountName: string;
  colorScheme?: {
    bg: string;
    border: string;
    text: string;
    accent: string;
    badge: string;
  };
}

interface InvitableAccount {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "ADMIN";
}

export function TeamMembersSection({ accountId, accountName, colorScheme }: TeamMembersSectionProps) {
  const { data: session } = useSession();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isEditMemberDialogOpen, setIsEditMemberDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [invitableAccounts, setInvitableAccounts] = useState<InvitableAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([accountId]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  
  // Edit member state
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editMemberName, setEditMemberName] = useState("");
  const [editMemberEmail, setEditMemberEmail] = useState("");
  const [editMemberRole, setEditMemberRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  
  // Delete confirmation state
  const [deleteInvitationId, setDeleteInvitationId] = useState<string | null>(null);
  const [isDeletingInvitation, setIsDeletingInvitation] = useState(false);
  
  // Delete team member state
  const [deleteMemberId, setDeleteMemberId] = useState<string | null>(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  
  // Resend state
  const [resendingInvitationId, setResendingInvitationId] = useState<string | null>(null);
  
  // Send login email state
  const [sendingLoginEmailId, setSendingLoginEmailId] = useState<string | null>(null);

  const currentUserId = session?.user?.id;
  const currentUserRole = currentUserId
    ? teamMembers.find((m) => m.userId === currentUserId)?.role
    : undefined;
  const canEditRoles = currentUserRole === "OWNER";

  // Load members on mount (for display in the section)
  useEffect(() => {
    loadTeamMembers();
    loadInvitations();
    loadInvitableAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Reset selected accounts when dialog opens/closes
  useEffect(() => {
    if (isInviteDialogOpen) {
      setSelectedAccountIds([accountId]);
    }
  }, [isInviteDialogOpen, accountId]);

  const loadInvitableAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const response = await fetch("/api/invitations/accounts");
      if (response.ok) {
        const data = await response.json();
        setInvitableAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error("Error loading invitable accounts:", error);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const loadTeamMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}/members`);
      if (response.ok) {
        const data = await response.json();
        setTeamMembers(data.members || []);
      } else {
        setTeamMembers([]);
      }
    } catch (error) {
      console.error("Error loading team members:", error);
      setTeamMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const loadInvitations = async () => {
    try {
      const response = await fetch(`/api/accounts/${accountId}/invitations`);
      if (response.ok) {
        const data = await response.json();
        setInvitations(data.invitations || []);
      } else {
        setInvitations([]);
      }
    } catch (error) {
      console.error("Error loading invitations:", error);
      setInvitations([]);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    if (selectedAccountIds.length === 0) {
      setError("Please select at least one account");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use bulk API if multiple accounts selected, single API if one account
      const isBulk = selectedAccountIds.length > 1;
      const apiUrl = isBulk 
        ? "/api/invitations/bulk"
        : `/api/accounts/${selectedAccountIds[0]}/invitations`;
      
      const body = isBulk
        ? {
            email: inviteEmail.trim(),
            accountIds: selectedAccountIds,
            role: inviteRole,
          }
        : {
            email: inviteEmail.trim(),
            role: inviteRole,
          };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.inviteUrl) {
          console.log("🔗 Invitation URL:", data.inviteUrl);
          console.log("📧 Copy this URL and share it with", inviteEmail, "if email wasn't received");
        }
        
        const accountCount = isBulk ? selectedAccountIds.length : 1;
        const accountText = accountCount === 1 ? "account" : "accounts";
        setSuccess(`Invitation sent to ${accountCount} ${accountText}${data.inviteUrl ? "\n\nCheck browser console for invitation URL (dev mode)" : ""}`);
        setInviteEmail("");
        setInviteRole("MEMBER");
        setSelectedAccountIds([accountId]);
        await loadInvitations();
        setTimeout(() => {
          setIsInviteDialogOpen(false);
          setSuccess(null);
        }, data.inviteUrl ? 8000 : 2000);
      } else {
        setError(data.error || "Failed to send invitation");
      }
    } catch (error) {
      console.error("Error sending invitation:", error);
      setError("Failed to send invitation. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccountToggle = (accountIdToToggle: string) => {
    setSelectedAccountIds((prev) => {
      if (prev.includes(accountIdToToggle)) {
        // Don't allow deselecting if it's the only selected account
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter((id) => id !== accountIdToToggle);
      } else {
        return [...prev, accountIdToToggle];
      }
    });
  };

  const canInviteToMultipleAccounts = invitableAccounts.length > 1;

  const handleDeleteInvitation = async (invitationId: string) => {
    setIsDeletingInvitation(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}/invitations/${invitationId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadInvitations();
        setDeleteInvitationId(null);
        setSuccess("Invitation deleted successfully");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to delete invitation");
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error("Error deleting invitation:", error);
      setError("Failed to delete invitation. Please try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsDeletingInvitation(false);
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    setResendingInvitationId(invitationId);
    try {
      const response = await fetch(`/api/accounts/${accountId}/invitations/${invitationId}`, {
        method: "PATCH",
      });

      const data = await response.json();

      if (response.ok) {
        if (data.inviteUrl) {
          console.log("🔗 Invitation URL:", data.inviteUrl);
        }
        await loadInvitations();
        setSuccess(`Invitation resent to ${data.invitation?.email || "the invitee"}`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Failed to resend invitation");
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error("Error resending invitation:", error);
      setError("Failed to resend invitation. Please try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setResendingInvitationId(null);
    }
  };

  const handleEditMember = (member: TeamMember) => {
    setEditingMember(member);
    setEditMemberName(member.name || "");
    setEditMemberEmail(member.email);
    setEditMemberRole(member.role === "OWNER" ? "ADMIN" : member.role); // Can't edit owner
    setIsEditMemberDialogOpen(true);
  };

  const handleSaveMember = async () => {
    if (!editingMember) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: Record<string, unknown> = {
        email: editMemberEmail.trim(),
      };

      // Allow clearing name -> null, omit if unchanged
      const normalizedName = editMemberName.trim();
      const originalName = editingMember.name ?? "";
      if (normalizedName !== originalName.trim()) {
        payload.name = normalizedName.length > 0 ? normalizedName : null;
      }

      // Only owners can change roles; omit otherwise
      if (canEditRoles && editingMember.role !== "OWNER" && editMemberRole !== editingMember.role) {
        payload.role = editMemberRole;
      }

      const response = await fetch(`/api/accounts/${accountId}/members/${editingMember.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || "Team member updated successfully");
        setIsEditMemberDialogOpen(false);
        setEditingMember(null);
        setEditMemberName("");
        setEditMemberEmail("");
        setEditMemberRole("MEMBER");
        await loadTeamMembers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Failed to update team member");
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error("Error updating team member:", error);
      setError("Failed to update team member. Please try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendLoginEmail = async (memberId: string, email: string) => {
    setSendingLoginEmailId(memberId);
    try {
      const response = await fetch(`/api/accounts/${accountId}/members/${memberId}/send-login`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        if (data.verificationUrl) {
          console.log("🔗 Login URL:", data.verificationUrl);
        }
        setSuccess(`Login email sent to ${email}`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Failed to send login email");
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error("Error sending login email:", error);
      setError("Failed to send login email. Please try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setSendingLoginEmailId(null);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    setIsDeletingMember(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/accounts/${accountId}/members/${memberId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || "Team member removed successfully");
        setDeleteMemberId(null);
        await loadTeamMembers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Failed to remove team member");
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error("Error removing team member:", error);
      setError("Failed to remove team member. Please try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsDeletingMember(false);
    }
  };

  const pendingInvitations = invitations.filter((inv) => inv.status === "PENDING");
  
  // Get member to delete for confirmation dialog
  const memberToDelete = deleteMemberId ? teamMembers.find(m => m.id === deleteMemberId) : null;
  
  // Check for expired invitations
  const now = new Date();
  const getExpirationStatus = (expiresAt: string) => {
    const expires = new Date(expiresAt);
    const daysUntilExpiry = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) return { status: "expired", days: 0 };
    if (daysUntilExpiry <= 1) return { status: "expiring", days: daysUntilExpiry };
    return { status: "valid", days: daysUntilExpiry };
  };

  return (
    <div className="space-y-4">
      {/* Success/Error Messages */}
      {success && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Team Members</h3>
          {colorScheme && (
            <Badge variant="outline" className={`${colorScheme.badge} border-0 text-xs font-medium`}>
              {accountName}
            </Badge>
          )}
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-9">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                {canInviteToMultipleAccounts
                  ? "Select which accounts to invite this member to. They'll receive an email with a link to accept."
                  : `Send an invitation to join ${accountName}. They'll receive an email with a link to accept.`}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                {canInviteToMultipleAccounts && (
                  <div className="space-y-3">
                    <Label>Select Accounts</Label>
                    <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                      {isLoadingAccounts ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        invitableAccounts.map((account) => {
                          const isSelected = selectedAccountIds.includes(account.id);
                          const isCurrentAccount = account.id === accountId;
                          return (
                            <div
                              key={account.id}
                              className="flex items-center space-x-2 py-1.5"
                            >
                              <Checkbox
                                id={`account-${account.id}`}
                                checked={isSelected}
                                onCheckedChange={() => handleAccountToggle(account.id)}
                                disabled={isLoading || (isSelected && selectedAccountIds.length === 1)}
                              />
                              <label
                                htmlFor={`account-${account.id}`}
                                className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center justify-between"
                              >
                                <span>{account.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {isCurrentAccount && "(current)"}
                                </span>
                              </label>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      At least one account must be selected. The member will be invited to all selected accounts.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as "MEMBER" | "ADMIN")}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">Member - Can create and manage assets</SelectItem>
                      <SelectItem value="ADMIN">Admin - Can manage all assets and settings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {success && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteDialogOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Invitation
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoadingMembers && teamMembers.length === 0 && invitations.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Current Team Members */}
          {teamMembers.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Current Members</h4>
              <div className={`border ${colorScheme?.border || "border-border"} rounded-lg overflow-hidden`}>
                <Table>
                  <TableHeader>
                    <TableRow className={colorScheme ? `${colorScheme.bg} ${colorScheme.border}` : ""}>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const isOwner = member.role === "OWNER";
                      const rowClassName = colorScheme 
                        ? `${colorScheme.bg} hover:opacity-80 border-l-4 ${colorScheme.border} transition-colors` 
                        : "";
                      return (
                        <TableRow 
                          key={member.id}
                          className={rowClassName}
                        >
                          <TableCell className="font-medium">
                            {member.name || "—"}
                          </TableCell>
                          <TableCell>{member.email}</TableCell>
                          <TableCell>
                            <Badge variant={isOwner ? "default" : "secondary"}>
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(member.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditMember(member)}>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Edit Details
                                </DropdownMenuItem>
                                {!isOwner && (
                                  <>
                                    <DropdownMenuItem 
                                      onClick={() => handleSendLoginEmail(member.id, member.email)}
                                      disabled={sendingLoginEmailId === member.id}
                                    >
                                      {sendingLoginEmailId === member.id ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <Send className="h-4 w-4 mr-2" />
                                      )}
                                      Send Login Email
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => setDeleteMemberId(member.id)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Remove Member
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Pending Invitations</h4>
              <div className={`border ${colorScheme?.border || "border-border"} rounded-lg overflow-hidden`}>
                <Table>
                  <TableHeader>
                    <TableRow className={colorScheme ? `${colorScheme.bg} border-b ${colorScheme.border}` : ""}>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[150px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.map((invitation) => {
                      const expStatus = getExpirationStatus(invitation.expiresAt);
                      const isExpiring = expStatus.status === "expiring";
                      const isExpired = expStatus.status === "expired";
                      
                      const rowClassName = colorScheme 
                        ? `${colorScheme.bg} hover:opacity-80 border-l-4 ${colorScheme.border} transition-colors` 
                        : "";
                      return (
                        <TableRow 
                          key={invitation.id}
                          className={rowClassName}
                        >
                          <TableCell className="font-medium">{invitation.email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{invitation.role}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(invitation.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className={`flex items-center gap-1 ${isExpiring || isExpired ? "text-amber-600" : "text-muted-foreground"}`}>
                              <Clock className={`h-3 w-3 ${isExpiring || isExpired ? "text-amber-600" : ""}`} />
                              <span>
                                {isExpired 
                                  ? "Expired" 
                                  : isExpiring 
                                    ? `Expires in ${Math.ceil(expStatus.days * 24)}h`
                                    : `${expStatus.days}d left`}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isExpired ? "destructive" : isExpiring ? "outline" : "outline"} className="gap-1">
                              <Mail className="h-3 w-3" />
                              {isExpired ? "Expired" : "Pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleResendInvitation(invitation.id)}
                                disabled={resendingInvitationId === invitation.id}
                                className="h-8"
                                title="Resend invitation email"
                              >
                                {resendingInvitationId === invitation.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                              <AlertDialog open={deleteInvitationId === invitation.id} onOpenChange={(open) => !open && setDeleteInvitationId(null)}>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteInvitationId(invitation.id)}
                                    disabled={isDeletingInvitation}
                                    className="h-8 text-destructive hover:text-destructive"
                                    title="Delete invitation"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Invitation?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete the invitation to <strong>{invitation.email}</strong>? 
                                      This action cannot be undone. They will need to be re-invited to join the account.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isDeletingInvitation}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteInvitation(invitation.id)}
                                      disabled={isDeletingInvitation}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {isDeletingInvitation ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          Deleting...
                                        </>
                                      ) : (
                                        "Delete"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {teamMembers.length === 0 && pendingInvitations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No team members yet</p>
              <p className="text-xs mt-1">Invite colleagues to collaborate on this account</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Member Dialog */}
      <Dialog open={isEditMemberDialogOpen} onOpenChange={setIsEditMemberDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>
              Update team member details. Changes to email will require them to use the new email to sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editMemberName}
                onChange={(e) => setEditMemberName(e.target.value)}
                placeholder="Team member name"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email Address</Label>
              <Input
                id="edit-email"
                type="email"
                value={editMemberEmail}
                onChange={(e) => setEditMemberEmail(e.target.value)}
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Changing email will require them to use the new email to sign in.
              </p>
            </div>
            {editingMember && canEditRoles && editingMember.role !== "OWNER" && (
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={editMemberRole}
                  onValueChange={(value) => setEditMemberRole(value as "MEMBER" | "ADMIN")}
                  disabled={isLoading}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Member - Can create and manage assets</SelectItem>
                    <SelectItem value="ADMIN">Admin - Can manage all assets and settings</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only account owners can change member roles.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditMemberDialogOpen(false);
                setEditingMember(null);
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveMember} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirmation Dialog */}
      <AlertDialog open={deleteMemberId !== null} onOpenChange={(open) => !open && setDeleteMemberId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToDelete ? (
                <>
                  Are you sure you want to remove <strong>{memberToDelete.name || memberToDelete.email}</strong> from {accountName}? 
                  They will lose access to all assets and resources in this account. This action cannot be undone.
                </>
              ) : (
                "Are you sure you want to remove this team member? They will lose access to all assets and resources in this account. This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMember}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMemberId && handleDeleteMember(deleteMemberId)}
              disabled={isDeletingMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingMember ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Member"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
