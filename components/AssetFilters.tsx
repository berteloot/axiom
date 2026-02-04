"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectCombobox } from "@/components/ui/combobox";
import { Asset, FunnelStage, AssetStatus } from "@/lib/types";
import { ASSET_TYPE_VALUES } from "@/lib/constants/asset-types";
import {
  Search,
  X,
  Filter,
  SortAsc,
  SortDesc,
  ChevronDown,
  ChevronUp,
  CheckSquare,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type SortField = 
  | "title"
  | "createdAt"
  | "updatedAt"
  | "customCreatedAt"
  | "lastReviewedAt"
  | "funnelStage"
  | "status"
  | "contentQualityScore";

export type SortDirection = "asc" | "desc";

export type InUseFilter = "all" | "in_use" | "available";

export interface AssetFiltersState {
  search: string;
  funnelStages: FunnelStage[];
  icpTargets: string[];
  statuses: AssetStatus[];
  painClusters: string[];
  productLines: string[]; // Product/Service line IDs
  assetTypes: string[]; // Asset types (e.g., "Case Study", "Whitepaper")
  industries: string[]; // Applicable industries (e.g., "Hospital & Health Care", "Financial Services")
  color: string; // Hex color code for filtering (e.g., "#FF5733")
  inUse: InUseFilter; // Filter by in use status
  uploadedBy: string[]; // User IDs who uploaded assets
  dateRange: { start: string | null; end: string | null }; // Date range for upload date
  sortBy: SortField;
  sortDirection: SortDirection;
}

interface AssetFiltersProps {
  assets: Asset[];
  filters: AssetFiltersState;
  onFiltersChange: (filters: AssetFiltersState) => void;
}

const FUNNEL_STAGES: FunnelStage[] = [
  "TOFU_AWARENESS",
  "MOFU_CONSIDERATION",
  "BOFU_DECISION",
  "RETENTION",
];

const ASSET_STATUSES: AssetStatus[] = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "APPROVED",
  "ERROR",
];

const STAGE_DISPLAY: Record<FunnelStage, string> = {
  TOFU_AWARENESS: "TOFU - Awareness",
  MOFU_CONSIDERATION: "MOFU - Consideration",
  BOFU_DECISION: "BOFU - Decision",
  RETENTION: "Retention",
};

const STATUS_DISPLAY: Record<AssetStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PROCESSED: "Processed",
  APPROVED: "Approved",
  ERROR: "Error",
};

const SORT_FIELD_DISPLAY: Record<SortField, string> = {
  title: "Title",
  createdAt: "Created Date",
  updatedAt: "Last Updated",
  customCreatedAt: "Custom Created Date",
  lastReviewedAt: "Last Reviewed",
  funnelStage: "Funnel Stage",
  status: "Status",
  contentQualityScore: "Quality Score",
};

export function AssetFilters({ assets, filters, onFiltersChange }: AssetFiltersProps) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Extract unique values from assets for filter options
  const filterOptions = useMemo(() => {
    const icpTargets = new Set<string>();
    const painClusters = new Set<string>();
    const industries = new Set<string>();
    const productLines = new Map<string, string>(); // id -> name
    const users = new Map<string, string>(); // id -> name

    assets.forEach((asset) => {
      if (asset.icpTargets && asset.icpTargets.length > 0) {
        asset.icpTargets.forEach((icp) => icpTargets.add(icp));
      }
      if (asset.painClusters && asset.painClusters.length > 0) {
        asset.painClusters.forEach((cluster) => painClusters.add(cluster));
      }
      if (asset.applicableIndustries && asset.applicableIndustries.length > 0) {
        asset.applicableIndustries.forEach((industry) => industries.add(industry));
      }
      if (asset.productLines && asset.productLines.length > 0) {
        asset.productLines.forEach((pl) => {
          productLines.set(pl.id, pl.name);
        });
      }
      if (asset.uploadedBy) {
        users.set(asset.uploadedBy.id, asset.uploadedBy.name || "Unknown");
      }
    });

    return {
      icpTargets: Array.from(icpTargets).sort(),
      painClusters: Array.from(painClusters).sort(),
      industries: Array.from(industries).sort(),
      productLines: Array.from(productLines.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      users: Array.from(users.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [assets]);

  const updateFilters = (updates: Partial<AssetFiltersState>) => {
    // Ensure search is always a string to prevent crashes
    const safeUpdates = { ...updates };
    if ("search" in safeUpdates) {
      safeUpdates.search = String(safeUpdates.search || "").slice(0, 1000); // Limit length to prevent issues
    }
    onFiltersChange({ ...filters, ...safeUpdates });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      funnelStages: [],
      icpTargets: [],
      statuses: [],
      painClusters: [],
      productLines: [],
      assetTypes: [],
      industries: [],
      color: "",
      inUse: "all",
      uploadedBy: [],
      dateRange: { start: null, end: null },
      sortBy: "createdAt",
      sortDirection: "desc",
    });
  };

  const activeFilterCount =
    filters.funnelStages.length +
    filters.icpTargets.length +
    filters.statuses.length +
    filters.painClusters.length +
    filters.productLines.length +
    filters.assetTypes.length +
    (filters.industries?.length || 0) +
    (filters.search ? 1 : 0) +
    (filters.color ? 1 : 0) +
    (filters.inUse !== "all" ? 1 : 0) +
    filters.uploadedBy.length +
    (filters.dateRange.start || filters.dateRange.end ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="space-y-4">
      {/* Search and Sort Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets by title, content, or uploader..."
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Sort Dropdown */}
        <div className="flex gap-2">
          <Select
            value={filters.sortBy}
            onValueChange={(value: SortField) => updateFilters({ sortBy: value })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Created Date</SelectItem>
              <SelectItem value="updatedAt">Last Updated</SelectItem>
              <SelectItem value="customCreatedAt">Custom Created Date</SelectItem>
              <SelectItem value="lastReviewedAt">Last Reviewed</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="funnelStage">Funnel Stage</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="contentQualityScore">Quality Score</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              updateFilters({
                sortDirection: filters.sortDirection === "asc" ? "desc" : "asc",
              })
            }
            title={`Sort ${filters.sortDirection === "asc" ? "Descending" : "Ascending"}`}
          >
            {filters.sortDirection === "asc" ? (
              <SortAsc className="h-4 w-4" />
            ) : (
              <SortDesc className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Filters Section */}
      <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
              {isFiltersOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
              <X className="h-4 w-4" />
              Clear all
            </Button>
          )}
        </div>

        <CollapsibleContent className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Funnel Stage Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Funnel Stage</label>
              <MultiSelectCombobox
                options={FUNNEL_STAGES.map((stage) => STAGE_DISPLAY[stage])}
                value={filters.funnelStages.map((stage) => STAGE_DISPLAY[stage])}
                onChange={(selected) => {
                  const selectedStages = selected
                    .map((display) =>
                      FUNNEL_STAGES.find(
                        (stage) => STAGE_DISPLAY[stage] === display
                      )
                    )
                    .filter((stage): stage is FunnelStage => stage !== undefined);
                  updateFilters({ funnelStages: selectedStages });
                }}
                placeholder="All stages"
                searchPlaceholder="Search stages..."
                emptyText="No stages found"
              />
            </div>

            {/* ICP Targets Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">ICP Targets</label>
              <MultiSelectCombobox
                options={filterOptions.icpTargets}
                value={filters.icpTargets}
                onChange={(selected) => updateFilters({ icpTargets: selected })}
                placeholder="All ICPs"
                searchPlaceholder="Search ICPs..."
                emptyText="No ICPs found"
              />
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <MultiSelectCombobox
                options={ASSET_STATUSES.map((status) => STATUS_DISPLAY[status])}
                value={filters.statuses.map((status) => STATUS_DISPLAY[status])}
                onChange={(selected) => {
                  const selectedStatuses = selected
                    .map((display) =>
                      ASSET_STATUSES.find(
                        (status) => STATUS_DISPLAY[status] === display
                      )
                    )
                    .filter((status): status is AssetStatus => status !== undefined);
                  updateFilters({ statuses: selectedStatuses });
                }}
                placeholder="All statuses"
                searchPlaceholder="Search statuses..."
                emptyText="No statuses found"
              />
            </div>

            {/* Pain Clusters Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Pain Clusters</label>
              <MultiSelectCombobox
                options={filterOptions.painClusters}
                value={filters.painClusters}
                onChange={(selected) => updateFilters({ painClusters: selected })}
                placeholder="All clusters"
                searchPlaceholder="Search clusters..."
                emptyText="No clusters found"
              />
            </div>

            {/* Product Lines Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Product/Service Lines</label>
              <MultiSelectCombobox
                options={filterOptions.productLines.map((pl) => pl.name)}
                value={filters.productLines.map((id) => {
                  const pl = filterOptions.productLines.find((p) => p.id === id);
                  return pl?.name || id;
                })}
                onChange={(selected) => {
                  const selectedIds = selected
                    .map((name) => filterOptions.productLines.find((pl) => pl.name === name)?.id)
                    .filter((id): id is string => id !== undefined);
                  updateFilters({ productLines: selectedIds });
                }}
                placeholder="All product lines"
                searchPlaceholder="Search product lines..."
                emptyText="No product lines found"
              />
            </div>

            {/* Asset Type Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Asset Type</label>
              <MultiSelectCombobox
                options={ASSET_TYPE_VALUES}
                value={filters.assetTypes}
                onChange={(selected) => updateFilters({ assetTypes: selected })}
                placeholder="All types"
                searchPlaceholder="Search asset types..."
                emptyText="No types found"
              />
            </div>

            {/* Industry Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Industry</label>
              <MultiSelectCombobox
                options={filterOptions.industries}
                value={filters.industries || []}
                onChange={(selected) => updateFilters({ industries: selected })}
                placeholder="All industries"
                searchPlaceholder="Search industries..."
                emptyText="No industries found"
              />
            </div>

            {/* In Use Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5" />
                Usage Status
              </label>
              <Select
                value={filters.inUse}
                onValueChange={(value: InUseFilter) => updateFilters({ inUse: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All assets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assets</SelectItem>
                  <SelectItem value="in_use">In use</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Color Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Dominant Color</label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={filters.color || "#000000"}
                  onChange={(e) => updateFilters({ color: e.target.value.toUpperCase() })}
                  className="w-16 h-10 cursor-pointer"
                  title="Select color to filter by"
                />
                <Input
                  type="text"
                  placeholder="#FF5733"
                  value={filters.color || ""}
                  onChange={(e) => {
                    const value = e.target.value.trim().toUpperCase();
                    // Only update if it's a valid hex color or empty
                    if (value === "" || /^#[0-9A-F]{6}$/i.test(value)) {
                      updateFilters({ color: value });
                    }
                  }}
                  className="flex-1"
                  maxLength={7}
                />
                {filters.color && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateFilters({ color: "" })}
                    className="h-10 w-10"
                    aria-label="Clear color filter"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {filters.search}
              <button
                onClick={() => updateFilters({ search: "" })}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label="Remove search filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.funnelStages.map((stage) => (
            <Badge key={stage} variant="secondary" className="gap-1">
              {STAGE_DISPLAY[stage]}
              <button
                onClick={() =>
                  updateFilters({
                    funnelStages: filters.funnelStages.filter((s) => s !== stage),
                  })
                }
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label={`Remove ${STAGE_DISPLAY[stage]} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.icpTargets.map((icp) => (
            <Badge key={icp} variant="secondary" className="gap-1">
              ICP: {icp}
              <button
                onClick={() =>
                  updateFilters({
                    icpTargets: filters.icpTargets.filter((t) => t !== icp),
                  })
                }
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label={`Remove ${icp} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.statuses.map((status) => (
            <Badge key={status} variant="secondary" className="gap-1">
              {STATUS_DISPLAY[status]}
              <button
                onClick={() =>
                  updateFilters({
                    statuses: filters.statuses.filter((s) => s !== status),
                  })
                }
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label={`Remove ${STATUS_DISPLAY[status]} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.painClusters.map((cluster) => (
            <Badge key={cluster} variant="secondary" className="gap-1">
              {cluster}
              <button
                onClick={() =>
                  updateFilters({
                    painClusters: filters.painClusters.filter((c) => c !== cluster),
                  })
                }
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label={`Remove ${cluster} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.productLines.map((productLineId) => {
            const productLine = filterOptions.productLines.find((pl) => pl.id === productLineId);
            const displayName = productLine?.name || productLineId;
            return (
              <Badge key={productLineId} variant="secondary" className="gap-1">
                Product: {displayName}
                <button
                  onClick={() =>
                    updateFilters({
                      productLines: filters.productLines.filter((id) => id !== productLineId),
                    })
                  }
                  className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                  aria-label={`Remove ${displayName} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {filters.assetTypes.map((assetType) => (
            <Badge key={assetType} variant="secondary" className="gap-1">
              Type: {assetType}
              <button
                onClick={() =>
                  updateFilters({
                    assetTypes: filters.assetTypes.filter((t) => t !== assetType),
                  })
                }
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label={`Remove ${assetType} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.industries?.map((industry) => (
            <Badge key={industry} variant="secondary" className="gap-1">
              Industry: {industry}
              <button
                onClick={() =>
                  updateFilters({
                    industries: filters.industries.filter((i) => i !== industry),
                  })
                }
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label={`Remove ${industry} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.color && (
            <Badge variant="secondary" className="gap-1">
              <div
                className="w-3 h-3 rounded-full border border-gray-400"
                style={{ backgroundColor: filters.color }}
              />
              Color: {filters.color}
              <button
                onClick={() => updateFilters({ color: "" })}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label="Remove color filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.inUse !== "all" && (
            <Badge variant="secondary" className="gap-1">
              <CheckSquare className="h-3 w-3" />
              {filters.inUse === "in_use" ? "In Use" : "Available"}
              <button
                onClick={() => updateFilters({ inUse: "all" })}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label="Remove usage status filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.uploadedBy.map((userId) => {
            const user = filterOptions.users.find((u) => u.id === userId);
            const displayName = user?.name || userId;
            return (
              <Badge key={userId} variant="secondary" className="gap-1">
                User: {displayName}
                <button
                  onClick={() =>
                    updateFilters({
                      uploadedBy: filters.uploadedBy.filter((id) => id !== userId),
                    })
                  }
                  className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                  aria-label={`Remove ${displayName} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {(filters.dateRange.start || filters.dateRange.end) && (
            <Badge variant="secondary" className="gap-1">
              Date: {filters.dateRange.start || "..."} to {filters.dateRange.end || "..."}
              <button
                onClick={() =>
                  updateFilters({ dateRange: { start: null, end: null } })
                }
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                aria-label="Remove date range filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to filter and sort assets
export function applyAssetFilters(assets: Asset[], filters: AssetFiltersState): Asset[] {
  // Filter out any invalid assets first (must have id)
  let filtered = assets.filter((asset) => asset && asset.id);
  
  // If no valid assets, return empty array
  if (filtered.length === 0) {
    return [];
  }

  // Text search (includes title, content, uploaded by name, custom name override, and upload date)
  if (filters.search) {
    try {
      // Normalize search term: trim and validate
      const searchTerm = String(filters.search || "").trim();
      if (!searchTerm || searchTerm.length === 0) {
        // Empty search, skip filtering
      } else {
        // Normalize to lowercase safely - handle any edge cases
        let searchLower: string;
        try {
          searchLower = searchTerm.toLowerCase();
        } catch (error) {
          // If toLowerCase fails, use original term (shouldn't happen, but be safe)
          console.warn("Error normalizing search term:", error);
          searchLower = searchTerm;
        }

        // Helper function to safely check if a string contains the search term
        const safeIncludes = (text: string | null | undefined): boolean => {
          if (!text || typeof text !== "string") return false;
          try {
            const normalized = text.toLowerCase();
            return normalized.includes(searchLower);
          } catch (error) {
            // If toLowerCase or includes fails, return false
            return false;
          }
        };

        filtered = filtered.filter((asset) => {
          // Skip invalid assets
          if (!asset || !asset.id) return false;
          
          try {
            // Safe string matching for all fields
            const titleMatch = safeIncludes(asset.title);
            const userMatch = safeIncludes(asset.uploadedBy?.name);
            const customNameMatch = safeIncludes((asset as any).uploadedByNameOverride);
            const contentMatch = safeIncludes(asset.extractedText);
            
            // Check if search matches date format or date string (with comprehensive error handling)
            let dateMatch = false;
            try {
              if (asset.createdAt) {
                const uploadDate = new Date(asset.createdAt);
                if (!isNaN(uploadDate.getTime())) {
                  try {
                    const dateStr1 = uploadDate.toLocaleDateString();
                    const dateStr2 = uploadDate.toISOString();
                    const dateStr3 = uploadDate.toLocaleDateString("en-US", { 
                      year: "numeric", 
                      month: "long", 
                      day: "numeric" 
                    });
                    
                    dateMatch = 
                      safeIncludes(dateStr1) ||
                      safeIncludes(dateStr2) ||
                      safeIncludes(dateStr3);
                  } catch (dateFormatError) {
                    // Silently ignore date formatting errors
                  }
                }
              }
            } catch (dateError) {
              // Silently ignore date parsing errors
            }
            
            return titleMatch || userMatch || customNameMatch || contentMatch || dateMatch;
          } catch (error) {
            // If any error occurs during filtering, exclude this asset to prevent crashes
            console.warn("Error filtering asset:", asset.id, error);
            return false;
          }
        });
      }
    } catch (error) {
      // If search filtering completely fails, log but don't crash - return all assets
      console.error("Critical error in search filter:", error);
      // Return filtered results without search applied
    }
  }

  // Funnel Stage filter
  if (filters.funnelStages.length > 0) {
    filtered = filtered.filter((asset) =>
      filters.funnelStages.includes(asset.funnelStage)
    );
  }

  // ICP Targets filter
  if (filters.icpTargets.length > 0) {
    filtered = filtered.filter((asset) =>
      asset.icpTargets && asset.icpTargets.length > 0 && asset.icpTargets.some((icp) => filters.icpTargets.includes(icp))
    );
  }

  // Status filter
  if (filters.statuses.length > 0) {
    filtered = filtered.filter((asset) =>
      filters.statuses.includes(asset.status)
    );
  }

  // Pain Clusters filter
  if (filters.painClusters.length > 0) {
    filtered = filtered.filter((asset) =>
      asset.painClusters && asset.painClusters.length > 0 && asset.painClusters.some((cluster) => filters.painClusters.includes(cluster))
    );
  }

  // Product Lines filter
  if (filters.productLines.length > 0) {
    filtered = filtered.filter((asset) =>
      asset.productLines && asset.productLines.some((pl) => filters.productLines.includes(pl.id))
    );
  }

  // Asset Type filter
  if (filters.assetTypes.length > 0) {
    filtered = filtered.filter((asset) =>
      asset.assetType && filters.assetTypes.includes(asset.assetType)
    );
  }

  // Industry filter
  if (filters.industries && filters.industries.length > 0) {
    filtered = filtered.filter((asset) =>
      asset.applicableIndustries && asset.applicableIndustries.length > 0 && 
      asset.applicableIndustries.some((industry) => filters.industries.includes(industry))
    );
  }

  // Color filter (exact match)
  if (filters.color) {
    const filterColor = filters.color.toUpperCase();
    filtered = filtered.filter((asset) => {
      if (!asset.dominantColor) return false;
      return asset.dominantColor.toUpperCase() === filterColor;
    });
  }

  // In Use filter
  if (filters.inUse === "in_use") {
    filtered = filtered.filter((asset) => asset.inUse === true);
  } else if (filters.inUse === "available") {
    filtered = filtered.filter((asset) => asset.inUse !== true);
  }

  // Uploaded By filter
  if (filters.uploadedBy.length > 0) {
    filtered = filtered.filter((asset) =>
      asset.uploadedBy && filters.uploadedBy.includes(asset.uploadedBy.id)
    );
  }

  // Date Range filter
  if (filters.dateRange.start || filters.dateRange.end) {
    filtered = filtered.filter((asset) => {
      const uploadDate = new Date(asset.createdAt);
      if (filters.dateRange.start) {
        const startDate = new Date(filters.dateRange.start);
        startDate.setHours(0, 0, 0, 0);
        if (uploadDate < startDate) return false;
      }
      if (filters.dateRange.end) {
        const endDate = new Date(filters.dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        if (uploadDate > endDate) return false;
      }
      return true;
    });
  }

  // Sorting (with error handling)
  try {
    filtered.sort((a, b) => {
      // Safety check: skip invalid assets
      if (!a || !a.id || !b || !b.id) return 0;
      
      let aValue: any;
      let bValue: any;

      try {
        switch (filters.sortBy) {
      case "title":
        aValue = (a.title && typeof a.title === "string") ? a.title.toLowerCase() : "";
        bValue = (b.title && typeof b.title === "string") ? b.title.toLowerCase() : "";
        break;
      case "createdAt":
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
        break;
      case "updatedAt":
        aValue = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        bValue = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        break;
      case "customCreatedAt":
        aValue = a.customCreatedAt
          ? new Date(a.customCreatedAt).getTime()
          : 0;
        bValue = b.customCreatedAt
          ? new Date(b.customCreatedAt).getTime()
          : 0;
        break;
      case "lastReviewedAt":
        aValue = a.lastReviewedAt
          ? new Date(a.lastReviewedAt).getTime()
          : 0;
        bValue = b.lastReviewedAt
          ? new Date(b.lastReviewedAt).getTime()
          : 0;
        break;
      case "funnelStage":
        aValue = a.funnelStage;
        bValue = b.funnelStage;
        break;
      case "status":
        aValue = a.status;
        bValue = b.status;
        break;
      case "contentQualityScore":
        aValue = a.contentQualityScore ?? 0;
        bValue = b.contentQualityScore ?? 0;
        break;
        default:
          return 0;
        }

        if (aValue < bValue) {
          return filters.sortDirection === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return filters.sortDirection === "asc" ? 1 : -1;
        }
        return 0;
      } catch (error) {
        // If sorting fails for these assets, maintain original order
        console.warn("Error sorting assets:", error);
        return 0;
      }
    });
  } catch (error) {
    // If sorting completely fails, return unsorted but still filtered results
    console.warn("Error during asset sorting:", error);
  }

  // Final safety check: ensure all returned assets are valid (have id)
  return filtered.filter((asset) => asset && asset.id);
}
