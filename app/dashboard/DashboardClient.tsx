"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AssetTable } from "@/components/AssetTable";
import { ReviewModal } from "@/components/ReviewModal";
import { AssetMatrix } from "@/components/dashboard/AssetMatrix";
import { UploadModal } from "@/components/UploadModal";
import { SequenceActionBar } from "@/components/SequenceActionBar";
import { SequenceModal } from "@/components/SequenceModal";
import { BulkEditModal } from "@/components/BulkEditModal";
import { AssetFilters, applyAssetFilters, AssetFiltersState, SortField, SortDirection } from "@/components/AssetFilters";
import { Asset, FunnelStage, AssetStatus } from "@/lib/types";
import { BrandContext } from "@/lib/report-analysis";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  TrendingUp,
  Target,
  AlertTriangle,
  Upload
} from "lucide-react";
import { CriticalGapsModal, CriticalGap } from "@/components/dashboard/CriticalGapsModal";
import { SaveSearchButton } from "@/components/smart-collections";
import DownloadReportButton from "@/components/reports/DownloadReportButton";
import { useAccount } from "@/lib/account-context";

const STAGES: FunnelStage[] = [
  "TOFU_AWARENESS",
  "MOFU_CONSIDERATION",
  "BOFU_DECISION",
  "RETENTION",
];

const STAGE_DISPLAY: Record<FunnelStage, string> = {
  TOFU_AWARENESS: "TOFU",
  MOFU_CONSIDERATION: "MOFU",
  BOFU_DECISION: "BOFU",
  RETENTION: "RETENTION",
};

// Helper to parse URL params into filter state
function parseFiltersFromUrl(searchParams: URLSearchParams): Partial<AssetFiltersState> {
  const filters: Partial<AssetFiltersState> = {};
  
  const search = searchParams.get("search");
  if (search) filters.search = search;
  
  const stages = searchParams.get("stages");
  if (stages) {
    filters.funnelStages = stages.split(",").filter(
      (s): s is FunnelStage => ["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"].includes(s)
    );
  }
  
  const icp = searchParams.get("icp");
  if (icp) filters.icpTargets = icp.split(",");
  
  const status = searchParams.get("status");
  if (status) {
    filters.statuses = status.split(",").filter(
      (s): s is AssetStatus => ["PENDING", "PROCESSING", "PROCESSED", "APPROVED", "ERROR"].includes(s)
    );
  }
  
  const pain = searchParams.get("pain");
  if (pain) filters.painClusters = pain.split(",");

  const productLine = searchParams.get("productLine");
  if (productLine) filters.productLines = productLine.split(",");
  
  const assetType = searchParams.get("assetType");
  if (assetType) filters.assetTypes = assetType.split(",");
  
  const color = searchParams.get("color");
  if (color) {
    // Decode the color (URL encodes # as %23)
    filters.color = decodeURIComponent(color).toUpperCase();
  }
  
  const sort = searchParams.get("sort");
  if (sort && ["title", "createdAt", "updatedAt", "customCreatedAt", "lastReviewedAt", "funnelStage", "status", "contentQualityScore"].includes(sort)) {
    filters.sortBy = sort as SortField;
  }
  
  const dir = searchParams.get("dir");
  if (dir && ["asc", "desc"].includes(dir)) {
    filters.sortDirection = dir as SortDirection;
  }
  
  return filters;
}

export default function DashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentAccount } = useAccount();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isSequenceModalOpen, setIsSequenceModalOpen] = useState(false);
  const [sequenceData, setSequenceData] = useState<any>(null);
  const [isDraftingSequence, setIsDraftingSequence] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isCriticalGapsModalOpen, setIsCriticalGapsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("strategy");
  const [brandContext, setBrandContext] = useState<BrandContext | null>(null);
  
  // Initialize filters from URL params
  const initialFilters = useMemo((): AssetFiltersState => {
    const urlFilters = parseFiltersFromUrl(searchParams);
    return {
      search: urlFilters.search ?? "",
      funnelStages: urlFilters.funnelStages ?? [],
      icpTargets: urlFilters.icpTargets ?? [],
      statuses: urlFilters.statuses ?? [],
      painClusters: urlFilters.painClusters ?? [],
      productLines: urlFilters.productLines ?? [],
      assetTypes: urlFilters.assetTypes ?? [],
      color: urlFilters.color ?? "",
      sortBy: urlFilters.sortBy ?? "createdAt",
      sortDirection: urlFilters.sortDirection ?? "desc",
    };
  }, [searchParams]);
  
  const [filters, setFilters] = useState<AssetFiltersState>(initialFilters);

  // Update filters when URL changes (e.g., from smart collection)
  useEffect(() => {
    const urlFilters = parseFiltersFromUrl(searchParams);
    // Only update if there are actual URL params to apply
    if (Object.keys(urlFilters).length > 0) {
      setFilters({
        search: urlFilters.search ?? "",
        funnelStages: urlFilters.funnelStages ?? [],
        icpTargets: urlFilters.icpTargets ?? [],
        statuses: urlFilters.statuses ?? [],
        painClusters: urlFilters.painClusters ?? [],
        productLines: urlFilters.productLines ?? [],
        assetTypes: urlFilters.assetTypes ?? [],
        color: urlFilters.color ?? "",
        sortBy: urlFilters.sortBy ?? "createdAt",
        sortDirection: urlFilters.sortDirection ?? "desc",
      });
    }
  }, [searchParams]);

  useEffect(() => {
    // Check if we have cached data in sessionStorage
    const cachedData = sessionStorage.getItem('dashboard-assets');
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setAssets(parsed);
        setLoading(false);
        // Still fetch in background to update data
        fetchAssets(false);
        fetchBrandContext();
      } catch (error) {
        // If cache is invalid, fetch with loading state
        fetchAssets(true);
        fetchBrandContext();
      }
    } else {
      // No cache, fetch with loading state
      fetchAssets(true);
      fetchBrandContext();
    }
  }, []);

  useEffect(() => {
    // Auto-refresh every 5 seconds if there are assets being processed
    const hasProcessingAssets = assets.some(
      (asset) => asset.status === "PROCESSING" || asset.status === "PENDING"
    );
    
    if (!hasProcessingAssets) return;
    
    const interval = setInterval(() => {
      fetchAssets();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [assets]);

  const fetchAssets = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const response = await fetch("/api/assets");
      if (!response.ok) throw new Error("Failed to fetch assets");
      const data = await response.json();
      setAssets(data.assets);
      // Cache the data in sessionStorage for instant loading on next visit
      sessionStorage.setItem('dashboard-assets', JSON.stringify(data.assets));
    } catch (error) {
      console.error("Error fetching assets:", error);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const fetchBrandContext = async () => {
    try {
      const response = await fetch("/api/brand-context");
      if (!response.ok) throw new Error("Failed to fetch brand context");
      const data = await response.json();
      setBrandContext(data.brandContext);
    } catch (error) {
      console.error("Error fetching brand context:", error);
      // Brand context is optional, so don't fail if it's missing
    }
  };

  const handleReview = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsReviewModalOpen(true);
  };

  const handleApprove = async () => {
    // Clear cache and refresh assets after approval
    sessionStorage.removeItem('dashboard-assets');
    await fetchAssets(false);
    setIsReviewModalOpen(false);
    setSelectedAsset(null);
  };

  const handleUploadSuccess = async () => {
    // Clear cache and refresh assets after upload
    sessionStorage.removeItem('dashboard-assets');
    await fetchAssets(false);
    setIsUploadModalOpen(false);
    // Switch to library view so user can see the processing asset
    setActiveTab("library");
  };

  const handleBulkEdit = async (updates: {
    productLineIds?: string[]
    icpTargets?: string[]
    funnelStage?: FunnelStage
  }) => {
    try {
      const response = await fetch("/api/assets/bulk-update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetIds: selectedAssetIds,
          ...updates,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to update assets")
      }

      // Refresh assets
      await fetchAssets()
      // Clear selection
      setSelectedAssetIds([])
    } catch (error) {
      console.error("Error bulk updating assets:", error)
      throw error
    }
  }

  const handleDraftSequence = async () => {
    if (selectedAssetIds.length < 2 || selectedAssetIds.length > 4) {
      return;
    }

    setIsDraftingSequence(true);
    try {
      const response = await fetch("/api/sequences/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetIds: selectedAssetIds,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate sequence");
      }

      const data = await response.json();
      setSequenceData(data.sequence);
      setIsSequenceModalOpen(true);
    } catch (error) {
      console.error("Error generating sequence:", error);
      alert(error instanceof Error ? error.message : "Failed to generate sequence. Please try again.");
    } finally {
      setIsDraftingSequence(false);
    }
  };

  const handleSequenceReorder = async (newOrder: number[]) => {
    // When user reorders, we could regenerate the emails with the new order
    // For now, just update the local state
    if (sequenceData) {
      const reorderedSequence = {
        assets: newOrder.map(idx => sequenceData.assets[idx]),
        emails: newOrder.map(idx => sequenceData.emails[idx]),
      };
      setSequenceData(reorderedSequence);
    }
  };

  const handleRegenerateSequence = async () => {
    if (selectedAssetIds.length < 2 || selectedAssetIds.length > 4) {
      return;
    }

    setIsDraftingSequence(true);
    try {
      const response = await fetch("/api/sequences/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetIds: selectedAssetIds,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to regenerate sequence");
      }

      const data = await response.json();
      setSequenceData(data.sequence);
    } catch (error) {
      console.error("Error regenerating sequence:", error);
      alert(error instanceof Error ? error.message : "Failed to regenerate sequence. Please try again.");
    } finally {
      setIsDraftingSequence(false);
    }
  };

  // Apply filters to assets
  const filteredAssets = useMemo(() => {
    return applyAssetFilters(assets, filters);
  }, [assets, filters]);

  // Calculate KPIs (use all assets, not filtered)
  const kpis = useMemo(() => {
    const totalAssets = assets.length;
    
    // Calculate matrix coverage
    const icpTargets = new Set<string>();
    assets.forEach((asset) => {
      asset.icpTargets.forEach((icp) => icpTargets.add(icp));
    });
    
    const totalCells = icpTargets.size * STAGES.length;
    let filledCells = 0;
    
    icpTargets.forEach((icp) => {
      STAGES.forEach((stage) => {
        const hasAssets = assets.some(
          (asset) => asset.icpTargets.includes(icp) && asset.funnelStage === stage
        );
        if (hasAssets) filledCells++;
      });
    });
    
    const coverageScore = totalCells > 0 
      ? Math.round((filledCells / totalCells) * 100)
      : 0;
    
    // Find top performing ICP
    const icpCounts: Record<string, number> = {};
    assets.forEach((asset) => {
      asset.icpTargets.forEach((icp) => {
        icpCounts[icp] = (icpCounts[icp] || 0) + 1;
      });
    });
    
    const topIcp = Object.entries(icpCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
    
    // Enhanced Critical Gaps Analysis
    const criticalGapsList: CriticalGap[] = [];
    
    // 1. Coverage gaps (empty matrix cells)
    const coverageGaps: CriticalGap["details"] = [];
    icpTargets.forEach((icp) => {
      STAGES.forEach((stage) => {
        const hasAssets = assets.some(
          (asset) => asset.icpTargets.includes(icp) && asset.funnelStage === stage
        );
        if (!hasAssets) {
          coverageGaps.push({
            location: `${icp} - ${STAGE_DISPLAY[stage]}`,
          });
        }
      });
    });
    
    if (coverageGaps.length > 0) {
      criticalGapsList.push({
        type: "coverage",
        severity: coverageGaps.length > 10 ? "high" : coverageGaps.length > 5 ? "medium" : "low",
        title: "Coverage Gaps",
        description: "Matrix cells with no assets. These represent missing content for specific ICP/Stage combinations.",
        count: coverageGaps.length,
        details: coverageGaps,
      });
    }

    // 2. Quality gaps (low quality scores)
    const qualityGaps: CriticalGap["details"] = [];
    const lowQualityAssets = assets.filter(
      (asset) => asset.contentQualityScore !== null && asset.contentQualityScore !== undefined && asset.contentQualityScore < 50
    );
    
    lowQualityAssets.forEach((asset) => {
      asset.icpTargets.forEach((icp) => {
        qualityGaps.push({
          location: `${icp} - ${STAGE_DISPLAY[asset.funnelStage]}`,
          assets: [asset],
          score: asset.contentQualityScore || 0,
        });
      });
    });

    if (qualityGaps.length > 0) {
      criticalGapsList.push({
        type: "quality",
        severity: lowQualityAssets.length > 10 ? "high" : lowQualityAssets.length > 5 ? "medium" : "low",
        title: "Quality Issues",
        description: "Assets with quality scores below 50. These need improvement to be more actionable for sales teams.",
        count: lowQualityAssets.length,
        details: qualityGaps,
      });
    }

    // 3. Expiring content
    const expiringGaps: CriticalGap["details"] = [];
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const expiringAssets = assets.filter((asset) => {
      if (!asset.expiryDate) return false;
      const expiry = new Date(asset.expiryDate);
      return expiry <= thirtyDaysFromNow && expiry >= now;
    });

    expiringAssets.forEach((asset) => {
      asset.icpTargets.forEach((icp) => {
        expiringGaps.push({
          location: `${icp} - ${STAGE_DISPLAY[asset.funnelStage]}`,
          assets: [asset],
          expiryDate: asset.expiryDate || undefined,
        });
      });
    });

    if (expiringGaps.length > 0) {
      criticalGapsList.push({
        type: "expiring",
        severity: expiringAssets.length > 10 ? "high" : expiringAssets.length > 5 ? "medium" : "low",
        title: "Expiring Content",
        description: "Assets that will expire within the next 30 days. Consider updating or replacing them.",
        count: expiringAssets.length,
        details: expiringGaps,
      });
    }

    // 4. Missing quality scores
    const missingScoreGaps: CriticalGap["details"] = [];
    const assetsWithoutScores = assets.filter(
      (asset) => asset.contentQualityScore === null || asset.contentQualityScore === undefined
    );

    assetsWithoutScores.forEach((asset) => {
      asset.icpTargets.forEach((icp) => {
        missingScoreGaps.push({
          location: `${icp} - ${STAGE_DISPLAY[asset.funnelStage]}`,
          assets: [asset],
        });
      });
    });

    if (missingScoreGaps.length > 0) {
      criticalGapsList.push({
        type: "missing_score",
        severity: assetsWithoutScores.length > 10 ? "high" : assetsWithoutScores.length > 5 ? "medium" : "low",
        title: "Missing Quality Scores",
        description: "Assets that haven't been analyzed yet or are still processing. These need quality assessment.",
        count: assetsWithoutScores.length,
        details: missingScoreGaps,
      });
    }

    // Total critical gaps count (sum of all gap types)
    const totalCriticalGaps = criticalGapsList.reduce((sum, gap) => sum + gap.count, 0);

    return {
      totalAssets,
      coverageScore,
      topIcp,
      criticalGaps: totalCriticalGaps,
      criticalGapsList,
    };
  }, [assets]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div className="min-w-0 flex-1">
            {currentAccount?.name && (
              <div className="mb-2">
                <h2 className="text-xl sm:text-2xl font-semibold font-roboto-condensed text-brand-dark-blue truncate">
                  {currentAccount.name}
                </h2>
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold font-roboto-condensed text-brand-dark-blue">Marketing Intelligence</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              Strategic overview of your marketing assets
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <DownloadReportButton
              assets={assets}
              brandContext={brandContext || undefined}
              clientName={currentAccount?.name || brandContext?.valueProposition || "Client"}
              className="w-full sm:w-auto"
            />
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
              size="lg"
            >
              <Upload className="h-4 w-4 sm:mr-2" />
              <span className="sm:inline">Upload New Asset</span>
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
              <Package className="h-4 w-4 text-brand-blue" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-brand-dark-blue">{kpis.totalAssets}</div>
              <p className="text-xs text-muted-foreground">
                Assets in library
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Coverage Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-brand-cyan" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-brand-dark-blue">{kpis.coverageScore}%</div>
              <p className="text-xs text-muted-foreground">
                Matrix cells filled
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Performing ICP</CardTitle>
              <Target className="h-4 w-4 text-brand-blue" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold truncate text-brand-dark-blue">{kpis.topIcp}</div>
              <p className="text-xs text-muted-foreground">
                Most assets
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setIsCriticalGapsModalOpen(true)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Gaps</CardTitle>
              <AlertTriangle className="h-4 w-4 text-brand-orange" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-brand-dark-blue">{kpis.criticalGaps}</div>
              <p className="text-xs text-muted-foreground">
                Click to view details
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
            <TabsTrigger value="strategy" className="min-h-[44px] sm:min-h-0">Strategy View</TabsTrigger>
            <TabsTrigger value="library" className="min-h-[44px] sm:min-h-0">Library View</TabsTrigger>
          </TabsList>

          <TabsContent value="strategy" className="space-y-4">
            <Card className="bg-white shadow-sm">
              <CardContent className="pt-6">
                <AssetMatrix assets={assets} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="library" className="space-y-4">
            <Card className="bg-white shadow-sm">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle>Asset Library</CardTitle>
                    <CardDescription>
                      {filteredAssets.length === assets.length
                        ? `All your marketing assets in a searchable table (${assets.length} total)`
                        : `Showing ${filteredAssets.length} of ${assets.length} assets`}
                    </CardDescription>
                  </div>
                  <SaveSearchButton filters={filters} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <AssetFilters
                  assets={assets}
                  filters={filters}
                  onFiltersChange={setFilters}
                />
                <AssetTable 
                  assets={filteredAssets} 
                  onReview={handleReview}
                  selectedAssetIds={selectedAssetIds}
                  onSelectionChange={setSelectedAssetIds}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      {selectedAsset && (
        <ReviewModal
          asset={selectedAsset}
          open={isReviewModalOpen}
          onOpenChange={setIsReviewModalOpen}
          onApprove={handleApprove}
        />
      )}

      <UploadModal
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        onUploadSuccess={handleUploadSuccess}
      />

      <SequenceActionBar
        selectedCount={selectedAssetIds.length}
        onDraftSequence={handleDraftSequence}
        onBulkEdit={() => setIsBulkEditModalOpen(true)}
        onClearSelection={() => setSelectedAssetIds([])}
        isLoading={isDraftingSequence}
      />

      <BulkEditModal
        open={isBulkEditModalOpen}
        onOpenChange={setIsBulkEditModalOpen}
        selectedCount={selectedAssetIds.length}
        onSave={handleBulkEdit}
        onReanalyze={async () => {
          try {
            const response = await fetch("/api/assets/bulk-reanalyze", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                assetIds: selectedAssetIds,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.error || "Failed to re-analyze assets")
            }

            const data = await response.json()
            // Show success message
            alert(data.message || `Re-analysis queued for ${data.queuedCount || selectedAssetIds.length} asset(s)`)
            
            // Refresh assets to show updated status
            await fetchAssets()
            // Clear selection
            setSelectedAssetIds([])
          } catch (error) {
            console.error("Error bulk re-analyzing assets:", error)
            throw error
          }
        }}
      />

      <SequenceModal
        open={isSequenceModalOpen}
        onOpenChange={setIsSequenceModalOpen}
        sequence={sequenceData}
        onReorder={handleSequenceReorder}
        onRegenerate={handleRegenerateSequence}
      />

      <CriticalGapsModal
        open={isCriticalGapsModalOpen}
        onOpenChange={setIsCriticalGapsModalOpen}
        gaps={kpis.criticalGapsList || []}
        totalAssets={kpis.totalAssets}
      />
    </div>
  );
}
