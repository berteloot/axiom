"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Trash2, Linkedin } from "lucide-react";
import { Asset, FunnelStage } from "@/lib/types";
import { AssetPreview } from "@/components/review/AssetPreview";
import { ContentMetrics } from "@/components/review/ContentMetrics";
import { AtomicSnippets } from "@/components/review/AtomicSnippets";
import { ReviewForm } from "@/components/review/ReviewForm";
import { LinkedInPostGenerator } from "@/components/LinkedInPostGenerator";
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
import { parseJsonResponse } from "@/lib/utils";

interface ReviewModalProps {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
}

export function ReviewModal({
  asset,
  open,
  onOpenChange,
  onApprove,
}: ReviewModalProps) {
  const [formData, setFormData] = useState({
    title: asset.title,
    assetType: asset.assetType || null,
    funnelStage: asset.funnelStage,
    icpTargets: asset.icpTargets,
    painClusters: asset.painClusters.join(", "),
    outreachTip: asset.outreachTip,
    productLineIds: asset.productLines?.map(pl => pl.id) || [],
    inUse: asset.inUse || false,
    uploadedById: asset.uploadedBy?.id || null,
    uploadedByNameOverride: (asset as any).uploadedByNameOverride || null,
    extractedText: asset.extractedText || "",
  });
  const tryParseDate = (value?: string | null): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  };

  const extractPublishedDateFromSnippets = (): Date | null => {
    const snippets = asset.atomicSnippets;
    const getDateFromSnippet = (snippet: any): Date | null => {
      return tryParseDate(snippet?.publishedDate || snippet?.metadata?.publishedDate);
    };

    if (!snippets) return null;

    if (Array.isArray(snippets)) {
      for (const snippet of snippets) {
        const date = getDateFromSnippet(snippet);
        if (date) return date;
      }
      return null;
    }

    if (typeof snippets === "string") {
      try {
        const parsed = JSON.parse(snippets);
        if (Array.isArray(parsed)) {
          for (const snippet of parsed) {
            const date = getDateFromSnippet(snippet);
            if (date) return date;
          }
        } else {
          return getDateFromSnippet(parsed);
        }
      } catch {
        return null;
      }
    }

    if (typeof snippets === "object") {
      return getDateFromSnippet(snippets);
    }

    return null;
  };

  const extractPublishedDateFromText = (): Date | null => {
    if (!asset.extractedText) return null;
    const text = asset.extractedText.slice(0, 800);
    const patterns = [
      /\b\d{4}-\d{2}-\d{2}\b/,
      /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[0]) {
        const date = tryParseDate(match[0]);
        if (date) return date;
      }
    }
    return null;
  };

  // Extract published date from atomicSnippets if customCreatedAt is not set
  const getInitialCreatedAt = (): Date | null => {
    const explicit = tryParseDate(asset.customCreatedAt);
    if (explicit) return explicit;

    const fromSnippets = extractPublishedDateFromSnippets();
    if (fromSnippets) return fromSnippets;

    return extractPublishedDateFromText();
  };

  const [customCreatedAt, setCustomCreatedAt] = useState<Date | null>(getInitialCreatedAt());
  const [lastReviewedAt, setLastReviewedAt] = useState<Date | null>(
    asset.lastReviewedAt ? new Date(asset.lastReviewedAt) : null
  );
  const [expiryDate, setExpiryDate] = useState<Date | null>(
    asset.expiryDate ? new Date(asset.expiryDate) : null
  );
  const [saving, setSaving] = useState(false);
  const [painClusterError, setPainClusterError] = useState<string>("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isLinkedInModalOpen, setIsLinkedInModalOpen] = useState(false);

  useEffect(() => {
    // Reset form when asset changes or modal opens
    if (open) {
      setFormData({
        title: asset.title,
        assetType: asset.assetType || null,
        funnelStage: asset.funnelStage,
        icpTargets: asset.icpTargets,
        painClusters: asset.painClusters.join(", "),
        outreachTip: asset.outreachTip,
        productLineIds: asset.productLines?.map(pl => pl.id) || [],
        inUse: asset.inUse || false,
        uploadedById: asset.uploadedBy?.id || null,
        uploadedByNameOverride: (asset as any).uploadedByNameOverride || null,
        extractedText: asset.extractedText || "",
      });
      setCustomCreatedAt(getInitialCreatedAt());
      setLastReviewedAt(asset.lastReviewedAt ? new Date(asset.lastReviewedAt) : null);
      setExpiryDate(asset.expiryDate ? new Date(asset.expiryDate) : null);
      setPainClusterError("");
    }
  }, [open, asset]);

  const handleSave = async () => {
    // Validate pain clusters
    const painClusters = formData.painClusters
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    
    if (painClusters.length > 3) {
      setPainClusterError("Please limit to 3 pain clusters");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.title,
          assetType: formData.assetType,
          funnelStage: formData.funnelStage,
          icpTargets: formData.icpTargets,
          painClusters: painClusters,
          outreachTip: formData.outreachTip,
          productLineIds: formData.productLineIds,
          status: "APPROVED",
          customCreatedAt: customCreatedAt?.toISOString() || null,
          lastReviewedAt: lastReviewedAt?.toISOString() || null,
          expiryDate: expiryDate?.toISOString() || null,
          inUse: formData.inUse,
          uploadedById: formData.uploadedById,
          uploadedByNameOverride: formData.uploadedByNameOverride,
          extractedText: formData.extractedText,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save asset");
      }

      onApprove();
    } catch (error) {
      console.error("Error saving asset:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleFormDataChange = (data: Partial<typeof formData>) => {
    setFormData({ ...formData, ...data });
    // Validate pain clusters on change
    if (data.painClusters !== undefined) {
      const clusters = data.painClusters
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (clusters.length > 3) {
        setPainClusterError("Maximum 3 pain clusters allowed");
      } else {
        setPainClusterError("");
      }
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/assets/${asset.id}/download`);
      if (!response.ok) {
        throw new Error("Failed to generate download URL");
      }
      const data = await response.json();
      // Open download URL in new tab to trigger download
      window.open(data.downloadUrl, "_blank");
    } catch (error) {
      console.error("Error downloading asset:", error);
      alert("Failed to download asset. Please try again.");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await parseJsonResponse(response).catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete asset");
      }

      onApprove(); // Refresh the list
      onOpenChange(false); // Close modal
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting asset:", error);
      alert("Failed to delete asset. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const atomicSnippets = asset.atomicSnippets && Array.isArray(asset.atomicSnippets) 
    ? asset.atomicSnippets as any[] 
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Asset</DialogTitle>
          <DialogDescription>
            Review the asset and update AI analysis before approving
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* Left: Asset Preview */}
          <div className="space-y-4">
            <AssetPreview 
              asset={asset} 
              extractedTextValue={formData.extractedText}
              onExtractedTextChange={(text) => handleFormDataChange({ extractedText: text })}
            />
            <ContentMetrics asset={asset} />
            <AtomicSnippets snippets={atomicSnippets} />
          </div>

          {/* Right: Form */}
          <div className="space-y-4">
            <ReviewForm
              key={`${asset.id}-${open}`} // Force remount when modal opens/closes or asset changes
              asset={asset}
              formData={formData}
              customCreatedAt={customCreatedAt}
              lastReviewedAt={lastReviewedAt}
              expiryDate={expiryDate}
              painClusterError={painClusterError}
              onFormDataChange={handleFormDataChange}
              onCustomCreatedAtChange={setCustomCreatedAt}
              onLastReviewedAtChange={setLastReviewedAt}
              onExpiryDateChange={setExpiryDate}
            />

            <div className="flex items-center gap-2 pt-4">
              <Button
                onClick={handleSave}
                disabled={saving || deleting}
                className="flex-1"
              >
                {saving ? "Saving..." : "Approve & Save"}
              </Button>
              {(asset.status === "PROCESSED" || asset.status === "APPROVED") && (
                <Button
                  variant="outline"
                  onClick={() => setIsLinkedInModalOpen(true)}
                  disabled={saving || deleting}
                >
                  <Linkedin className="h-4 w-4" />
                  LinkedIn Post
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleDownload}
                disabled={saving || deleting}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving || deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={saving || deleting}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the asset
              &quot;{asset.title}&quot; and remove it from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Asset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LinkedInPostGenerator
        asset={asset}
        open={isLinkedInModalOpen}
        onOpenChange={setIsLinkedInModalOpen}
      />
    </Dialog>
  );
}
