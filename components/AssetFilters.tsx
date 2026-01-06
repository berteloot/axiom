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

export interface AssetFiltersState {
  search: string;
  funnelStages: FunnelStage[];
  icpTargets: string[];
  statuses: AssetStatus[];
  painClusters: string[];
  productLines: string[]; // Product/Service line IDs
  assetTypes: string[]; // Asset types (e.g., "Case Study", "Whitepaper")
  color: string; // Hex color code for filtering (e.g., "#FF5733")
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
    const productLines = new Map<string, string>(); // id -> name

    assets.forEach((asset) => {
      asset.icpTargets.forEach((icp) => icpTargets.add(icp));
      asset.painClusters.forEach((cluster) => painClusters.add(cluster));
      if (asset.productLines && asset.productLines.length > 0) {
        asset.productLines.forEach((pl) => {
          productLines.set(pl.id, pl.name);
        });
      }
    });

    return {
      icpTargets: Array.from(icpTargets).sort(),
      painClusters: Array.from(painClusters).sort(),
      productLines: Array.from(productLines.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [assets]);

  const updateFilters = (updates: Partial<AssetFiltersState>) => {
    onFiltersChange({ ...filters, ...updates });
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
      color: "",
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
    (filters.search ? 1 : 0) +
    (filters.color ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="space-y-4">
      {/* Search and Sort Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets by title..."
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
        </div>
      )}
    </div>
  );
}

// Helper function to filter and sort assets
export function applyAssetFilters(assets: Asset[], filters: AssetFiltersState): Asset[] {
  let filtered = [...assets];

  // Text search
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter((asset) =>
      asset.title.toLowerCase().includes(searchLower)
    );
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
      asset.icpTargets.some((icp) => filters.icpTargets.includes(icp))
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
      asset.painClusters.some((cluster) => filters.painClusters.includes(cluster))
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

  // Color filter (exact match)
  if (filters.color) {
    const filterColor = filters.color.toUpperCase();
    filtered = filtered.filter((asset) => {
      if (!asset.dominantColor) return false;
      return asset.dominantColor.toUpperCase() === filterColor;
    });
  }

  // Sorting
  filtered.sort((a, b) => {
    let aValue: any;
    let bValue: any;

    switch (filters.sortBy) {
      case "title":
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
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
  });

  return filtered;
}
