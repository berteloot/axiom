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
import { Asset, AssetStatus } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { LinkedInPostGenerator } from "@/components/LinkedInPostGenerator";
import { Linkedin, FileText, Image, FileSpreadsheet, File, Video, Music, X, BookOpen } from "lucide-react";
import { useState } from "react";
import { VideoCompressionGuide } from "@/components/VideoCompressionGuide";

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
  onSelectionChange?: (selectedIds: string[]) => void;
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
  onSelectionChange 
}: AssetTableProps) {
  const [selectedAssetForPost, setSelectedAssetForPost] = useState<Asset | null>(null);
  const [isLinkedInModalOpen, setIsLinkedInModalOpen] = useState(false);
  const [showProcessingGuide, setShowProcessingGuide] = useState(false);
  const [processingAssetSize, setProcessingAssetSize] = useState<number>(465);

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
    
    if (checked) {
      onSelectionChange([...selectedAssetIds, assetId]);
    } else {
      onSelectionChange(selectedAssetIds.filter(id => id !== assetId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    
    if (checked) {
      // Only select assets that are APPROVED or PROCESSED (exclude ERROR, PROCESSING, PENDING)
      const selectableAssets = assets.filter(
        asset => asset.status === "APPROVED" || asset.status === "PROCESSED"
      );
      onSelectionChange(selectableAssets.map(asset => asset.id));
    } else {
      onSelectionChange([]);
    }
  };

  const allSelectableSelected = assets.filter(
    asset => asset.status === "APPROVED" || asset.status === "PROCESSED"
  ).every(asset => selectedAssetIds.includes(asset.id));

  const someSelectableSelected = assets.some(
    asset => (asset.status === "APPROVED" || asset.status === "PROCESSED") && selectedAssetIds.includes(asset.id)
  );

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="inline-block min-w-full align-middle px-4 sm:px-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                {onSelectionChange && (
                  <TableHead className="w-[48px] px-2">
                    <Checkbox
                      checked={allSelectableSelected && assets.length > 0}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead className="w-[200px] px-4">Title</TableHead>
                <TableHead className="w-[120px] px-4">Type</TableHead>
                <TableHead className="w-[150px] px-4">Product Line</TableHead>
                <TableHead className="w-[140px] px-4">ICP Targets</TableHead>
                <TableHead className="w-[100px] px-4">Stage</TableHead>
                <TableHead className="w-[120px] px-4">Status</TableHead>
                <TableHead className="w-[120px] px-4">Date</TableHead>
                <TableHead className="text-right w-[180px] px-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => {
                const isSelectable = asset.status === "APPROVED" || asset.status === "PROCESSED";
                const isSelected = selectedAssetIds.includes(asset.id);
                
                return (
                  <TableRow key={asset.id}>
                    {onSelectionChange && (
                      <TableCell className="w-[48px] px-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectAsset(asset.id, checked as boolean)}
                          disabled={!isSelectable}
                          aria-label={`Select ${asset.title}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium w-[200px] px-4">
                      <div className="flex items-center gap-1.5">
                        {getFileTypeIcon(asset.fileType)}
                        {asset.dominantColor && (
                          <div
                            className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0"
                            style={{ backgroundColor: asset.dominantColor }}
                            title={`Dominant color: ${asset.dominantColor}`}
                            aria-label={`Dominant color: ${asset.dominantColor}`}
                          />
                        )}
                        <span className="truncate" title={asset.title}>
                          {asset.title}
                        </span>
                      </div>
                    </TableCell>
                  <TableCell className="w-[120px] px-4">
                    {asset.assetType ? (
                      <Badge variant="secondary" className="text-xs">
                        {asset.assetType}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {asset.fileType.split("/").pop()?.toUpperCase() || "FILE"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="w-[150px] px-4">
                    {asset.productLines && asset.productLines.length > 0 ? (
                      <div className="flex flex-wrap gap-0.5">
                        {asset.productLines.slice(0, 1).map((productLine) => (
                          <Badge 
                            key={productLine.id} 
                            variant="secondary" 
                            className="text-xs truncate max-w-full" 
                            title={productLine.name}
                          >
                            {productLine.name}
                          </Badge>
                        ))}
                        {asset.productLines.length > 1 && (
                          <Badge 
                            variant="secondary" 
                            className="text-xs" 
                            title={asset.productLines.slice(1).map(pl => pl.name).join(", ")}
                          >
                            +{asset.productLines.length - 1}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="w-[140px] px-4">
                    <div className="flex flex-wrap gap-0.5">
                      {asset.icpTargets.length > 0 ? (
                        asset.icpTargets.slice(0, 1).map((target, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs truncate max-w-full"
                            title={target}
                          >
                            {target}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                      {asset.icpTargets.length > 1 && (
                        <Badge variant="outline" className="text-xs" title={asset.icpTargets.slice(1).join(", ")}>
                          +{asset.icpTargets.length - 1}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="w-[100px] px-4">
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStageColor(asset.funnelStage)}`}
                    >
                      {formatStageShort(asset.funnelStage)}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-[120px] px-4">
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusColor(asset.status)}`}
                    >
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-[120px] px-4">
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="text-muted-foreground">
                        {formatDate(getPrimaryDate(asset))}
                      </span>
                      {asset.contentQualityScore !== null && asset.contentQualityScore !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          Q: {asset.contentQualityScore}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right w-[180px] px-4">
                    <div className="flex justify-end gap-1">
                      {asset.status === "ERROR" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleRetry(asset.id, e)}
                          className="min-h-[44px] sm:min-h-0"
                        >
                          Retry
                        </Button>
                      )}
                      {asset.status === "PROCESSING" && asset.fileType.startsWith("video/") && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProcessingAssetSize(465); // Default estimate
                              setShowProcessingGuide(true);
                            }}
                            className="min-h-[44px] sm:min-h-0"
                            title="Show manual processing guide"
                          >
                            <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            <span className="hidden sm:inline">Manual Guide</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => handleCancel(asset.id, e)}
                            className="min-h-[44px] sm:min-h-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            <span className="hidden sm:inline">Cancel</span>
                          </Button>
                        </>
                      )}
                      {asset.status === "PROCESSING" && !asset.fileType.startsWith("video/") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleCancel(asset.id, e)}
                          className="min-h-[44px] sm:min-h-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                          <span className="hidden sm:inline">Cancel</span>
                        </Button>
                      )}
                      {asset.status === "PROCESSED" || asset.status === "APPROVED" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAssetForPost(asset);
                            setIsLinkedInModalOpen(true);
                          }}
                          className="min-h-[44px] sm:min-h-0 gap-1"
                        >
                          <Linkedin className="h-3 w-3 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline">LinkedIn</span>
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onReview(asset)}
                        disabled={asset.status === "PROCESSING"}
                        className="min-h-[44px] sm:min-h-0"
                      >
                        {asset.status === "PROCESSING" ? "Processing..." : "Review"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
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
    </div>
  );
}
