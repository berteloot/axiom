"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Asset, AssetStatus } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { LinkedInPostGenerator } from "@/components/LinkedInPostGenerator";
import { Linkedin, FileText, Image, FileSpreadsheet, File, Video, Music, X, BookOpen, Eye, RotateCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import React, { useState, useMemo, useEffect } from "react";
import { VideoCompressionGuide } from "@/components/VideoCompressionGuide";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Helper to get file type icon
// All icons use consistent size (w-5 h-5 = 20px) for better visibility
const getFileTypeIcon = (fileType: string) => {
  if (fileType.startsWith("image/")) {
    return <Image className="w-5 h-5 text-purple-500 flex-shrink-0" />;
  }
  if (fileType.startsWith("video/")) {
    return <Video className="w-5 h-5 text-red-500 flex-shrink-0" />;
  }
  if (fileType.startsWith("audio/")) {
    return <Music className="w-5 h-5 text-orange-500 flex-shrink-0" />;
  }
  if (fileType === "application/pdf" || fileType.includes("word") || fileType === "text/plain") {
    return <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />;
  }
  if (fileType.includes("excel") || fileType.includes("spreadsheet") || fileType === "text/csv") {
    return <FileSpreadsheet className="w-5 h-5 text-green-500 flex-shrink-0" />;
  }
  return <File className="w-5 h-5 text-gray-500 flex-shrink-0" />;
};

interface AssetTableProps {
  assets: Asset[];
  onReview: (asset: Asset) => void;
  selectedAssetIds?: string[];
  onSelectionChange?: React.Dispatch<React.SetStateAction<string[]>>;
  onInUseChange?: (assetId: string, inUse: boolean) => void;
}

const getStatusColor = (status: AssetStatus) => {
  switch (status) {
    case "APPROVED":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
    case "PROCESSED":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
    case "PROCESSING":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
    case "ERROR":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
    case "PENDING":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20";
  }
};

const getStageColor = (stage: string) => {
  switch (stage) {
    case "TOFU_AWARENESS":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
    case "MOFU_CONSIDERATION":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
    case "BOFU_DECISION":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
    case "RETENTION":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20";
  }
};

const formatStage = (stage: string) => {
  return stage
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

// Short format for stage names to fit in compact table
const formatStageShort = (stage: string) => {
  switch (stage) {
    case "TOFU_AWARENESS":
      return "TOFU";
    case "MOFU_CONSIDERATION":
      return "MOFU";
    case "BOFU_DECISION":
      return "BOFU";
    case "RETENTION":
      return "RETAIN";
    default:
      return stage;
  }
};

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "Invalid date";
  }
};

const getPrimaryDate = (asset: Asset): string | null => {
  return asset.customCreatedAt || asset.lastReviewedAt || asset.createdAt || null;
};

export function AssetTable({ 
  assets, 
  onReview, 
  selectedAssetIds = [],
  onSelectionChange,
  onInUseChange 
}: AssetTableProps) {
  const [selectedAssetForPost, setSelectedAssetForPost] = useState<Asset | null>(null);
  const [isLinkedInModalOpen, setIsLinkedInModalOpen] = useState(false);
  const [showProcessingGuide, setShowProcessingGuide] = useState(false);
  const [processingAssetSize, setProcessingAssetSize] = useState<number>(465);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [titleSortOrder, setTitleSortOrder] = useState<'asc' | 'desc' | null>(null);

  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No assets found. Upload some assets to get started.
      </div>
    );
  }

  const handleRetry = async (assetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/assets/${assetId}/retry`, {
        method: "POST",
      });
      if (response.ok) {
        // Reload the page to refresh asset status
        window.location.reload();
      } else {
        alert("Failed to retry processing. Please try again.");
      }
    } catch (error) {
      console.error("Error retrying asset:", error);
      alert("Failed to retry processing. Please try again.");
    }
  };

  const handleCancel = async (assetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to cancel processing? The asset will be marked as ERROR and you can retry later.")) {
      return;
    }

    try {
      const response = await fetch(`/api/assets/${assetId}/cancel`, {
        method: "POST",
      });
      if (response.ok) {
        // Reload the page to refresh asset status
        window.location.reload();
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Failed to cancel processing. Please try again.");
      }
    } catch (error) {
      console.error("Error canceling asset:", error);
      alert("Failed to cancel processing. Please try again.");
    }
  };

  const handleSelectAsset = (assetId: string, checked: boolean) => {
    if (!onSelectionChange) return;
    
    onSelectionChange((prev) => {
      if (checked) return Array.from(new Set([...prev, assetId]));
      return prev.filter((id) => id !== assetId);
    });
  };

  // Sorting logic
  const sortedAssets = useMemo(() => {
    if (!titleSortOrder) {
      return assets;
    }
    
    const sorted = [...assets].sort((a, b) => {
      const titleA = a.title.toLowerCase();
      const titleB = b.title.toLowerCase();
      
      if (titleSortOrder === 'asc') {
        return titleA.localeCompare(titleB);
      } else {
        return titleB.localeCompare(titleA);
      }
    });
    
    return sorted;
  }, [assets, titleSortOrder]);

  // Pagination logic
  const totalPages = Math.ceil(sortedAssets.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAssets = useMemo(() => {
    return sortedAssets.slice(startIndex, endIndex);
  }, [sortedAssets, startIndex, endIndex]);

  // Handle title sort toggle
  const handleTitleSort = () => {
    if (titleSortOrder === null) {
      setTitleSortOrder('asc');
    } else if (titleSortOrder === 'asc') {
      setTitleSortOrder('desc');
    } else {
      setTitleSortOrder(null);
    }
    // Reset to page 1 when sorting changes
    setCurrentPage(1);
  };

  // Reset to page 1 when items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  // Reset to page 1 when sort order changes
  useEffect(() => {
    setCurrentPage(1);
  }, [titleSortOrder]);

  // Selectable assets on current page only - use useMemo to ensure it's stable
  const selectableAssetIdsOnPage = useMemo(() => {
    return paginatedAssets
      .filter((asset) => asset.status === "APPROVED" || asset.status === "PROCESSED" || asset.status === "ERROR")
      .map((asset) => asset.id);
  }, [paginatedAssets]);

  const allSelectableSelected =
    selectableAssetIdsOnPage.length > 0 &&
    selectableAssetIdsOnPage.every((id) => selectedAssetIds.includes(id));

  const someSelectableSelected =
    selectableAssetIdsOnPage.some((id) => selectedAssetIds.includes(id)) && !allSelectableSelected;

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    
    if (checked) {
      // CRITICAL: Only select assets from the CURRENT PAGE (paginatedAssets)
      // Do NOT use the full assets array - only use paginatedAssets which contains only current page items
      const selectableAssetsOnCurrentPage = paginatedAssets.filter(
        asset => asset.status === "APPROVED" || asset.status === "PROCESSED" || asset.status === "ERROR"
      );
      
      const currentPageAssetIds = selectableAssetsOnCurrentPage.map(asset => asset.id);
      
      // Add current page's selectable assets, keeping any previously selected assets from other pages
      onSelectionChange((prev) => {
        // Remove any assets from the current page first (in case some were already selected)
        const otherPageAssets = prev.filter(id => !currentPageAssetIds.includes(id));
        // Add all selectable assets from current page ONLY
        return Array.from(new Set([...otherPageAssets, ...currentPageAssetIds]));
      });
    } else {
      // Only deselect assets from the current page, keep selections from other pages
      onSelectionChange((prev) => {
        return prev.filter(id => !selectableAssetIdsOnPage.includes(id));
      });
    }
  };

  // Reset to page 1 when assets change (e.g., after filtering)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [sortedAssets.length, currentPage, totalPages]);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage <= 3) {
        // Near the start
        for (let i = 2; i <= 4; i++) {
          pages.push(i);
        }
        pages.push("ellipsis");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near the end
        pages.push("ellipsis");
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // In the middle
        pages.push("ellipsis");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("ellipsis");
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <React.Fragment>
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              {onSelectionChange && (
                <TableHead className="w-12 px-2">
                  <Checkbox
                    checked={allSelectableSelected}
                    onCheckedChange={(checked) => handleSelectAll(checked === true)}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              <TableHead className="min-w-[180px] px-2">
                <button
                  onClick={handleTitleSort}
                  className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer font-medium"
                  type="button"
                  aria-label={`Sort by title ${titleSortOrder === 'asc' ? 'descending' : titleSortOrder === 'desc' ? 'reset' : 'ascending'}`}
                >
                  <span>Title</span>
                  {titleSortOrder === 'asc' ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : titleSortOrder === 'desc' ? (
                    <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-16 px-2 text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">In Use</span>
                    </TooltipTrigger>
                    <TooltipContent>Mark if asset is currently in use</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="w-20 px-2">Type</TableHead>
              <TableHead className="w-24 px-2">Product</TableHead>
              <TableHead className="w-24 px-2">ICP</TableHead>
              <TableHead className="w-20 px-2">Stage</TableHead>
              <TableHead className="w-24 px-2">Status</TableHead>
              <TableHead className="w-24 px-2">Uploaded By</TableHead>
              <TableHead className="w-20 px-2">Upload Date</TableHead>
              <TableHead className="text-right w-32 px-2">Actions</TableHead>
            </TableRow>
          </TableHeader>
            <TableBody>
              {paginatedAssets.map((asset) => {
                const isSelectable = asset.status === "APPROVED" || asset.status === "PROCESSED" || asset.status === "ERROR";
                const isSelected = selectedAssetIds.includes(asset.id);
                
                return (
                  <TableRow key={asset.id}>
                    {onSelectionChange && (
                      <TableCell className="w-12 px-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectAsset(asset.id, checked as boolean)}
                          disabled={!isSelectable}
                          aria-label={`Select ${asset.title}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium min-w-[180px] px-2">
                      <div className="flex items-start gap-1">
                        <div className="flex-shrink-0 pt-0.5">
                          {getFileTypeIcon(asset.fileType)}
                        </div>
                        {asset.dominantColor && (
                          <div
                            className="w-2.5 h-2.5 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0 mt-1"
                            style={{ backgroundColor: asset.dominantColor }}
                            title={`Color: ${asset.dominantColor}`}
                            aria-label={`Color: ${asset.dominantColor}`}
                          />
                        )}
                        <span className="text-sm line-clamp-2 leading-tight" title={asset.title}>
                          {asset.title}
                        </span>
                      </div>
                    </TableCell>
                  <TableCell className="w-16 px-2">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={!!asset.inUse}
                        onCheckedChange={(checked) => {
                          if (onInUseChange) {
                            onInUseChange(asset.id, checked === true);
                          }
                        }}
                        aria-label={`Mark ${asset.title} as ${asset.inUse ? "not in use" : "in use"}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="w-20 px-2">
                    {asset.assetType ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 truncate max-w-full" title={asset.assetType}>
                        {asset.assetType}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">
                        {asset.fileType.split("/").pop()?.toUpperCase() || "FILE"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="w-24 px-2">
                    {asset.productLines && asset.productLines.length > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="secondary" 
                              className="text-[10px] px-1.5 py-0 truncate max-w-full cursor-help"
                            >
                              {asset.productLines[0].name}
                              {asset.productLines.length > 1 && ` +${asset.productLines.length - 1}`}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs space-y-1">
                              {asset.productLines.map(pl => (
                                <div key={pl.id}>{pl.name}</div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="w-24 px-2">
                    {asset.icpTargets.length > 0 ? (
                      asset.icpTargets.length === 1 ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 truncate max-w-full"
                          title={asset.icpTargets[0]}
                        >
                          {asset.icpTargets[0]}
                        </Badge>
                      ) : (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-input bg-background px-1.5 py-0 text-[10px] font-semibold leading-5 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 truncate max-w-full"
                              aria-label={`View ICP targets (${asset.icpTargets.length})`}
                              title={`View all ${asset.icpTargets.length} ICP targets`}
                            >
                              {asset.icpTargets[0]} +{asset.icpTargets.length - 1}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-64 p-3"
                            align="start"
                          >
                            <div className="space-y-2">
                              <div className="text-sm font-semibold">
                                ICP Targets ({asset.icpTargets.length})
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {asset.icpTargets.map((target, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {target}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="w-20 px-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${getStageColor(asset.funnelStage)}`}
                    >
                      {formatStageShort(asset.funnelStage)}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-24 px-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${getStatusColor(asset.status)}`}
                    >
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-24 px-2">
                    {(asset as any).uploadedByNameOverride ? (
                      <span className="text-xs text-muted-foreground truncate" title={(asset as any).uploadedByNameOverride}>
                        {(asset as any).uploadedByNameOverride}
                      </span>
                    ) : asset.uploadedBy?.name ? (
                      <span className="text-xs text-muted-foreground truncate" title={asset.uploadedBy.name}>
                        {asset.uploadedBy.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="w-20 px-2">
                    <div className="flex flex-col gap-0.5">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[10px] text-muted-foreground cursor-help truncate">
                              {formatDate(asset.createdAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              {new Date(asset.createdAt).toLocaleDateString()}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {asset.contentQualityScore !== null && asset.contentQualityScore !== undefined && (
                        <span className="text-[10px] text-muted-foreground">
                          Q: {asset.contentQualityScore}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right w-32 px-2">
                    <div className="flex justify-end gap-0.5">
                      {asset.status === "ERROR" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => handleRetry(asset.id, e)}
                              >
                                <RotateCw className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Retry processing</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {asset.status === "PROCESSING" && asset.fileType.startsWith("video/") && (
                        <>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProcessingAssetSize(465);
                                    setShowProcessingGuide(true);
                                  }}
                                >
                                  <BookOpen className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Manual processing guide</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={(e) => handleCancel(asset.id, e)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Cancel processing</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      )}
                      {asset.status === "PROCESSING" && !asset.fileType.startsWith("video/") && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={(e) => handleCancel(asset.id, e)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Cancel processing</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {(asset.status === "PROCESSED" || asset.status === "APPROVED") && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setSelectedAssetForPost(asset);
                                  setIsLinkedInModalOpen(true);
                                }}
                              >
                                <Linkedin className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Create LinkedIn post</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onReview(asset)}
                              disabled={asset.status === "PROCESSING"}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {asset.status === "PROCESSING" ? "Processing..." : "Review asset"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 py-4 border-t">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {Math.min(endIndex, assets.length)} of {assets.length} assets
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="items-per-page" className="text-sm text-muted-foreground whitespace-nowrap">
                Per page:
              </label>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => setItemsPerPage(Number(value))}
              >
                <SelectTrigger id="items-per-page" className="w-[80px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) {
                        setCurrentPage(currentPage - 1);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    }}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                {getPageNumbers().map((page, index) => {
                  if (page === "ellipsis") {
                    return (
                      <PaginationItem key={`ellipsis-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    );
                  }
                  return (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        isActive={currentPage === page}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages) {
                        setCurrentPage(currentPage + 1);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    }}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>

      {selectedAssetForPost && (
        <LinkedInPostGenerator
          asset={selectedAssetForPost}
          open={isLinkedInModalOpen}
          onOpenChange={(open) => {
            setIsLinkedInModalOpen(open);
            if (!open) setSelectedAssetForPost(null);
          }}
        />
      )}

      <Dialog open={showProcessingGuide} onOpenChange={setShowProcessingGuide}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manual Video Processing Guide</DialogTitle>
            <DialogDescription>
              If automatic processing is taking too long, use these manual methods to compress or extract audio from your video.
            </DialogDescription>
          </DialogHeader>
          <VideoCompressionGuide
            fileSize={processingAssetSize}
            onClose={() => setShowProcessingGuide(false)}
          />
        </DialogContent>
      </Dialog>
    </React.Fragment>
  );
}
