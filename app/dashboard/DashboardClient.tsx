"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AssetTable } from "@/components/AssetTable";
import { ReviewModal } from "@/components/ReviewModal";
import { AssetMatrix } from "@/components/dashboard/AssetMatrix";
import { UploadModal } from "@/components/UploadModal";
import { SequenceActionBar } from "@/components/SequenceActionBar";
import { SequenceModal } from "@/components/SequenceModal";
import { BulkEditModal } from "@/components/BulkEditModal";
import { AssetFilters, applyAssetFilters, AssetFiltersState, SortField, SortDirection, InUseFilter } from "@/components/AssetFilters";
import { Asset, FunnelStage, AssetStatus } from "@/lib/types";
import { BrandContext } from "@/lib/report-analysis";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  AlertTriangle,
  Upload,
  FileText,
  ExternalLink,
  Users,
  Sparkles,
  ChevronRight
} from "lucide-react";
import { CriticalGapsModal, CriticalGap } from "@/components/dashboard/CriticalGapsModal";
import { SaveSearchButton } from "@/components/smart-collections";
import DownloadReportButton from "@/components/reports/DownloadReportButton";
import { useAccount } from "@/lib/account-context";
import { PPCCampaignBuilder } from "@/components/ppc/PPCCampaignBuilder";
import { BulkBlogImportModal } from "@/components/BulkBlogImportModal";
import { SingleUrlImportModal } from "@/components/SingleUrlImportModal";

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

  const inUse = searchParams.get("inUse");
  if (inUse && ["all", "in_use", "available"].includes(inUse)) {
    filters.inUse = inUse as InUseFilter;
  }

  const uploadedBy = searchParams.get("uploadedBy");
  if (uploadedBy) {
    filters.uploadedBy = uploadedBy.split(",");
  }

  const dateStart = searchParams.get("dateStart");
  const dateEnd = searchParams.get("dateEnd");
  if (dateStart || dateEnd) {
    filters.dateRange = { start: dateStart || null, end: dateEnd || null };
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

// Helper components for enhanced metrics cards
function TrendBadge({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  const diff = current - previous;
  const percentage = previous > 0 ? Math.round((diff / previous) * 100) : 0;
  
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
        <TrendingUp size={12} />
        +{percentage}%{suffix}
      </span>
    );
  } else if (diff < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
        <TrendingDown size={12} />
        {percentage}%{suffix}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
      <Minus size={12} />
      No change
    </span>
  );
}

function CircularProgress({ value, target, size = 64, strokeWidth = 6 }: { value: number; target: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(value / target, 1);
  const offset = circumference - progress * circumference;
  
  const getColor = () => {
    if (value >= target) return { stroke: '#10b981', bg: '#d1fae5' };
    if (value >= target * 0.6) return { stroke: '#f59e0b', bg: '#fef3c7' };
    return { stroke: '#ef4444', bg: '#fee2e2' };
  };
  
  const colors = getColor();
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-gray-900">{value}%</span>
      </div>
    </div>
  );
}

function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1); // Avoid division by zero
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((value, i) => (
        <div
          key={i}
          className="w-1.5 bg-orange-400 rounded-t transition-all hover:bg-orange-500"
          style={{ height: `${(value / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default function DashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentAccount } = useAccount();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const pendingInUseUpdates = useRef<Map<string, boolean>>(new Map());
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isSequenceModalOpen, setIsSequenceModalOpen] = useState(false);
  const [sequenceData, setSequenceData] = useState<any>(null);
  const [isDraftingSequence, setIsDraftingSequence] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isCriticalGapsModalOpen, setIsCriticalGapsModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isSingleImportOpen, setIsSingleImportOpen] = useState(false);
  // Persist activeTab to sessionStorage so it survives modal actions and refreshes
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('dashboard-active-tab') || "strategy";
    }
    return "strategy";
  });
  const [brandContext, setBrandContext] = useState<BrandContext | null>(null);
  
  // Save activeTab to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('dashboard-active-tab', activeTab);
  }, [activeTab]);
  
  // Check if we should switch to library view (e.g., after saving content)
  useEffect(() => {
    const switchToLibrary = sessionStorage.getItem('switch-to-library-view');
    if (switchToLibrary === 'true') {
      setActiveTab("library");
      sessionStorage.removeItem('switch-to-library-view');
    }
  }, []);
  
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
      inUse: urlFilters.inUse ?? "all",
      uploadedBy: urlFilters.uploadedBy ?? [],
      dateRange: urlFilters.dateRange ?? { start: null, end: null },
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
        inUse: urlFilters.inUse ?? "all",
        uploadedBy: urlFilters.uploadedBy ?? [],
        dateRange: urlFilters.dateRange ?? { start: null, end: null },
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
      
      // Merge with current state to preserve pending optimistic updates
      setAssets((current) => {
        const currentMap = new Map(current.map(a => [a.id, a]));
        
        // For each fetched asset, preserve pending updates
        const merged = data.assets.map((fetched: Asset) => {
          const currentAsset = currentMap.get(fetched.id);
          const pendingValue = pendingInUseUpdates.current.get(fetched.id);
          
          // If there's a pending update, use it
          if (pendingValue !== undefined) {
            return { ...fetched, inUse: pendingValue };
          }
          
          // If current asset has an inUse value that differs from fetched, 
          // and we don't have a pending update, use fetched (server is source of truth)
          if (currentAsset && currentAsset.inUse !== fetched.inUse) {
            // Use fetched value unless we have a pending update
            return fetched;
          }
          
          return fetched;
        });
        
        return merged;
      });
      
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

  const handleInUseChange = async (assetId: string, inUse: boolean) => {
    // Track pending update
    pendingInUseUpdates.current.set(assetId, inUse);
    
    // Optimistic UI update (so checkbox ticks immediately)
    setAssets((current) => {
      return current.map((a) => 
        a.id === assetId ? { ...a, inUse } : a
      );
    });

    // Best-effort cache update (keeps UI consistent on reload)
    try {
      const cachedData = sessionStorage.getItem('dashboard-assets');
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        const updated = parsed.map((a: Asset) => (a.id === assetId ? { ...a, inUse } : a));
        sessionStorage.setItem('dashboard-assets', JSON.stringify(updated));
      }
    } catch {
      // ignore cache errors
    }

    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inUse }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // If it's a migration error, keep the optimistic update and show a warning
        if (errorData.code === "MIGRATION_REQUIRED" || errorData.code === "SCHEMA_ERROR") {
          console.warn("Database migration required for 'inUse' feature:", errorData.details);
          // Keep pending update in ref
          return;
        }
        
        // Remove pending update on error and revert
        pendingInUseUpdates.current.delete(assetId);
        throw new Error(errorData.error || "Failed to update asset");
      }

      // On success, confirm the update and remove from pending
      const data = await response.json();
      pendingInUseUpdates.current.delete(assetId);
      
      if (data.asset) {
        // Update state with server response
        setAssets((current) => {
          return current.map((a) => 
            a.id === assetId ? { ...a, inUse: data.asset.inUse } : a
          );
        });

        // Update cache with server response
        try {
          const cachedData = sessionStorage.getItem('dashboard-assets');
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            const updated = parsed.map((a: Asset) => 
              a.id === assetId ? { ...a, inUse: data.asset.inUse } : a
            );
            sessionStorage.setItem('dashboard-assets', JSON.stringify(updated));
          }
        } catch {
          // ignore cache errors
        }
      }
    } catch (error) {
      console.error("Error updating asset in use status:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Only revert if it's not a migration/schema error
      if (!errorMessage.includes("migration") && !errorMessage.includes("column")) {
        // Revert optimistic update on real errors
        setAssets((current) => {
          const asset = current.find(a => a.id === assetId);
          if (asset) {
            // Revert to previous inUse value (or false if unknown)
            return current.map((a) => 
              a.id === assetId ? { ...a, inUse: asset.inUse ?? false } : a
            );
          }
          return current;
        });
      }
      // For migration errors, keep the optimistic update so UI remains functional
    }
  };

  const handleBulkEdit = async (updates: {
    productLineIds?: string[]
    icpTargets?: string[]
    icpConvert?: { from: string; to: string }
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
    if (selectedAssetIds.length < 2 || selectedAssetIds.length > 5) {
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
    if (selectedAssetIds.length < 2 || selectedAssetIds.length > 5) {
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

  // Apply filters to assets (with error handling to prevent crashes)
  const filteredAssets = useMemo(() => {
    try {
      // Ensure assets is an array
      if (!Array.isArray(assets)) {
        console.warn("Assets is not an array, returning empty array");
        return [];
      }
      // Ensure filters is valid
      if (!filters || typeof filters !== "object") {
        console.warn("Filters is invalid, returning all assets");
        return assets;
      }
      return applyAssetFilters(assets, filters);
    } catch (error) {
      console.error("Error applying asset filters:", error);
      // Return all assets as fallback to prevent UI crash
      return Array.isArray(assets) ? assets : [];
    }
  }, [assets, filters]);

  // Calculate KPIs (use all assets, not filtered)
  const kpis = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Calculate total assets and trend (compare to 7 days ago)
    const totalAssets = assets.length;
    const previousTotalAssets = assets.filter(
      (asset) => new Date(asset.createdAt) < sevenDaysAgo
    ).length;
    
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
    
    // Calculate previous coverage score (7 days ago)
    const previousAssets = assets.filter(
      (asset) => new Date(asset.createdAt) < sevenDaysAgo
    );
    const previousIcpTargets = new Set<string>();
    previousAssets.forEach((asset) => {
      asset.icpTargets.forEach((icp) => previousIcpTargets.add(icp));
    });
    const previousTotalCells = previousIcpTargets.size * STAGES.length;
    let previousFilledCells = 0;
    previousIcpTargets.forEach((icp) => {
      STAGES.forEach((stage) => {
        const hasAssets = previousAssets.some(
          (asset) => asset.icpTargets.includes(icp) && asset.funnelStage === stage
        );
        if (hasAssets) previousFilledCells++;
      });
    });
    const previousCoverageScore = previousTotalCells > 0 
      ? Math.round((previousFilledCells / previousTotalCells) * 100)
      : coverageScore; // Fallback to current if no previous data
    
    // Find top performing ICP with breakdown by stage
    const icpCounts: Record<string, number> = {};
    const icpStageBreakdown: Record<string, Record<FunnelStage, number>> = {};
    assets.forEach((asset) => {
      asset.icpTargets.forEach((icp) => {
        icpCounts[icp] = (icpCounts[icp] || 0) + 1;
        if (!icpStageBreakdown[icp]) {
          icpStageBreakdown[icp] = {
            TOFU_AWARENESS: 0,
            MOFU_CONSIDERATION: 0,
            BOFU_DECISION: 0,
            RETENTION: 0,
          };
        }
        icpStageBreakdown[icp][asset.funnelStage]++;
      });
    });
    
    const topIcpEntry = Object.entries(icpCounts).sort((a, b) => b[1] - a[1])[0];
    const topIcp = topIcpEntry?.[0] || "N/A";
    const topIcpAssetCount = topIcpEntry?.[1] || 0;
    const topIcpBreakdown = topIcp !== "N/A" ? icpStageBreakdown[topIcp] : null;
    
    // Generate sparkline data for Total Assets (weekly progression)
    const weeklyData: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const count = assets.filter(
        (asset) => new Date(asset.createdAt) <= date
      ).length;
      weeklyData.push(count);
    }
    
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
    
    // Determine priority for critical gaps card
    const priority = totalCriticalGaps > 10 ? "high" : totalCriticalGaps > 5 ? "medium" : "low";
    
    // Get top 3 gaps for preview (from coverage gaps)
    const topGaps = coverageGaps
      .filter((gap) => gap.location)
      .slice(0, 3)
      .map((gap) => {
        const [icp, stage] = gap.location!.split(" - ");
        return { icp, stage: stage as FunnelStage };
      });

    return {
      totalAssets,
      previousTotalAssets,
      coverageScore,
      previousCoverageScore,
      topIcp,
      topIcpAssetCount,
      topIcpBreakdown,
      criticalGaps: totalCriticalGaps,
      criticalGapsList,
      priority,
      topGaps,
      weeklyData,
      coverageTarget: 70, // Default target for coverage score
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

        {/* Enhanced KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
          {/* Total Assets Card */}
          <Card className="relative bg-white rounded-xl border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileText size={18} className="text-blue-600" />
                </div>
                <CardTitle className="text-sm font-medium text-gray-500">Total Assets</CardTitle>
              </div>
              <MiniBarChart data={kpis.weeklyData || []} />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-gray-900">{kpis.totalAssets}</span>
                <TrendBadge current={kpis.totalAssets} previous={kpis.previousTotalAssets} />
              </div>
              <p className="text-xs text-gray-400 mt-1">In library</p>
            </CardContent>
          </Card>

          {/* Coverage Score Card */}
          <Card className="relative bg-white rounded-xl border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <Target size={18} className="text-amber-600" />
                </div>
                <CardTitle className="text-sm font-medium text-gray-500">Coverage Score</CardTitle>
              </div>
              <CircularProgress value={kpis.coverageScore} target={kpis.coverageTarget} />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-gray-900">{kpis.coverageScore}%</span>
                <TrendBadge current={kpis.coverageScore} previous={kpis.previousCoverageScore} suffix=" pts" />
              </div>
              <p className="text-xs text-gray-400 mt-1">Target: {kpis.coverageTarget}%</p>
              
              {/* Progress bar */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Progress to target</span>
                  <span>{Math.round((kpis.coverageScore / kpis.coverageTarget) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((kpis.coverageScore / kpis.coverageTarget) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Performing ICP Card */}
          <Card className="relative bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl hover:shadow-lg hover:border-emerald-300 transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2 flex-1">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Users size={18} className="text-emerald-600" />
                </div>
                <CardTitle className="text-sm font-medium text-emerald-700">Top Performing ICP</CardTitle>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Sparkles size={24} className="text-emerald-400" />
                <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                  Best coverage
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mt-3">
                <h3 className="text-xl font-bold text-gray-900 leading-tight">{kpis.topIcp}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-2xl font-bold text-emerald-600">{kpis.topIcpAssetCount}</span>
                  <span className="text-sm text-gray-500">assets mapped</span>
                </div>
              </div>
              
              {/* Funnel breakdown */}
              {kpis.topIcpBreakdown && (
                <div className="mt-4 pt-4 border-t border-emerald-200/50">
                  <div className="flex gap-2">
                    {[
                      { label: 'TOFU', value: kpis.topIcpBreakdown.TOFU_AWARENESS, color: 'bg-emerald-200' },
                      { label: 'MOFU', value: kpis.topIcpBreakdown.MOFU_CONSIDERATION, color: 'bg-emerald-300' },
                      { label: 'BOFU', value: kpis.topIcpBreakdown.BOFU_DECISION, color: 'bg-emerald-400' },
                    ].map((stage) => (
                      <div key={stage.label} className="flex-1 text-center">
                        <div className={`h-1.5 ${stage.color} rounded-full mb-1`} />
                        <span className="text-xs text-gray-500">{stage.label}</span>
                        <p className="text-sm font-semibold text-gray-700">{stage.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Critical Gaps Card */}
          <Card 
            className={`relative rounded-xl border hover:shadow-lg transition-all duration-200 cursor-pointer ${
              kpis.priority === 'high' 
                ? 'bg-red-50 border-red-200 hover:border-red-300' 
                : kpis.priority === 'medium'
                ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setIsCriticalGapsModalOpen(true)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${
                  kpis.priority === 'high' 
                    ? 'bg-red-100' 
                    : kpis.priority === 'medium'
                    ? 'bg-amber-100'
                    : 'bg-gray-100'
                }`}>
                  <AlertTriangle 
                    size={18} 
                    className={
                      kpis.priority === 'high' 
                        ? 'text-red-500' 
                        : kpis.priority === 'medium'
                        ? 'text-amber-500'
                        : 'text-gray-500'
                    } 
                  />
                </div>
                <CardTitle className="text-sm font-medium text-gray-500">Critical Gaps</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-gray-900">{kpis.criticalGaps}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  kpis.priority === 'high' 
                    ? 'bg-red-100 text-red-700' 
                    : kpis.priority === 'medium'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {kpis.priority === 'high' ? 'Needs attention' : kpis.priority === 'medium' ? 'Moderate' : 'On track'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Cells with 0 assets</p>
              
              {/* Top gaps preview */}
              {kpis.topGaps && kpis.topGaps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-red-200/50">
                  <p className="text-xs font-medium text-gray-500 mb-2">Priority gaps:</p>
                  <div className="space-y-1.5">
                    {kpis.topGaps.map((gap, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate">{gap.icp}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          gap.stage === 'BOFU_DECISION' ? 'bg-red-100 text-red-600' :
                          gap.stage === 'MOFU_CONSIDERATION' ? 'bg-amber-100 text-amber-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {STAGE_DISPLAY[gap.stage]}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button 
                    className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 mt-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCriticalGapsModalOpen(true);
                    }}
                  >
                    View all gaps <ChevronRight size={14} />
                  </button>
                </div>
              )}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSingleImportOpen(true)}
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="hidden sm:inline">Import URL</span>
                      <span className="sm:hidden">URL</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsBulkImportOpen(true)}
                      className="gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="hidden sm:inline">Bulk Import Blog</span>
                      <span className="sm:hidden">Import Blog</span>
                    </Button>
                    <SaveSearchButton filters={filters} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <AssetFilters
                  assets={assets}
                  filters={filters}
                  onFiltersChange={(newFilters) => {
                    setFilters(newFilters);
                  }}
                />

                <AssetTable
                  assets={filteredAssets}
                  onReview={handleReview}
                  selectedAssetIds={selectedAssetIds}
                  onSelectionChange={setSelectedAssetIds}
                  onInUseChange={handleInUseChange}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ppc" className="space-y-4">
            <Card className="bg-white shadow-sm">
              <CardHeader>
                <CardTitle>PPC Campaign Builder</CardTitle>
                <CardDescription>
                  Discover keywords, map to landing pages, and organize ad groups for pay-per-click campaigns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PPCCampaignBuilder
                  assets={assets}
                  selectedAssetIds={selectedAssetIds}
                  onAssetSelectionChange={setSelectedAssetIds}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      {selectedAsset ? (
        <ReviewModal
          asset={selectedAsset}
          open={isReviewModalOpen}
          onOpenChange={setIsReviewModalOpen}
          onApprove={handleApprove}
        />
      ) : null}

      <UploadModal
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        onUploadSuccess={handleUploadSuccess}
      />

      <SequenceActionBar
        selectedCount={selectedAssetIds.length}
        onDraftSequence={handleDraftSequence}
        onBulkEdit={() => setIsBulkEditModalOpen(true)}
        onPPCCampaign={() => setActiveTab("ppc")}
        onClearSelection={() => setSelectedAssetIds([])}
        isLoading={isDraftingSequence}
      />

      <BulkEditModal
        open={isBulkEditModalOpen}
        onOpenChange={setIsBulkEditModalOpen}
        selectedCount={selectedAssetIds.length}
        selectedAssetIds={selectedAssetIds}
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
        onDelete={async () => {
          try {
            const response = await fetch("/api/assets/bulk-delete", {
              method: "DELETE",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                assetIds: selectedAssetIds,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.error || "Failed to delete assets")
            }

            const data = await response.json()
            // Show success message
            alert(data.message || `Successfully deleted ${data.results?.deleted || selectedAssetIds.length} asset(s)`)
            
            // Refresh assets to show updated list
            await fetchAssets()
            // Clear selection
            setSelectedAssetIds([])
          } catch (error) {
            console.error("Error bulk deleting assets:", error)
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

      <BulkBlogImportModal
        open={isBulkImportOpen}
        onOpenChange={setIsBulkImportOpen}
        onSuccess={() => {
          // Refresh assets after successful import
          fetchAssets(true);
        }}
      />

      <SingleUrlImportModal
        open={isSingleImportOpen}
        onOpenChange={setIsSingleImportOpen}
        onSuccess={() => {
          // Refresh assets after successful import
          fetchAssets(true);
        }}
      />
    </div>
  );
}
