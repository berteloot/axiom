"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FunnelStage } from "@/lib/types";
import { MultiSelectCombobox } from "@/components/ui/combobox";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { ALL_JOB_TITLES } from "@/lib/job-titles";
import { parseJsonResponse } from "@/lib/utils";

interface SingleUrlImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SingleUrlImportModal({
  open,
  onOpenChange,
  onSuccess,
}: SingleUrlImportModalProps) {
  const [url, setUrl] = useState("");
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("TOFU_AWARENESS");
  const [selectedIcpTargets, setSelectedIcpTargets] = useState<string[]>([]);
  const [painClusters, setPainClusters] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ assetId: string; title: string; status: string } | null>(null);
  
  // ICP options from unified API
  const [icpOptions, setIcpOptions] = useState<string[]>(ALL_JOB_TITLES);
  const [isLoadingIcp, setIsLoadingIcp] = useState(true);

  // Fetch ICP targets from unified API
  useEffect(() => {
    if (open) {
      setIsLoadingIcp(true);
      fetch("/api/icp-targets")
        .then((res) => res.json())
        .then((data) => {
          setIcpOptions(data.icpTargets || ALL_JOB_TITLES);
        })
        .catch((err) => {
          console.error("Error fetching ICP targets:", err);
        })
        .finally(() => {
          setIsLoadingIcp(false);
        });
    }
  }, [open]);

  const handleImport = async () => {
    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(null);

    try {
      // Parse pain clusters from comma-separated string
      const painClustersArray = painClusters
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const response = await fetch("/api/assets/import-single", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          funnelStage,
          icpTargets: selectedIcpTargets,
          painClusters: painClustersArray,
        }),
      });

      if (!response.ok) {
        const errorData = await parseJsonResponse(response).catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Failed to import asset");
      }

      const data = await parseJsonResponse(response);
      
      if (data.success) {
        setSuccess({
          assetId: data.asset.id,
          title: data.asset.title,
          status: data.asset.status,
        });
        
        // Reset form after a short delay
        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          }
          handleClose();
        }, 2000);
      } else {
        throw new Error(data.error || "Import failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import asset");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      setUrl("");
      setError(null);
      setSuccess(null);
      setPainClusters("");
      setSelectedIcpTargets([]);
      setFunnelStage("TOFU_AWARENESS");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Single Asset from URL</DialogTitle>
          <DialogDescription>
            Import a single blog post or article by providing its URL. The system will extract the content and create an asset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="url">URL *</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/blog/post-title"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isImporting}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isImporting && url.trim()) {
                  handleImport();
                }
              }}
            />
            {url && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ExternalLink className="h-3 w-3" />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline truncate"
                >
                  {url}
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="funnelStage">Funnel Stage</Label>
              <Select
                value={funnelStage}
                onValueChange={(value) => setFunnelStage(value as FunnelStage)}
                disabled={isImporting}
              >
                <SelectTrigger id="funnelStage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOFU_AWARENESS">TOFU - Awareness</SelectItem>
                  <SelectItem value="MOFU_CONSIDERATION">MOFU - Consideration</SelectItem>
                  <SelectItem value="BOFU_DECISION">BOFU - Decision</SelectItem>
                  <SelectItem value="RETENTION">Retention</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="icpTargets">ICP Targets</Label>
            <MultiSelectCombobox
              options={icpOptions}
              selectedValues={selectedIcpTargets}
              onSelectionChange={setSelectedIcpTargets}
              placeholder={isLoadingIcp ? "Loading job titles..." : "Select ICP targets..."}
              disabled={isImporting || isLoadingIcp}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="painClusters">Pain Clusters (comma-separated)</Label>
            <Textarea
              id="painClusters"
              placeholder="e.g., Cost reduction, Time savings, Efficiency"
              value={painClusters}
              onChange={(e) => setPainClusters(e.target.value)}
              disabled={isImporting}
              rows={2}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <div className="font-semibold">Asset imported successfully!</div>
                <div className="text-sm mt-1">
                  Title: {success.title}
                  {success.status === "ERROR" && (
                    <span className="ml-2 text-orange-600">
                      (Content extraction had issues - check asset for details)
                    </span>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !url.trim()}
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import Asset"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
