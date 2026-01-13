"use client";

import { useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FunnelStage } from "@/lib/types";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Info } from "lucide-react";

interface BulkBlogImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BulkBlogImportModal({
  open,
  onOpenChange,
  onSuccess,
}: BulkBlogImportModalProps) {
  const [blogUrl, setBlogUrl] = useState("");
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("TOFU_AWARENESS");
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [results, setResults] = useState<{
    total: number;
    success: number;
    failed: number;
    errors: Array<{ url: string; error: string }>;
    assets: Array<{ id: string; title: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!blogUrl.trim()) {
      setError("Please enter a blog URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(blogUrl.trim());
    } catch {
      setError("Please enter a valid URL (e.g., https://example.com/blog)");
      return;
    }

    setIsImporting(true);
    setError(null);
    setResults(null);
    setProgress(0);
    setCurrentStep("Extracting blog post URLs...");

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 2;
        });
      }, 500);

      const response = await fetch("/api/assets/bulk-import-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blogUrl: blogUrl.trim(),
          funnelStage,
          maxPosts: 50,
        }),
      });

      clearInterval(progressInterval);
      setProgress(95);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to import blog posts");
      }

      setCurrentStep("Import complete!");
      setResults(data.results);
      setProgress(100);
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import blog posts");
      setProgress(0);
      setCurrentStep("");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      setBlogUrl("");
      setFunnelStage("TOFU_AWARENESS");
      setProgress(0);
      setCurrentStep("");
      setResults(null);
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Blog Posts</DialogTitle>
          <DialogDescription>
            Automatically extract and import blog posts from a blog URL into your asset library.
            Each post will be analyzed and categorized.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="blogUrl">Blog URL *</Label>
            <Input
              id="blogUrl"
              type="url"
              placeholder="https://example.com/blog"
              value={blogUrl}
              onChange={(e) => {
                setBlogUrl(e.target.value);
                setError(null);
              }}
              disabled={isImporting}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              Enter the URL of your blog homepage or blog listing page. The system will automatically discover all blog posts.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="funnelStage">Default Funnel Stage</Label>
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
            <p className="text-xs text-muted-foreground">
              All imported posts will be assigned this funnel stage. You can change it later for individual posts.
            </p>
          </div>

          {isImporting && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{currentStep}</span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                This may take a few minutes depending on the number of posts...
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Import Failed</AlertTitle>
              <AlertDescription className="mt-1">{error}</AlertDescription>
            </Alert>
          )}

          {results && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-900 dark:text-green-100">Import Complete</AlertTitle>
              <AlertDescription className="mt-2 space-y-2 text-green-800 dark:text-green-200">
                <div className="space-y-1">
                  <p className="font-medium">
                    Successfully imported <strong className="text-green-900 dark:text-green-100">{results.success}</strong> of{" "}
                    <strong className="text-green-900 dark:text-green-100">{results.total}</strong> blog posts
                  </p>
                  {results.failed > 0 && (
                    <p className="text-sm">
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {results.failed} post{results.failed !== 1 ? "s" : ""} failed
                      </span> to import
                    </p>
                  )}
                </div>
                {results.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium hover:underline">
                      View error details ({results.errors.length})
                    </summary>
                    <ul className="mt-2 space-y-1.5 text-xs max-h-40 overflow-y-auto pl-4 list-disc">
                      {results.errors.slice(0, 10).map((err, idx) => (
                        <li key={idx} className="break-all">
                          <a
                            href={err.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {err.url.substring(0, 60)}...
                          </a>
                          <span className="text-muted-foreground ml-1">: {err.error}</span>
                        </li>
                      ))}
                      {results.errors.length > 10 && (
                        <li className="text-muted-foreground italic">
                          ... and {results.errors.length - 10} more errors
                        </li>
                      )}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            {results ? "Close" : "Cancel"}
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={isImporting || !blogUrl.trim()}
            className="min-w-[140px]"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import Blog Posts"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
