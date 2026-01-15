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
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FunnelStage, ProductLine } from "@/lib/types";
import { MultiSelectCombobox } from "@/components/ui/combobox";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  ExternalLink, 
  Info, 
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { ALL_JOB_TITLES } from "@/lib/icp-targets";
import { ASSET_TYPE_VALUES } from "@/lib/constants/asset-types";

interface BulkBlogImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface PreviewPost {
  url: string;
  title: string;
  isDuplicate: boolean;
  existingAssetId?: string;
  detectedAssetType?: string | null;
  isUnknownType?: boolean;
  publishedDate?: string | null;
  language?: string | null;
}

interface DateStats {
  total: number;
  withDates: number;
  missingDates: number;
  minDate: string | null;
  maxDate: string | null;
}

// Language code to name mapping
const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  fr: "French",
  en: "English",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  ru: "Russian",
  pl: "Polish",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
};

type Step = "configure" | "preview" | "importing";

export function BulkBlogImportModal({
  open,
  onOpenChange,
  onSuccess,
}: BulkBlogImportModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>("configure");
  const [blogUrl, setBlogUrl] = useState("");
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("TOFU_AWARENESS");
  const [selectedIcpTargets, setSelectedIcpTargets] = useState<string[]>([]);
  const [selectedProductLineIds, setSelectedProductLineIds] = useState<string[]>([]);
  const [painClusters, setPainClusters] = useState<string>("");
  const [maxPosts, setMaxPosts] = useState<number>(50);
  const [selectedAssetTypeFilter, setSelectedAssetTypeFilter] = useState<string>("all");
  const [dateRangeStart, setDateRangeStart] = useState<string>("");
  const [dateRangeEnd, setDateRangeEnd] = useState<string>("");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [detectedLanguages, setDetectedLanguages] = useState<string[]>([]);
  
  // Preview state
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewPosts, setPreviewPosts] = useState<PreviewPost[]>([]);
  const [selectedPostUrls, setSelectedPostUrls] = useState<Set<string>>(new Set());
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [dateStats, setDateStats] = useState<DateStats | null>(null);
  
  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentImportStep, setCurrentImportStep] = useState<string>("");
  const [results, setResults] = useState<{
    total: number;
    success: number;
    failed: number;
    skipped?: number;
    withErrors?: number;
    errors: Array<{ url: string; error: string }>;
    warnings?: Array<{ url: string; warning: string }>;
    skippedItems?: Array<{ url: string; reason: string }>;
    assets: Array<{ id: string; title: string }>;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  
  // Options
  const [icpOptions, setIcpOptions] = useState<string[]>(ALL_JOB_TITLES);
  const [isLoadingIcp, setIsLoadingIcp] = useState(true);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [isLoadingProductLines, setIsLoadingProductLines] = useState(true);

  const parseJsonResponse = async (response: Response) => {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    const isHtml = text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");
    const fallbackMessage = isHtml
      ? "Session expired or server returned HTML instead of JSON. Please refresh and try again."
      : "Server returned an unexpected response format.";
    throw new Error(fallbackMessage);
  };

  // Fetch ICP targets and product lines
  useEffect(() => {
    if (open) {
      // Fetch ICP targets
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

      // Fetch product lines
      setIsLoadingProductLines(true);
      fetch("/api/product-lines")
        .then((res) => res.json())
        .then((data) => {
          setProductLines(data.productLines || []);
        })
        .catch((err) => {
          console.error("Error fetching product lines:", err);
        })
        .finally(() => {
          setIsLoadingProductLines(false);
        });
    }
  }, [open]);

  const handlePreview = async () => {
    if (!blogUrl.trim()) {
      setPreviewError("Please enter a blog URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(blogUrl.trim());
    } catch {
      setPreviewError("Please enter a valid URL (e.g., https://example.com/blog)");
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError(null);
    setPreviewPosts([]);
    setSelectedPostUrls(new Set());
    setDateStats(null);

    try {
      const response = await fetch("/api/assets/bulk-import-blog/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          blogUrl: blogUrl.trim(),
          maxPosts: maxPosts,
          dateRangeStart: dateRangeStart || null,
          dateRangeEnd: dateRangeEnd || null,
          languageFilter: languageFilter !== "all" ? languageFilter : null,
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Failed to preview blog posts");
      }

      const posts = Array.isArray(data.posts) ? data.posts : [];
      setPreviewPosts(posts);
      if (data.dateStats) {
        setDateStats(data.dateStats);
      }
      // Store detected languages for filter UI
      if (Array.isArray(data.detectedLanguages)) {
        setDetectedLanguages(data.detectedLanguages);
      }
      // Auto-select all non-duplicate posts, up to maxPosts
      const nonDuplicates = posts
        .filter((p: PreviewPost) => !p.isDuplicate)
        .slice(0, maxPosts);
      setSelectedPostUrls(new Set(nonDuplicates.map((p: PreviewPost) => p.url)));
      setCurrentStep("preview");
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to preview blog posts");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const nonDuplicates = Array.isArray(previewPosts)
        ? previewPosts
            .filter(p => !p.isDuplicate)
            .slice(0, maxPosts)
            .map(p => p.url)
        : [];
      setSelectedPostUrls(new Set(nonDuplicates));
    } else {
      setSelectedPostUrls(new Set());
    }
  };

  const handleTogglePost = (url: string) => {
    const newSelected = new Set(selectedPostUrls);
    if (newSelected.has(url)) {
      newSelected.delete(url);
    } else {
      // Check if we're at maxPosts limit
      if (newSelected.size >= maxPosts) {
        return; // Don't allow selecting more than maxPosts
      }
      newSelected.add(url);
    }
    setSelectedPostUrls(newSelected);
  };

  const handleImport = async () => {
    if (selectedPostUrls.size === 0) {
      setImportError("Please select at least one post to import");
      return;
    }

    if (!Array.isArray(previewPosts) || previewPosts.length === 0) {
      setImportError("No posts available to import");
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setResults(null);
    setProgress(0);
    setCurrentImportStep("Preparing import...");
    setCurrentStep("importing");

    try {
      const selectedPosts = previewPosts.filter(p => selectedPostUrls.has(p.url));
      const chunkSize = 5;
      const chunks: PreviewPost[][] = [];
      for (let i = 0; i < selectedPosts.length; i += chunkSize) {
        chunks.push(selectedPosts.slice(i, i + chunkSize));
      }
      
      // Parse pain clusters from comma-separated string
      const painClustersArray = painClusters
        .split(",")
        .map(c => c.trim())
        .filter(c => c.length > 0);

      const aggregateResults = {
        total: selectedPosts.length,
        success: 0,
        failed: 0,
        skipped: 0,
        withErrors: 0,
        errors: [] as Array<{ url: string; error: string }>,
        warnings: [] as Array<{ url: string; warning: string }>,
        skippedItems: [] as Array<{ url: string; reason: string }>,
        assets: [] as Array<{ id: string; title: string }>,
      };

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const startIndex = i * chunkSize + 1;
        const endIndex = Math.min(startIndex + chunk.length - 1, selectedPosts.length);
        setCurrentImportStep(`Importing posts ${startIndex}-${endIndex} of ${selectedPosts.length}...`);

        try {
          const response = await fetch("/api/assets/bulk-import-blog", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              posts: chunk.map(p => ({ 
                url: p.url, 
                title: p.title,
                detectedAssetType: p.detectedAssetType || null,
                publishedDate: p.publishedDate || null,
              })),
              funnelStage,
              icpTargets: selectedIcpTargets,
              painClusters: painClustersArray,
              productLineIds: selectedProductLineIds,
            }),
          });

          const data = await parseJsonResponse(response);

          if (!response.ok) {
            const errorMessage = data.error || "Failed to import blog posts";
            chunk.forEach((post) => {
              aggregateResults.failed += 1;
              aggregateResults.errors.push({ url: post.url, error: errorMessage });
            });
          } else if (data?.results) {
            const resultsChunk = data.results;
            aggregateResults.success += resultsChunk.success || 0;
            aggregateResults.failed += resultsChunk.failed || 0;
            aggregateResults.skipped += resultsChunk.skipped || 0;
            aggregateResults.withErrors += resultsChunk.withErrors || 0;
            if (Array.isArray(resultsChunk.errors)) {
              aggregateResults.errors.push(...resultsChunk.errors);
            }
            if (Array.isArray(resultsChunk.warnings)) {
              aggregateResults.warnings.push(...resultsChunk.warnings);
            }
            if (Array.isArray(resultsChunk.skippedItems)) {
              aggregateResults.skippedItems.push(...resultsChunk.skippedItems);
            }
            if (Array.isArray(resultsChunk.assets)) {
              aggregateResults.assets.push(...resultsChunk.assets);
            }
          }
        } catch (chunkError) {
          const errorMessage = chunkError instanceof Error ? chunkError.message : "Failed to import blog posts";
          chunk.forEach((post) => {
            aggregateResults.failed += 1;
            aggregateResults.errors.push({ url: post.url, error: errorMessage });
          });
        }

        const progressPercent = Math.round(((i + 1) / chunks.length) * 100);
        setProgress(progressPercent);
      }

      setCurrentImportStep("Import complete!");
      setResults(aggregateResults);
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 3000);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import blog posts");
      setProgress(0);
      setCurrentImportStep("");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isImporting && !isLoadingPreview) {
      setCurrentStep("configure");
      setBlogUrl("");
      setFunnelStage("TOFU_AWARENESS");
      setSelectedIcpTargets([]);
      setSelectedProductLineIds([]);
      setPainClusters("");
      setMaxPosts(50);
      setSelectedAssetTypeFilter("all");
      setDateRangeStart("");
      setDateRangeEnd("");
      setLanguageFilter("all");
      setDetectedLanguages([]);
      setPreviewPosts([]);
      setSelectedPostUrls(new Set());
      setProgress(0);
      setCurrentImportStep("");
      setResults(null);
      setPreviewError(null);
      setImportError(null);
      onOpenChange(false);
    }
  };

  const selectedCount = selectedPostUrls.size;
  const duplicateCount = Array.isArray(previewPosts) ? previewPosts.filter(p => p.isDuplicate).length : 0;
  const newCount = Array.isArray(previewPosts) ? previewPosts.filter(p => !p.isDuplicate).length : 0;
  const allSelected = selectedCount > 0 && Array.isArray(previewPosts) &&
    previewPosts.filter(p => !p.isDuplicate && selectedPostUrls.has(p.url)).length === 
    Math.min(newCount, maxPosts);

  // Get unique asset types from preview posts
  const assetTypes = Array.isArray(previewPosts)
    ? Array.from(new Set(previewPosts.map(p => p.detectedAssetType || "Unknown").filter(Boolean)))
    : [];
  
  // Filter posts by selected asset type
  const filteredPosts = Array.isArray(previewPosts)
    ? previewPosts.filter(post => {
        if (selectedAssetTypeFilter === "all") return true;
        if (selectedAssetTypeFilter === "unknown") return post.isUnknownType;
        return post.detectedAssetType === selectedAssetTypeFilter;
      })
    : [];

  // Handle selecting all posts of a specific type
  const handleSelectByType = (type: string) => {
    const postsToSelect = Array.isArray(previewPosts)
      ? previewPosts.filter(p => {
          if (type === "unknown") return p.isUnknownType && !p.isDuplicate;
          return p.detectedAssetType === type && !p.isDuplicate;
        })
        .slice(0, maxPosts - selectedPostUrls.size)
        .map(p => p.url)
      : [];
    
    setSelectedPostUrls(new Set([...selectedPostUrls, ...postsToSelect]));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Blog Posts</DialogTitle>
          <DialogDescription>
            {currentStep === "configure" && "Enter a blog URL to discover and preview posts before importing."}
            {currentStep === "preview" && "Select the posts you want to import. Duplicates are marked."}
            {currentStep === "importing" && "Importing selected posts..."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Configuration */}
        {currentStep === "configure" && (
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
                  setPreviewError(null);
                }}
                disabled={isLoadingPreview}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                Enter the URL of your blog homepage or blog listing page. The system will automatically discover all blog posts.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxPosts">Maximum Posts to Import</Label>
              <Select
                value={maxPosts.toString()}
                onValueChange={(value) => setMaxPosts(Number(value))}
                disabled={isLoadingPreview}
              >
                <SelectTrigger id="maxPosts">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateRangeStart">Published Date Range (Optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="dateRangeStart" className="text-xs text-muted-foreground">Start Date</Label>
                  <Input
                    id="dateRangeStart"
                    type="date"
                    value={dateRangeStart}
                    onChange={(e) => setDateRangeStart(e.target.value)}
                    disabled={isLoadingPreview}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dateRangeEnd" className="text-xs text-muted-foreground">End Date</Label>
                  <Input
                    id="dateRangeEnd"
                    type="date"
                    value={dateRangeEnd}
                    onChange={(e) => setDateRangeEnd(e.target.value)}
                    disabled={isLoadingPreview}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                Filter posts by published date. Dates are extracted from URLs. Posts without dates in URLs will be included.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="funnelStage">Default Funnel Stage</Label>
              <Select
                value={funnelStage}
                onValueChange={(value) => setFunnelStage(value as FunnelStage)}
                disabled={isLoadingPreview}
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

            <div className="space-y-2">
              <Label htmlFor="icpTargets">ICP Targets (Optional)</Label>
              <MultiSelectCombobox
                options={Array.isArray(icpOptions) ? icpOptions : []}
                value={Array.isArray(selectedIcpTargets) ? selectedIcpTargets : []}
                onChange={setSelectedIcpTargets}
                placeholder={isLoadingIcp ? "Loading ICP targets..." : "Select ICP targets..."}
                searchPlaceholder="Search ICP targets..."
                emptyText="No ICP targets found"
                disabled={isLoadingIcp || isLoadingPreview}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="productLines">Product Lines (Optional)</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                {isLoadingProductLines ? (
                  <div className="text-sm text-muted-foreground">Loading product lines...</div>
                ) : productLines.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No product lines available</div>
                ) : (
                  productLines.map((pl) => (
                    <div key={pl.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`product-line-${pl.id}`}
                        checked={selectedProductLineIds.includes(pl.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedProductLineIds([...selectedProductLineIds, pl.id]);
                          } else {
                            setSelectedProductLineIds(selectedProductLineIds.filter(id => id !== pl.id));
                          }
                        }}
                        disabled={isLoadingPreview}
                      />
                      <Label
                        htmlFor={`product-line-${pl.id}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {pl.name}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="painClusters">Pain Clusters (Optional, comma-separated)</Label>
              <Textarea
                id="painClusters"
                placeholder="e.g., Data Quality, Compliance, Traceability"
                value={painClusters}
                onChange={(e) => setPainClusters(e.target.value)}
                disabled={isLoadingPreview}
                rows={2}
              />
            </div>

            {previewError && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Preview Failed</AlertTitle>
                <AlertDescription className="mt-1">{previewError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {currentStep === "preview" && (
          <div className="space-y-4 py-4">
            {/* Filters Section - Date Range and Language */}
            <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Filters</Label>
                {(dateRangeStart || dateRangeEnd || languageFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDateRangeStart("");
                      setDateRangeEnd("");
                      setLanguageFilter("all");
                    }}
                    className="text-xs h-7"
                  >
                    Clear All
                  </Button>
                )}
              </div>
              
              {/* Language Filter */}
              {detectedLanguages.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="languageFilter" className="text-xs font-medium">Language</Label>
                  <Select
                    value={languageFilter}
                    onValueChange={setLanguageFilter}
                    disabled={isLoadingPreview}
                  >
                    <SelectTrigger id="languageFilter" className="text-sm">
                      <SelectValue placeholder="All Languages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Languages</SelectItem>
                      {detectedLanguages.map(lang => (
                        <SelectItem key={lang} value={lang}>
                          {LANGUAGE_NAMES[lang] || lang.toUpperCase()} ({lang})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Date Range Filter */}
              <div className="space-y-1">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Published Date Range
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    id="previewDateRangeStart"
                    type="date"
                    value={dateRangeStart}
                    onChange={(e) => setDateRangeStart(e.target.value)}
                    disabled={isLoadingPreview}
                    className="text-sm"
                    placeholder="Start Date"
                  />
                  <Input
                    id="previewDateRangeEnd"
                    type="date"
                    value={dateRangeEnd}
                    onChange={(e) => setDateRangeEnd(e.target.value)}
                    disabled={isLoadingPreview}
                    className="text-sm"
                    placeholder="End Date"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">
                  Dates and content types are extracted from page HTML.
                </p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handlePreview}
                  disabled={isLoadingPreview}
                  className="text-xs"
                >
                  {isLoadingPreview ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    "Apply Filters"
                  )}
                </Button>
              </div>
            </div>

            {(dateRangeStart || dateRangeEnd) && previewPosts.length === 0 && dateStats && dateStats.withDates > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No posts in that range</AlertTitle>
                <AlertDescription className="mt-1">
                  Available published dates: {dateStats.minDate} to {dateStats.maxDate}.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  Found {Array.isArray(previewPosts) ? previewPosts.length : 0} posts ({newCount} new, {duplicateCount} duplicates)
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedCount} selected for import
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  id="select-all"
                />
                <Label htmlFor="select-all" className="text-sm cursor-pointer">
                  Select all new ({Math.min(newCount, maxPosts)})
                </Label>
              </div>
            </div>

            {/* Asset Type Filter and Bulk Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="assetTypeFilter" className="text-sm font-medium">
                  Filter by Type:
                </Label>
                <Select
                  value={selectedAssetTypeFilter}
                  onValueChange={setSelectedAssetTypeFilter}
                >
                  <SelectTrigger id="assetTypeFilter" className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    {assetTypes
                      .filter(type => type !== "Unknown")
                      .sort()
                      .map(type => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedAssetTypeFilter !== "all" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectByType(selectedAssetTypeFilter)}
                    disabled={selectedPostUrls.size >= maxPosts}
                  >
                    Select All {selectedAssetTypeFilter === "unknown" ? "Unknown" : selectedAssetTypeFilter}
                  </Button>
                )}
              </div>
              {assetTypes.includes("Unknown") && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm">Unknown Asset Types Detected</AlertTitle>
                  <AlertDescription className="text-xs">
                    {Array.isArray(previewPosts) ? previewPosts.filter(p => p.isUnknownType).length : 0} asset(s) could not be automatically categorized. Please review and manually assign types.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto border rounded-lg">
              {filteredPosts.length > 0 ? (
                <div className="divide-y">
                  {filteredPosts.map((post) => {
                    const isSelected = selectedPostUrls.has(post.url);
                    const canSelect = !post.isDuplicate && selectedCount < maxPosts;
                    
                    return (
                      <div
                        key={post.url}
                        className={`p-3 flex items-start gap-3 ${
                          post.isDuplicate ? "bg-muted/30 opacity-60" : ""
                        } ${post.isUnknownType ? "border-l-2 border-l-orange-500" : ""}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleTogglePost(post.url)}
                          disabled={post.isDuplicate || (!isSelected && !canSelect)}
                          id={`post-${post.url}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="space-y-1.5">
                            <div className="flex items-start gap-2 flex-wrap">
                              <Label
                                htmlFor={`post-${post.url}`}
                                className="flex-1 text-sm font-medium cursor-pointer"
                              >
                                {post.title}
                              </Label>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Language Badge */}
                              {post.language && (
                                <span className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded font-medium">
                                  {LANGUAGE_NAMES[post.language] || post.language.toUpperCase()}
                                </span>
                              )}
                              {/* Publication Date */}
                              {post.publishedDate ? (
                                <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-medium inline-flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(post.publishedDate).toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'short', 
                                    day: 'numeric' 
                                  })}
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-900/30 text-gray-500 dark:text-gray-500 rounded italic inline-flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Date unknown
                                </span>
                              )}
                              {/* Content Type */}
                              {post.detectedAssetType ? (
                                <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded font-medium">
                                  {post.detectedAssetType}
                                </span>
                              ) : post.isUnknownType ? (
                                <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded font-medium">
                                  Unknown Type
                                </span>
                              ) : null}
                              {/* Duplicate Badge */}
                              {post.isDuplicate && (
                                <span className="text-xs px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                                  Duplicate
                                </span>
                              )}
                            </div>
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {post.url.substring(0, 60)}...
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  {selectedAssetTypeFilter !== "all" 
                    ? `No posts found for type "${selectedAssetTypeFilter}"`
                    : "No posts to display"}
                </div>
              )}
            </div>

            {selectedCount === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No posts selected</AlertTitle>
                <AlertDescription>
                  Please select at least one post to import.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Step 3: Importing */}
        {currentStep === "importing" && (
          <div className="space-y-4 py-4">
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{currentImportStep}</span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                This may take a few minutes depending on the number of posts...
              </p>
            </div>

            {importError && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Import Failed</AlertTitle>
                <AlertDescription className="mt-1">{importError}</AlertDescription>
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
                    {results.skipped && results.skipped > 0 && (
                      <p className="text-sm">
                        <span className="font-medium text-blue-700 dark:text-blue-400">
                          {results.skipped} post{results.skipped !== 1 ? "s" : ""} skipped
                        </span>{" "}
                        (already imported)
                      </p>
                    )}
                    {results.withErrors && results.withErrors > 0 && (
                      <p className="text-sm">
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {results.withErrors} post{results.withErrors !== 1 ? "s" : ""} imported with extraction issues
                        </span>
                      </p>
                    )}
                    {results.failed > 0 && (
                      <p className="text-sm">
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {results.failed} post{results.failed !== 1 ? "s" : ""} failed
                        </span> to import
                      </p>
                    )}
                  </div>
                  {Array.isArray(results.skippedItems) && results.skippedItems.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium hover:underline">
                        View skipped duplicates ({results.skippedItems.length})
                      </summary>
                      <ul className="mt-2 space-y-1.5 text-xs max-h-40 overflow-y-auto pl-4 list-disc">
                        {results.skippedItems.slice(0, 10).map((item, idx) => (
                          <li key={idx} className="break-all">
                            <a
                              href={item?.url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {item?.url || 'Unknown URL'}
                            </a>{" "}
                            - {item?.reason || "Duplicate"}
                          </li>
                        ))}
                        {results.skippedItems.length > 10 && (
                          <li className="text-muted-foreground italic">
                            ... and {results.skippedItems.length - 10} more duplicates
                          </li>
                        )}
                      </ul>
                    </details>
                  )}
                  {Array.isArray(results.warnings) && results.warnings.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium hover:underline">
                        View extraction warnings ({results.warnings.length})
                      </summary>
                      <ul className="mt-2 space-y-1.5 text-xs max-h-40 overflow-y-auto pl-4 list-disc">
                        {results.warnings.slice(0, 10).map((warning, idx) => (
                          <li key={idx} className="break-all">
                            <a
                              href={warning?.url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {warning?.url ? warning.url.substring(0, 60) : 'Unknown URL'}...
                            </a>
                            <span className="text-muted-foreground ml-1">: {warning?.warning || 'Content extraction issue'}</span>
                          </li>
                        ))}
                        {results.warnings.length > 10 && (
                          <li className="text-muted-foreground italic">
                            ... and {results.warnings.length - 10} more warnings
                          </li>
                        )}
                      </ul>
                    </details>
                  )}
                  {Array.isArray(results.errors) && results.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium hover:underline">
                        View error details ({results.errors.length})
                      </summary>
                      <ul className="mt-2 space-y-1.5 text-xs max-h-40 overflow-y-auto pl-4 list-disc">
                        {results.errors.slice(0, 10).map((err, idx) => (
                          <li key={idx} className="break-all">
                            <a
                              href={err?.url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {err?.url ? err.url.substring(0, 60) : 'Unknown URL'}...
                            </a>
                            <span className="text-muted-foreground ml-1">: {err?.error || 'Unknown error'}</span>
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
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {currentStep === "configure" && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isLoadingPreview}>
                Cancel
              </Button>
              <Button 
                onClick={handlePreview} 
                disabled={isLoadingPreview || !blogUrl.trim()}
                className="min-w-[140px]"
              >
                {isLoadingPreview ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Preview Posts
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          )}
          
          {currentStep === "preview" && (
            <>
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep("configure")}
                disabled={isImporting}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={isImporting || selectedCount === 0}
                className="min-w-[140px]"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${selectedCount} Post${selectedCount !== 1 ? "s" : ""}`
                )}
              </Button>
            </>
          )}

          {currentStep === "importing" && (
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isImporting}
            >
              {results ? "Close" : "Cancel"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
