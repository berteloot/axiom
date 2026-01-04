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
import { Loader2, Package, Users, X } from "lucide-react"
import { FunnelStage } from "@/lib/types"

interface ProductLine {
  id: string
  name: string
}

interface BulkEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onSave: (updates: {
    productLineId?: string | null
    icpTargets?: string[]
    funnelStage?: FunnelStage
  }) => Promise<void>
}

export function BulkEditModal({
  open,
  onOpenChange,
  selectedCount,
  onSave,
}: BulkEditModalProps) {
  const [productLines, setProductLines] = React.useState<ProductLine[]>([])
  const [isLoadingProductLines, setIsLoadingProductLines] = React.useState(true)
  const [selectedProductLine, setSelectedProductLine] = React.useState<string | null | undefined>(undefined)
  const [selectedIcpTargets, setSelectedIcpTargets] = React.useState<string[]>([])
  const [icpOptions, setIcpOptions] = React.useState<string[]>(ALL_JOB_TITLES)
  const [isLoadingIcp, setIsLoadingIcp] = React.useState(true)
  const [selectedFunnelStage, setSelectedFunnelStage] = React.useState<FunnelStage | undefined>(undefined)
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
      setSelectedProductLine(undefined)
      setSelectedIcpTargets([])
      setSelectedFunnelStage(undefined)
      setError(null)
    }
  }, [open])

  const handleSave = async () => {
    // Check if at least one field is being updated
    if (
      selectedProductLine === undefined &&
      selectedIcpTargets.length === 0 &&
      selectedFunnelStage === undefined
    ) {
      setError("Please select at least one field to update")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const updates: {
        productLineId?: string | null
        icpTargets?: string[]
        funnelStage?: FunnelStage
      } = {}

      if (selectedProductLine !== undefined) {
        updates.productLineId = selectedProductLine || null
      }
      if (selectedIcpTargets.length > 0) {
        updates.icpTargets = selectedIcpTargets
      }
      if (selectedFunnelStage !== undefined) {
        updates.funnelStage = selectedFunnelStage
      }

      await onSave(updates)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update assets")
    } finally {
      setIsSaving(false)
    }
  }

  const hasChanges =
    selectedProductLine !== undefined ||
    selectedIcpTargets.length > 0 ||
    selectedFunnelStage !== undefined

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
          {/* Product Line */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Product Line
            </Label>
            <Select
              value={selectedProductLine === null ? "none" : selectedProductLine || "unchanged"}
              onValueChange={(value) => {
                if (value === "unchanged") {
                  setSelectedProductLine(undefined)
                } else if (value === "none") {
                  setSelectedProductLine(null)
                } else {
                  setSelectedProductLine(value)
                }
              }}
              disabled={isLoadingProductLines || isSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product line" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged">(No change)</SelectItem>
                <SelectItem value="none">None (Remove product line)</SelectItem>
                {productLines.map((pl) => (
                  <SelectItem key={pl.id} value={pl.id}>
                    {pl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Assign all selected assets to this product line, or remove the product line assignment.
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
