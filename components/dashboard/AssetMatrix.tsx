"use client";

import { useState, useMemo, useEffect } from "react";
import { Asset, FunnelStage, ProductLine } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Copy, Check, Search, ArrowUpDown, Download, Linkedin, Eye, Filter, Info } from "lucide-react";
import { LinkedInPostGenerator } from "@/components/LinkedInPostGenerator";
import { ReviewModal } from "@/components/ReviewModal";
import { CreateContentWorkflow } from "@/components/content/CreateContentWorkflow";
import { extractKeyFromS3Url } from "@/lib/s3";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MatrixViewToggle, MatrixViewLevel } from "@/components/dashboard/MatrixViewToggle";
import { useMatrixData } from "@/lib/hooks/useMatrixData";

interface AssetMatrixProps {
  assets: Asset[];
}

type ViewBy = "icp" | "painCluster";

// Map funnel stages to display names
const STAGE_DISPLAY: Record<FunnelStage, string> = {
  TOFU_AWARENESS: "TOFU",
  MOFU_CONSIDERATION: "MOFU",
  BOFU_DECISION: "BOFU",
  RETENTION: "RETENTION",
};

const STAGES: FunnelStage[] = [
  "TOFU_AWARENESS",
  "MOFU_CONSIDERATION",
  "BOFU_DECISION",
  "RETENTION",
];

// Helper text for each funnel stage
const STAGE_HELPERS: Record<FunnelStage, { title: string; description: string; examples: string[] }> = {
  TOFU_AWARENESS: {
    title: "Top of Funnel (TOFU)",
    description: "Content that attracts new audiences. The goal is visibility and awareness.",
    examples: ["Blog posts", "Audiocasts", "Infographics", "Industry newsletters"],
  },
  MOFU_CONSIDERATION: {
    title: "Middle of Funnel (MOFU)",
    description: "Content that educates and builds trust.",
    examples: ["Whitepapers", "Webinars", "Customer success stories"],
  },
  BOFU_DECISION: {
    title: "Bottom of Funnel (BOFU)",
    description: "Assets that support decision-making.",
    examples: ["Product demos", "Comparison guides", "Pricing documents", "Personalized consultations"],
  },
  RETENTION: {
    title: "Retention",
    description: "Content designed to keep customers engaged and loyal.",
    examples: ["Onboarding tutorials", "Newsletters", "Product updates", "Upsell campaigns"],
  },
};

function getCellColor(count: number): string {
  if (count === 0) {
    return "bg-red-50 border-red-200 text-red-700 hover:bg-red-100";
  } else if (count <= 2) {
    return "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100";
  } else {
    return "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100";
  }
}

export function AssetMatrix({ assets }: AssetMatrixProps) {
  const [viewBy, setViewBy] = useState<ViewBy>("icp");
  const [matrixViewLevel, setMatrixViewLevel] = useState<MatrixViewLevel>("title");
  const [selectedProductLineId, setSelectedProductLineId] = useState<string | "all">("all");
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [selectedCell, setSelectedCell] = useState<{
    rowKey: string;
    stage: FunnelStage;
    assets: Asset[];
  } | null>(null);
  const [selectedStage, setSelectedStage] = useState<FunnelStage | null>(null);
  const [copiedTip, setCopiedTip] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "total" | null>(null);
  const [selectedAssetForPost, setSelectedAssetForPost] = useState<Asset | null>(null);
  const [isLinkedInModalOpen, setIsLinkedInModalOpen] = useState(false);
  const [selectedAssetForReview, setSelectedAssetForReview] = useState<Asset | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isContentWorkflowOpen, setIsContentWorkflowOpen] = useState(false);
  const [selectedGap, setSelectedGap] = useState<{
    icp: string;
    stage: FunnelStage;
    painCluster?: string;
    productLineId?: string;
  } | null>(null);
  const [openPopoverStage, setOpenPopoverStage] = useState<FunnelStage | null>(null);

  // Fetch product lines on mount
  useEffect(() => {
    const fetchProductLines = async () => {
      try {
        const response = await fetch("/api/product-lines");
        if (response.ok) {
          const data = await response.json();
          setProductLines(data.productLines || []);
        }
      } catch (error) {
        console.error("Error fetching product lines:", error);
      }
    };
    fetchProductLines();
  }, []);

  // Filter assets by selected product line
  const filteredAssets = useMemo(() => {
    if (selectedProductLineId === "all") {
      return assets;
    }
    return assets.filter((asset) =>
      asset.productLines?.some((pl) => pl.id === selectedProductLineId)
    );
  }, [assets, selectedProductLineId]);

  // Use hierarchical matrix data when viewing by ICP with hierarchical view
  const hierarchicalMatrixData = useMatrixData(
    viewBy === "icp" ? filteredAssets : [],
    matrixViewLevel
  );

  // Extract unique row keys based on view mode
  const rowKeys = useMemo(() => {
    if (viewBy === "icp" && matrixViewLevel !== "title") {
      // Use hierarchical view data
      return hierarchicalMatrixData.map(row => row.label);
    }
    
    // Original logic for title view or pain cluster view
    const keys = new Set<string>();
    filteredAssets.forEach((asset) => {
      if (viewBy === "icp") {
        asset.icpTargets.forEach((icp) => keys.add(icp));
      } else {
        asset.painClusters.forEach((cluster) => keys.add(cluster));
      }
    });
    return Array.from(keys).sort();
  }, [filteredAssets, viewBy, matrixViewLevel, hierarchicalMatrixData]);

  // Build matrix data structure
  const matrixData = useMemo(() => {
    // If using hierarchical view for ICP, use the hierarchical data
    if (viewBy === "icp" && matrixViewLevel !== "title") {
      const data: Record<string, Record<FunnelStage, Asset[]>> = {};
      
      hierarchicalMatrixData.forEach((row) => {
        data[row.label] = {
          TOFU_AWARENESS: row.tofu.assets,
          MOFU_CONSIDERATION: row.mofu.assets,
          BOFU_DECISION: row.bofu.assets,
          RETENTION: row.retention.assets,
        };
      });
      
      return data;
    }
    
    // Original logic for title view or pain cluster view
    const data: Record<string, Record<FunnelStage, Asset[]>> = {};

    rowKeys.forEach((rowKey) => {
      data[rowKey] = {
        TOFU_AWARENESS: [],
        MOFU_CONSIDERATION: [],
        BOFU_DECISION: [],
        RETENTION: [],
      };
    });

    filteredAssets.forEach((asset) => {
      const keys = viewBy === "icp" ? asset.icpTargets : asset.painClusters;
      keys.forEach((key) => {
        if (data[key] && data[key][asset.funnelStage]) {
          data[key][asset.funnelStage].push(asset);
        }
      });
    });

    return data;
  }, [filteredAssets, rowKeys, viewBy, matrixViewLevel, hierarchicalMatrixData]);

  // Calculate totals per stage (column totals)
  const stageTotals = useMemo(() => {
    const totals: Record<FunnelStage, number> = {
      TOFU_AWARENESS: 0,
      MOFU_CONSIDERATION: 0,
      BOFU_DECISION: 0,
      RETENTION: 0,
    };

    STAGES.forEach((stage) => {
      rowKeys.forEach((rowKey) => {
        totals[stage] += matrixData[rowKey]?.[stage]?.length || 0;
      });
    });

    return totals;
  }, [matrixData, rowKeys]);

  // Calculate totals per row (row totals)
  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    rowKeys.forEach((rowKey) => {
      totals[rowKey] = STAGES.reduce(
        (sum, stage) => sum + (matrixData[rowKey]?.[stage]?.length || 0),
        0
      );
    });
    return totals;
  }, [matrixData, rowKeys]);

  // Calculate total assets across all stages
  const grandTotal = useMemo(() => {
    return STAGES.reduce((sum, stage) => sum + stageTotals[stage], 0);
  }, [stageTotals]);

  // Calculate percentages per stage
  const stagePercentages = useMemo(() => {
    const percentages: Record<FunnelStage, number> = {
      TOFU_AWARENESS: 0,
      MOFU_CONSIDERATION: 0,
      BOFU_DECISION: 0,
      RETENTION: 0,
    };
    if (grandTotal > 0) {
      STAGES.forEach((stage) => {
        percentages[stage] = Math.round((stageTotals[stage] / grandTotal) * 100);
      });
    }
    return percentages;
  }, [stageTotals, grandTotal]);

  // Filter and sort row keys
  const filteredAndSortedRowKeys = useMemo(() => {
    let filtered = rowKeys;
    
    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter((key) =>
        key.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply sorting
    if (sortBy === "total") {
      filtered = [...filtered].sort((a, b) => rowTotals[b] - rowTotals[a]);
    } else if (sortBy === "name") {
      filtered = [...filtered].sort();
    }
    
    return filtered;
  }, [rowKeys, searchQuery, sortBy, rowTotals]);

  // Get all assets for a specific stage
  const getStageAssets = (stage: FunnelStage): Asset[] => {
    const stageAssets: Asset[] = [];
    filteredAndSortedRowKeys.forEach((rowKey) => {
      const cellAssets = matrixData[rowKey]?.[stage] || [];
      cellAssets.forEach((asset) => {
        if (!stageAssets.find((a) => a.id === asset.id)) {
          stageAssets.push(asset);
        }
      });
    });
    return stageAssets;
  };

  const handleStageClick = (stage: FunnelStage) => {
    const stageAssets = getStageAssets(stage);
    setSelectedStage(stage);
    // Create a virtual cell to show all assets in this stage
    setSelectedCell({
      rowKey: `All ${viewBy === "icp" ? "ICP Targets" : "Pain Clusters"}`,
      stage,
      assets: stageAssets,
    });
  };

  const handleExport = () => {
    const csvRows: string[] = [];
    
    // Header
    const headers = [
      viewBy === "icp" ? "ICP Target" : "Pain Cluster",
      ...STAGES.map((s) => STAGE_DISPLAY[s]),
      "Total",
    ];
    csvRows.push(headers.join(","));
    
    // Data rows
    filteredAndSortedRowKeys.forEach((rowKey) => {
      const row = [
        `"${rowKey}"`,
        ...STAGES.map((stage) => (matrixData[rowKey]?.[stage]?.length || 0).toString()),
        rowTotals[rowKey].toString(),
      ];
      csvRows.push(row.join(","));
    });
    
    // Summary row
    csvRows.push([
      '"Total Assets"',
      ...STAGES.map((s) => stageTotals[s].toString()),
      grandTotal.toString(),
    ].join(","));
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strategy-matrix-${viewBy}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleCellClick = async (rowKey: string, stage: FunnelStage) => {
    const cellAssets = matrixData[rowKey]?.[stage] || [];
    
    // If cell is empty, open content creation workflow
    if (cellAssets.length === 0) {
      let gap: { icp: string; stage: FunnelStage; painCluster?: string; productLineId?: string };
      
      if (viewBy === "icp") {
        // When viewing by ICP, rowKey is the ICP
        gap = {
          icp: rowKey,
          stage,
        };
      } else {
        // When viewing by pain cluster, rowKey is the pain cluster
        // We need to get a default ICP from brand context
        try {
          const response = await fetch("/api/brand-context");
          if (response.ok) {
            const data = await response.json();
            const brandContext = data.brandContext;
            const firstICP = brandContext?.primaryICPRoles?.[0] || "CTO"; // Fallback to CTO
            gap = {
              icp: firstICP,
              stage,
              painCluster: rowKey,
            };
          } else {
            // Fallback if brand context fetch fails
            gap = {
              icp: "CTO", // Default fallback
              stage,
              painCluster: rowKey,
            };
          }
        } catch (error) {
          console.error("Error fetching brand context:", error);
          // Fallback if fetch fails
          gap = {
            icp: "CTO", // Default fallback
            stage,
            painCluster: rowKey,
          };
        }
      }
      
      // Include product line context if filtering by product line
      if (selectedProductLineId !== "all") {
        gap.productLineId = selectedProductLineId;
      }
      
      setSelectedGap(gap);
      setIsContentWorkflowOpen(true);
    } else {
      // If cell has assets, show them in the sheet
      setSelectedCell({ rowKey, stage, assets: cellAssets });
    }
  };

  const handleOpenFile = async (asset: Asset) => {
    try {
      const response = await fetch("/api/assets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Url: asset.s3Url }),
      });
      if (response.ok) {
        const data = await response.json();
        window.open(data.url, "_blank");
      } else {
        // Fallback to s3Url if API fails
        window.open(asset.s3Url, "_blank");
      }
    } catch (error) {
      console.error("Error opening file:", error);
      window.open(asset.s3Url, "_blank");
    }
  };

  const handleCopyTip = async (tip: string, assetId: string) => {
    try {
      await navigator.clipboard.writeText(tip);
      setCopiedTip(assetId);
      setTimeout(() => setCopiedTip(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleReview = (asset: Asset) => {
    setSelectedAssetForReview(asset);
    setIsReviewModalOpen(true);
  };

  const handleApprove = () => {
    setIsReviewModalOpen(false);
    setSelectedAssetForReview(null);
    // Note: Asset refresh will be handled by parent component if needed
  };

  return (
    <div className="space-y-2">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg">Strategy Matrix</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="gap-2 h-8"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">View by:</span>
                    <div className="inline-flex rounded-md border border-input bg-background">
                      <Button
                        variant={viewBy === "icp" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewBy("icp")}
                        className="rounded-r-none h-8 px-3 text-xs"
                      >
                        ICP
                      </Button>
                      <Button
                        variant={viewBy === "painCluster" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewBy("painCluster")}
                        className="rounded-l-none border-l h-8 px-3 text-xs"
                      >
                        Pain Cluster
                      </Button>
                    </div>
                  </div>
                  {viewBy === "icp" && (
                    <MatrixViewToggle
                      value={matrixViewLevel}
                      onChange={setMatrixViewLevel}
                    />
                  )}
                </div>
              </div>
            </div>
            {/* Search, Sort, and Product Line Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={`Search ${viewBy === "icp" ? "ICP targets" : "pain clusters"}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 h-8 text-sm"
                />
              </div>
              {productLines.length > 0 && (
                <Select
                  value={selectedProductLineId}
                  onValueChange={(value) => setSelectedProductLineId(value)}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <Filter className="h-3.5 w-3.5 mr-1.5" />
                    <SelectValue placeholder="All Product Lines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Product Lines</SelectItem>
                    {productLines.map((pl) => (
                      <SelectItem key={pl.id} value={pl.id}>
                        {pl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (sortBy === null) setSortBy("total");
                  else if (sortBy === "total") setSortBy("name");
                  else setSortBy(null);
                }}
                className="gap-1.5 h-8 text-xs"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortBy === null ? "Sort" : sortBy === "total" ? "Total" : "Name"}
              </Button>
            </div>
            {/* Color legend - more compact */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium">Legend:</span>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border border-red-200 bg-red-50"></div>
                <span>0 (gap)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border border-yellow-200 bg-yellow-50"></div>
                <span>1-2 (low)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border border-emerald-200 bg-emerald-50"></div>
                <span>3+ (good)</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
            <div className="inline-block min-w-full">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="border border-border p-1.5 text-left font-semibold bg-muted sticky left-0 z-10 text-xs min-w-[200px]">
                      {viewBy === "icp" ? "ICP Target" : "Pain Cluster"}
                    </th>
                    {STAGES.map((stage) => {
                      const helper = STAGE_HELPERS[stage];
                      return (
                        <th
                          key={stage}
                          className="border border-border p-1.5 text-center font-semibold bg-muted cursor-pointer hover:bg-muted/80 transition-colors text-xs"
                          onClick={() => handleStageClick(stage)}
                        >
                          <div className="flex flex-col items-center gap-0.5 w-full">
                            <div className="flex items-center justify-center gap-1">
                              <span>{STAGE_DISPLAY[stage]}</span>
                              <Popover 
                                open={openPopoverStage === stage} 
                                onOpenChange={(open) => setOpenPopoverStage(open ? stage : null)}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`Learn more about ${helper.title}`}
                                  >
                                    <Info 
                                      className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" 
                                    />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="max-w-sm p-4" side="bottom" align="center">
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm">{helper.title}</h4>
                                    <p className="text-sm text-muted-foreground">{helper.description}</p>
                                    <div className="mt-2">
                                      <p className="text-xs font-medium mb-1">Examples:</p>
                                      <ul className="text-xs text-muted-foreground space-y-0.5">
                                        {helper.examples.map((example, idx) => (
                                          <li key={idx} className="flex items-start">
                                            <span className="mr-1.5">•</span>
                                            <span>{example}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {stagePercentages[stage]}%
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                  {/* Summary row showing totals per stage */}
                  <tr className="bg-muted/30">
                    <td className="border border-border p-1 text-left font-semibold text-xs sticky left-0 z-10 bg-muted/30 min-w-[200px]">
                      <span className="text-muted-foreground">Total</span>
                    </td>
                    {STAGES.map((stage) => (
                      <td
                        key={stage}
                        className="border border-border p-1 text-center font-semibold text-xs"
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-foreground">
                                {stageTotals[stage]}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {stageTotals[stage]} total asset{stageTotals[stage] !== 1 ? "s" : ""} in {STAGE_DISPLAY[stage]}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowKeys.length === 0 ? (
                    <tr>
                      <td
                        colSpan={STAGES.length + 1}
                        className="border border-border p-6 text-center text-muted-foreground text-sm"
                      >
                        No data available. Upload assets to see the matrix.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredAndSortedRowKeys.map((rowKey) => (
                        <tr key={rowKey}>
                          <td className="border border-border p-1.5 font-medium bg-muted/30 sticky left-0 z-10 text-xs min-w-[200px]">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="truncate">{rowKey}</span>
                              <span className="text-[10px] text-muted-foreground font-normal shrink-0">
                                ({rowTotals[rowKey]})
                              </span>
                            </div>
                          </td>
                          {STAGES.map((stage) => {
                            const cellAssets = matrixData[rowKey]?.[stage] || [];
                            const count = cellAssets.length;
                            const colorClasses = getCellColor(count);
                            
                            // Calculate average quality score for this cell
                            const assetsWithScores = cellAssets.filter(
                              (a) => a.contentQualityScore !== null && a.contentQualityScore !== undefined
                            );
                            const avgScore = assetsWithScores.length > 0
                              ? Math.round(
                                  assetsWithScores.reduce((sum, a) => sum + (a.contentQualityScore || 0), 0) /
                                  assetsWithScores.length
                                )
                              : null;
                            
                            // Count low quality assets
                            const lowQualityCount = cellAssets.filter(
                              (a) => a.contentQualityScore !== null && 
                                    a.contentQualityScore !== undefined && 
                                    a.contentQualityScore < 50
                            ).length;

                            // Calculate product line breakdown
                            const productLineBreakdown = (() => {
                              if (selectedProductLineId !== "all" || productLines.length === 0) {
                                return null;
                              }
                              const breakdown: Record<string, number> = {};
                              cellAssets.forEach((asset) => {
                                asset.productLines?.forEach((pl) => {
                                  breakdown[pl.name] = (breakdown[pl.name] || 0) + 1;
                                });
                              });
                              return Object.keys(breakdown).length > 0 ? breakdown : null;
                            })();

                            return (
                              <td
                                key={stage}
                                className={`border border-border p-1.5 text-center cursor-pointer transition-colors ${colorClasses}`}
                                onClick={() => handleCellClick(rowKey, stage)}
                              >
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex flex-col items-center justify-center min-h-[40px]">
                                        <div className="font-semibold text-base leading-tight">
                                          {count}
                                        </div>
                                        {(avgScore !== null || lowQualityCount > 0) && (
                                          <div className="text-[10px] mt-0.5 space-y-0.5">
                                            {avgScore !== null && (
                                              <div className="font-medium text-[10px]">
                                                {avgScore}★
                                              </div>
                                            )}
                                            {lowQualityCount > 0 && (
                                              <div className="text-red-600 font-medium text-[10px]">
                                                ⚠{lowQualityCount}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <div className="space-y-1">
                                        <p className="font-semibold text-sm">
                                          {count} asset{count !== 1 ? "s" : ""} in this cell
                                        </p>
                                        {productLineBreakdown && Object.keys(productLineBreakdown).length > 0 && (
                                          <div className="text-xs mt-1">
                                            <p className="font-medium mb-1">By Product Line:</p>
                                            {Object.entries(productLineBreakdown).map(([name, num]) => (
                                              <p key={name} className="text-muted-foreground">
                                                {name}: {num}
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                        {avgScore !== null && (
                                          <p className="text-sm">
                                            Average quality score: {avgScore}/100
                                          </p>
                                        )}
                                        {lowQualityCount > 0 && (
                                          <p className="text-sm text-red-600">
                                            {lowQualityCount} asset{lowQualityCount !== 1 ? "s" : ""} with quality score &lt; 50
                                          </p>
                                        )}
                                        <p className="text-xs text-muted-foreground mt-2">
                                          Click to view details
                                        </p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {/* Summary row at bottom showing grand total */}
                      <tr className="bg-muted/40 border-t-2 border-border">
                        <td className="border border-border p-1.5 font-semibold bg-muted/40 sticky left-0 z-10 text-xs min-w-[200px]">
                          <span className="text-muted-foreground">Grand Total</span>
                        </td>
                        {STAGES.map((stage) => (
                          <td
                            key={stage}
                            className="border border-border p-1.5 text-center font-semibold bg-muted/40 text-xs"
                          >
                            {stageTotals[stage]}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sheet for viewing assets in a cell */}
      <Sheet open={!!selectedCell} onOpenChange={(open) => !open && setSelectedCell(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedCell?.rowKey} - {STAGE_DISPLAY[selectedCell?.stage || "TOFU_AWARENESS"]}
            </SheetTitle>
            <SheetDescription>
              {selectedCell?.assets.length || 0} asset{(selectedCell?.assets.length || 0) !== 1 ? "s" : ""} found
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {selectedCell?.assets.map((asset) => {
              const qualityScore = asset.contentQualityScore;
              const getScoreColor = (score: number | null | undefined) => {
                if (!score) return "text-muted-foreground";
                if (score >= 90) return "text-green-600";
                if (score >= 70) return "text-blue-600";
                if (score >= 50) return "text-yellow-600";
                if (score >= 30) return "text-orange-600";
                return "text-red-600";
              };

              return (
                <Card key={asset.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{asset.title}</CardTitle>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {viewBy === "icp" ? (
                            asset.painClusters.map((cluster, idx) => (
                              <Badge key={idx} variant="outline">
                                {cluster}
                              </Badge>
                            ))
                          ) : (
                            asset.icpTargets.map((icp, idx) => (
                              <Badge key={idx} variant="outline">
                                {icp}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="secondary" className="ml-2">
                          {asset.fileType.split("/").pop()?.toUpperCase() || "FILE"}
                        </Badge>
                        {qualityScore !== null && qualityScore !== undefined && (
                          <div className={`text-sm font-bold ${getScoreColor(qualityScore)}`}>
                            Quality: {qualityScore}/100
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          Outreach Tip
                        </p>
                        <p className="text-sm">{asset.outreachTip}</p>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenFile(asset)}
                          className="flex-1"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open File
                        </Button>
                        {(asset.status === "PROCESSED" || asset.status === "APPROVED") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedAssetForPost(asset);
                              setIsLinkedInModalOpen(true);
                            }}
                            className="flex-1"
                          >
                            <Linkedin className="h-4 w-4 mr-2" />
                            LinkedIn Post
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyTip(asset.outreachTip, asset.id)}
                          className="flex-1"
                        >
                          {copiedTip === asset.id ? (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Tip
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReview(asset)}
                          disabled={asset.status === "PROCESSING"}
                          className="flex-1"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {selectedCell && selectedCell.assets.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No assets in this cell
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

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

      {selectedAssetForReview && (
        <ReviewModal
          asset={selectedAssetForReview}
          open={isReviewModalOpen}
          onOpenChange={(open) => {
            setIsReviewModalOpen(open);
            if (!open) setSelectedAssetForReview(null);
          }}
          onApprove={handleApprove}
        />
      )}

      <CreateContentWorkflow
        open={isContentWorkflowOpen}
        onOpenChange={(open) => {
          setIsContentWorkflowOpen(open);
          if (!open) {
            setSelectedGap(null);
          }
        }}
        initialGap={selectedGap || undefined}
      />
    </div>
  );
}
