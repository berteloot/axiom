"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePicker } from "@/components/ui/date-picker";
import { MultiSelectCombobox } from "@/components/ui/combobox";
import { EditableBadge } from "@/components/ui/editable-badge";
import { ALL_JOB_TITLES } from "@/lib/job-titles";
import { extractCustomTargets, isCustomTarget } from "@/lib/icp-targets";
import { Info, X, Package } from "lucide-react";
import { Asset, FunnelStage, ProductLine } from "@/lib/types";
import { AssetTypeSelector } from "@/components/assets/AssetTypeSelector";

interface ReviewFormProps {
  asset: Asset;
  formData: {
    title: string;
    assetType: string | null;
    funnelStage: FunnelStage;
    icpTargets: string[];
    painClusters: string;
    outreachTip: string;
    productLineIds: string[];
  };
  customCreatedAt: Date | null;
  lastReviewedAt: Date | null;
  expiryDate: Date | null;
  painClusterError: string;
  onFormDataChange: (data: Partial<ReviewFormProps["formData"]>) => void;
  onCustomCreatedAtChange: (date: Date | null) => void;
  onLastReviewedAtChange: (date: Date | null) => void;
  onExpiryDateChange: (date: Date | null) => void;
}

export function ReviewForm({
  asset,
  formData,
  customCreatedAt,
  lastReviewedAt,
  expiryDate,
  painClusterError,
  onFormDataChange,
  onCustomCreatedAtChange,
  onLastReviewedAtChange,
  onExpiryDateChange,
}: ReviewFormProps) {
  const [icpOptions, setIcpOptions] = useState<string[]>(ALL_JOB_TITLES);
  const [isLoadingIcp, setIsLoadingIcp] = useState(true);
  const [customTargets, setCustomTargets] = useState<string[]>([]);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [isLoadingProductLines, setIsLoadingProductLines] = useState(true);

  // Fetch unified ICP targets on mount (component remounts when modal opens)
  useEffect(() => {
    const fetchIcpTargets = async () => {
      setIsLoadingIcp(true);
      try {
        console.log("[ReviewForm] Fetching ICP targets for asset:", asset.id);
        const response = await fetch("/api/icp-targets");
        if (response.ok) {
          const data = await response.json();
          console.log("[ReviewForm] Received ICP targets:", {
            count: data.icpTargets?.length || 0,
            hasCX: data.icpTargets?.some((t: string) => t.toLowerCase() === "cx"),
            cxMatches: data.icpTargets?.filter((t: string) => t.toLowerCase().includes("cx")),
            customTargets: data.customTargets
          });
          setIcpOptions(data.icpTargets || ALL_JOB_TITLES);
          setCustomTargets(data.customTargets || []);
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("[ReviewForm] Failed to fetch ICP targets:", response.status, errorData);
        }
      } catch (error) {
        console.error("[ReviewForm] Error fetching ICP targets:", error);
      } finally {
        setIsLoadingIcp(false);
      }
    };
    fetchIcpTargets();
  }, []); // Only on mount - component remounts when modal opens due to key prop

  // Fetch product lines on mount
  useEffect(() => {
    const fetchProductLines = async () => {
      setIsLoadingProductLines(true);
      try {
        const response = await fetch("/api/product-lines");
        if (response.ok) {
          const data = await response.json();
          setProductLines(data.productLines || []);
        } else {
          console.error("[ReviewForm] Failed to fetch product lines:", response.status);
        }
      } catch (error) {
        console.error("[ReviewForm] Error fetching product lines:", error);
      } finally {
        setIsLoadingProductLines(false);
      }
    };
    fetchProductLines();
  }, []); // Only on mount - component remounts when modal opens due to key prop

  // Auto-save custom ICP targets when they're created
  const handleIcpTargetsChange = async (selected: string[]) => {
    onFormDataChange({ icpTargets: selected });
    
    // Extract custom targets (not in standard list)
    const customTargets = extractCustomTargets(selected, ALL_JOB_TITLES);
    
    // If there are custom targets, save them to the account
    if (customTargets.length > 0) {
      try {
        await fetch("/api/icp-targets/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets: customTargets }),
        });
        
        // Refresh the ICP options list to include the new custom targets
        const response = await fetch("/api/icp-targets");
        if (response.ok) {
          const data = await response.json();
          setIcpOptions(data.icpTargets || ALL_JOB_TITLES);
        }
      } catch (error) {
        console.error("Error saving custom ICP targets:", error);
      }
    }
  };

  const handlePainClustersChange = (value: string) => {
    const clusters = value
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    
    // Validation will be handled by parent component
    onFormDataChange({ painClusters: value });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => onFormDataChange({ title: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="assetType">Asset Type</Label>
        <AssetTypeSelector
          value={formData.assetType}
          onChange={(value) => onFormDataChange({ assetType: value || null })}
        />
        <p className="text-xs text-muted-foreground">
          The marketing asset type (e.g., "Case Study", "Whitepaper"). This is distinct from the technical file type.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="productLines" className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Product Lines
          </Label>
        </div>
        <MultiSelectCombobox
          options={productLines.map(pl => pl.name)}
          value={formData.productLineIds.map(id => {
            const pl = productLines.find(p => p.id === id);
            return pl?.name || id;
          })}
          onChange={(selected) => {
            const selectedIds = selected
              .map((name) => productLines.find(pl => pl.name === name)?.id)
              .filter((id): id is string => id !== undefined);
            onFormDataChange({ productLineIds: selectedIds });
          }}
          placeholder={isLoadingProductLines ? "Loading product lines..." : "Select product lines..."}
          searchPlaceholder="Search product lines..."
          emptyText="No product lines found"
          disabled={isLoadingProductLines}
        />
        {formData.productLineIds && formData.productLineIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {formData.productLineIds.map((id) => {
              const productLine = productLines.find(pl => pl.id === id);
              if (!productLine) return null;
              return (
                <Badge
                  key={id}
                  variant="outline"
                  className="text-xs flex items-center gap-1"
                >
                  {productLine.name}
                  <button
                    type="button"
                    onClick={() => {
                      const newIds = formData.productLineIds.filter((i) => i !== id);
                      onFormDataChange({ productLineIds: newIds });
                    }}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                    aria-label={`Remove ${productLine.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {formData.productLineIds.length} product line{formData.productLineIds.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="funnelStage">Funnel Stage</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">Funnel Stage Guidelines:</p>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  <li><strong>TOFU:</strong> Educational, high-level, no product pitch (e.g., &quot;State of the Industry&quot;)</li>
                  <li><strong>MOFU:</strong> Comparison guides, &quot;How-to&quot; with product mention</li>
                  <li><strong>BOFU:</strong> Case studies, ROI calculators, Pricing sheets</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select
          value={formData.funnelStage}
          onValueChange={(value) => onFormDataChange({ funnelStage: value as FunnelStage })}
        >
          <SelectTrigger id="funnelStage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TOFU_AWARENESS">
              Top of Funnel - Awareness
            </SelectItem>
            <SelectItem value="MOFU_CONSIDERATION">
              Middle of Funnel - Consideration
            </SelectItem>
            <SelectItem value="BOFU_DECISION">
              Bottom of Funnel - Decision
            </SelectItem>
            <SelectItem value="RETENTION">Retention</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          {formData.funnelStage === "TOFU_AWARENESS" && "Educational, high-level, no product pitch (e.g., 'State of the Industry')"}
          {formData.funnelStage === "MOFU_CONSIDERATION" && "Comparison guides, 'How-to' with product mention"}
          {formData.funnelStage === "BOFU_DECISION" && "Case studies, ROI calculators, Pricing sheets"}
          {formData.funnelStage === "RETENTION" && "Customer success, upsell, expansion content"}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="icpTargets">ICP Targets</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Select specific job titles from the standardized list. Choose roles most relevant to your product line and target market.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <MultiSelectCombobox
          options={icpOptions}
          value={formData.icpTargets}
          onChange={handleIcpTargetsChange}
          placeholder={isLoadingIcp ? "Loading job titles..." : "Select job titles..."}
          searchPlaceholder="Search job titles..."
          emptyText="No job titles found."
          creatable={true}
          createText="Create"
        />
        {formData.icpTargets && formData.icpTargets.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {formData.icpTargets.map((target, idx) => {
              const isCustom = isCustomTarget(target);
              
              if (isCustom) {
                return (
                  <EditableBadge
                    key={idx}
                    value={target}
                    isCustom={true}
                    onRemove={() => {
                      const newTargets = formData.icpTargets.filter((_, i) => i !== idx);
                      onFormDataChange({ icpTargets: newTargets });
                    }}
                    onSave={async (newValue) => {
                      try {
                        const response = await fetch("/api/icp-targets/update", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ oldTarget: target, newTarget: newValue }),
                        });
                        
                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || "Failed to update ICP target");
                        }
                        
                        // Update the form data
                        const updatedTargets = formData.icpTargets.map(
                          t => t === target ? newValue : t
                        );
                        onFormDataChange({ icpTargets: updatedTargets });
                        
                        // Refresh the ICP options list
                        const refreshResponse = await fetch("/api/icp-targets");
                        if (refreshResponse.ok) {
                          const data = await refreshResponse.json();
                          setIcpOptions(data.icpTargets || ALL_JOB_TITLES);
                          setCustomTargets(data.customTargets || []);
                        }
                      } catch (error) {
                        console.error("Error updating ICP target:", error);
                        throw error;
                      }
                    }}
                    className="text-xs"
                  />
                );
              }
              
              return (
                <Badge 
                  key={idx} 
                  variant="outline" 
                  className="text-xs flex items-center gap-1"
                >
                  {target}
                  <button
                    type="button"
                    onClick={() => {
                      const newTargets = formData.icpTargets.filter((_, i) => i !== idx);
                      onFormDataChange({ icpTargets: newTargets });
                    }}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {formData.icpTargets.length} job title{formData.icpTargets.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="painClusters">Pain Clusters (comma-separated, max 3)</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">Pain Cluster Rules:</p>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  <li>Identify <strong>strategic clusters</strong>, not surface-level symptoms</li>
                  <li>❌ Bad: &quot;App is slow&quot;</li>
                  <li>✅ Good: &quot;Operational Inefficiency&quot; or &quot;Tech Debt&quot;</li>
                  <li>Limit to <strong>3 distinct pain clusters</strong> per asset</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="painClusters"
          value={formData.painClusters}
          onChange={(e) => handlePainClustersChange(e.target.value)}
          placeholder="e.g., Operational Inefficiency, Tech Debt, Cost Management"
          className={painClusterError ? "border-destructive" : ""}
        />
        {painClusterError && (
          <p className="text-sm text-destructive">{painClusterError}</p>
        )}
        {formData.painClusters && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 mt-2">
              {formData.painClusters
                .split(",")
                .map((p) => p.trim())
                .filter((p) => p.length > 0)
                .map((cluster, idx) => (
                  <Badge 
                    key={idx} 
                    variant="outline" 
                    className={`text-xs ${
                      idx >= 3 ? "border-destructive bg-destructive/10" : ""
                    }`}
                  >
                    {cluster}
                  </Badge>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {formData.painClusters
                .split(",")
                .map((p) => p.trim())
                .filter((p) => p.length > 0).length} / 3 clusters
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="outreachTip">Outreach Tip</Label>
        <Textarea
          id="outreachTip"
          value={formData.outreachTip}
          onChange={(e) => onFormDataChange({ outreachTip: e.target.value })}
          placeholder="Enter outreach tip or messaging suggestion..."
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="customCreatedAt">Creation Date</Label>
          <DatePicker
            date={customCreatedAt}
            onSelect={(date) => onCustomCreatedAtChange(date ?? null)}
            placeholder="Select creation date"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastReviewedAt">Last Review Date</Label>
          <DatePicker
            date={lastReviewedAt}
            onSelect={(date) => onLastReviewedAtChange(date ?? null)}
            placeholder="Select review date"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expiryDate">
          Expiration Date <span className="text-xs text-muted-foreground">(Optional)</span>
        </Label>
        <DatePicker
          date={expiryDate}
          onSelect={(date) => onExpiryDateChange(date ?? null)}
          placeholder="Select expiration date"
          disabledDates={(date) => {
            // Disable past dates (only allow future dates)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const compareDate = new Date(date)
            compareDate.setHours(0, 0, 0, 0)
            return compareDate < today
          }}
        />
      </div>
    </div>
  );
}
