"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { MultiSelectCombobox } from "@/components/ui/combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ALL_JOB_TITLES } from "@/lib/job-titles"
import { Loader2, Package, Users, X, Sparkles } from "lucide-react"
import { FunnelStage } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"

interface ProductLine {
  id: string
  name: string
}

interface BulkEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onSave: (updates: {
    productLineIds?: string[]
    icpTargets?: string[]
    funnelStage?: FunnelStage
  }) => Promise<void>
  onReanalyze?: () => Promise<void>
}

export function BulkEditModal({
  open,
  onOpenChange,
  selectedCount,
  onSave,
  onReanalyze,
}: BulkEditModalProps) {
  const [productLines, setProductLines] = React.useState<ProductLine[]>([])
  const [isLoadingProductLines, setIsLoadingProductLines] = React.useState(true)
  const [selectedProductLineIds, setSelectedProductLineIds] = React.useState<string[]>([])
  const [selectedIcpTargets, setSelectedIcpTargets] = React.useState<string[]>([])
  const [icpOptions, setIcpOptions] = React.useState<string[]>(ALL_JOB_TITLES)
  const [isLoadingIcp, setIsLoadingIcp] = React.useState(true)
  const [selectedFunnelStage, setSelectedFunnelStage] = React.useState<FunnelStage | undefined>(undefined)
  const [shouldReanalyze, setShouldReanalyze] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Fetch product lines
  React.useEffect(() => {
    if (open) {
      setIsLoadingProductLines(true)
      fetch("/api/product-lines")
        .then((res) => res.json())
        .then((data) => {
          setProductLines(data.productLines || [])
        })
        .catch((err) => {
          console.error("Error fetching product lines:", err)
        })
        .finally(() => {
          setIsLoadingProductLines(false)
        })
    }
  }, [open])

  // Fetch ICP targets
  React.useEffect(() => {
    if (open) {
      setIsLoadingIcp(true)
      fetch("/api/icp-targets")
        .then((res) => res.json())
        .then((data) => {
          setIcpOptions(data.icpTargets || ALL_JOB_TITLES)
        })
        .catch((err) => {
          console.error("Error fetching ICP targets:", err)
        })
        .finally(() => {
          setIsLoadingIcp(false)
        })
    }
  }, [open])

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setSelectedProductLineIds([])
      setSelectedIcpTargets([])
      setSelectedFunnelStage(undefined)
      setShouldReanalyze(false)
      setError(null)
    }
  }, [open])

  const handleSave = async () => {
    // Check if at least one action is being performed
    const hasFieldUpdates = 
      selectedProductLineIds.length > 0 ||
      selectedIcpTargets.length > 0 ||
      selectedFunnelStage !== undefined

    if (!hasFieldUpdates && !shouldReanalyze) {
      setError("Please select at least one action to perform")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // Handle field updates if any
      if (hasFieldUpdates) {
        const updates: {
          productLineIds?: string[]
          icpTargets?: string[]
          funnelStage?: FunnelStage
        } = {}

        if (selectedProductLineIds.length > 0) {
          updates.productLineIds = selectedProductLineIds
        }
        if (selectedIcpTargets.length > 0) {
          updates.icpTargets = selectedIcpTargets
        }
        if (selectedFunnelStage !== undefined) {
          updates.funnelStage = selectedFunnelStage
        }

        await onSave(updates)
      }

      // Handle re-analysis if requested
      if (shouldReanalyze && onReanalyze) {
        await onReanalyze()
      }

      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update assets")
    } finally {
      setIsSaving(false)
    }
  }

  const hasChanges =
    selectedProductLineIds.length > 0 ||
    selectedIcpTargets.length > 0 ||
    selectedFunnelStage !== undefined ||
    shouldReanalyze

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Edit {selectedCount} Asset{selectedCount !== 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>
            Update multiple assets at once. Leave fields unchanged if you don't want to modify them.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-sm">
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-6 mt-4">
          {/* Product Lines */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Product Lines
            </Label>
            <MultiSelectCombobox
              options={productLines.map(pl => pl.name)}
              value={selectedProductLineIds.map(id => {
                const pl = productLines.find(p => p.id === id);
                return pl?.name || id;
              })}
              onChange={(selected) => {
                const selectedIds = selected
                  .map((name) => productLines.find(pl => pl.name === name)?.id)
                  .filter((id): id is string => id !== undefined);
                setSelectedProductLineIds(selectedIds);
              }}
              placeholder={isLoadingProductLines ? "Loading product lines..." : "Select product lines..."}
              searchPlaceholder="Search product lines..."
              emptyText="No product lines found"
              disabled={isLoadingProductLines || isSaving}
            />
            {selectedProductLineIds.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">
                  {selectedProductLineIds.length} selected product line{selectedProductLineIds.length !== 1 ? "s" : ""}:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedProductLineIds.map((id) => {
                    const productLine = productLines.find(pl => pl.id === id);
                    if (!productLine) return null;
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="text-xs pr-1"
                      >
                        {productLine.name}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProductLineIds(selectedProductLineIds.filter((i) => i !== id))
                          }}
                          className="ml-1.5 rounded-full hover:bg-secondary-foreground/20 p-0.5"
                          aria-label={`Remove ${productLine.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Assign all selected assets to these product lines. Leave empty to keep unchanged.
            </p>
          </div>

          {/* ICP Targets */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              ICP Targets
            </Label>
            <MultiSelectCombobox
              options={icpOptions}
              value={selectedIcpTargets}
              onChange={setSelectedIcpTargets}
              placeholder={isLoadingIcp ? "Loading ICP targets..." : "Select ICP targets (optional)"}
              searchPlaceholder="Search ICP targets..."
              emptyText="No ICP targets found"
              disabled={isLoadingIcp || isSaving}
            />
            {selectedIcpTargets.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">
                  {selectedIcpTargets.length} selected ICP target{selectedIcpTargets.length !== 1 ? "s" : ""}:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedIcpTargets.map((icp) => (
                    <Badge
                      key={icp}
                      variant="secondary"
                      className="text-xs pr-1"
                    >
                      {icp}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIcpTargets(selectedIcpTargets.filter((item) => item !== icp))
                        }}
                        className="ml-1.5 rounded-full hover:bg-secondary-foreground/20 p-0.5"
                        aria-label={`Remove ${icp}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Replace all selected assets' ICP targets with these selections. Leave empty to keep unchanged.
            </p>
          </div>

          {/* Funnel Stage */}
          <div className="space-y-2">
            <Label>Funnel Stage</Label>
            <Select
              value={selectedFunnelStage || "unchanged"}
              onValueChange={(value) => {
                if (value === "unchanged") {
                  setSelectedFunnelStage(undefined)
                } else {
                  setSelectedFunnelStage(value as FunnelStage)
                }
              }}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select funnel stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged">(No change)</SelectItem>
                <SelectItem value="TOFU_AWARENESS">TOFU - Awareness</SelectItem>
                <SelectItem value="MOFU_CONSIDERATION">MOFU - Consideration</SelectItem>
                <SelectItem value="BOFU_DECISION">BOFU - Decision</SelectItem>
                <SelectItem value="RETENTION">Retention</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Set the funnel stage for all selected assets.
            </p>
          </div>

          {/* Re-analyze Option */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="reanalyze"
                checked={shouldReanalyze}
                onCheckedChange={(checked) => setShouldReanalyze(checked === true)}
                disabled={isSaving}
                className="mt-1"
              />
              <div className="space-y-1 flex-1">
                <Label
                  htmlFor="reanalyze"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  Re-analyze with AI
                </Label>
                <p className="text-xs text-muted-foreground">
                  Trigger AI re-analysis for all selected assets. This will update funnel stage, ICP targets, pain clusters, and other AI-generated fields using the latest analysis logic. Assets will be processed in the background.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              `Update ${selectedCount} Asset${selectedCount !== 1 ? "s" : ""}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
