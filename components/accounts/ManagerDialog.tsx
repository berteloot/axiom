"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface AccountManager {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface ManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingManager: AccountManager | null;
  managerName: string;
  managerEmail: string;
  onManagerNameChange: (name: string) => void;
  onManagerEmailChange: (email: string) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

export function ManagerDialog({
  open,
  onOpenChange,
  editingManager,
  managerName,
  managerEmail,
  onManagerNameChange,
  onManagerEmailChange,
  onSave,
  isSaving,
}: ManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 sm:mx-0 max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>
            {editingManager ? "Edit Account Manager" : "Add Account Manager"}
          </DialogTitle>
          <DialogDescription>
            Add contact information for account managers (informational only)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="manager-name">Name</Label>
            <Input
              id="manager-name"
              value={managerName}
              onChange={(e) => onManagerNameChange(e.target.value)}
              placeholder="John Doe"
              disabled={isSaving}
              className="min-h-[44px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manager-email">Email</Label>
            <Input
              id="manager-email"
              type="email"
              value={managerEmail}
              onChange={(e) => onManagerEmailChange(e.target.value)}
              placeholder="john@example.com"
              disabled={isSaving}
              className="min-h-[44px]"
            />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="w-full sm:w-auto min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving || !managerName.trim() || !managerEmail.trim()}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              editingManager ? "Update" : "Add"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
