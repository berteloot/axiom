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
import { Loader2, Package, Users, X, Sparkles, Trash2, AlertTriangle } from "lucide-react"
import { FunnelStage } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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
  onDelete?: () => Promise<void>
}

export function BulkEditModal({
  open,
  onOpenChange,
  selectedCount,
  onSave,
  onReanalyze,
  onDelete,
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
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
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
      setShowDeleteConfirm(false)
      setError(null)
    }
  }, [open])

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true)
    setError(null)

    try {
      await onDelete()
      setShowDeleteConfirm(false)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete assets")
    } finally {
      setIsDeleting(false)
    }
  }

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
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start space-x-3 p-4 rounded-lg bg-muted/50 border border-muted">
              <Checkbox
                id="reanalyze"
                checked={shouldReanalyze}
                onCheckedChange={(checked) => setShouldReanalyze(checked === true)}
                disabled={isSaving || isDeleting}
                className="mt-1"
              />
              <div className="space-y-2 flex-1">
                <Label
                  htmlFor="reanalyze"
                  className="flex items-center gap-2 cursor-pointer font-medium"
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  Re-analyze with AI
                </Label>
                <p className="text-sm text-muted-foreground">
                  Trigger AI re-analysis for all selected assets. This will update funnel stage, ICP targets, pain clusters, and other AI-generated fields using the latest analysis logic.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    Updates funnel stage
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Updates ICP targets
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Updates pain clusters
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Background processing
                  </Badge>
                </div>
                {shouldReanalyze && (
                  <div className="mt-2 p-2 rounded bg-primary/10 border border-primary/20">
                    <p className="text-xs text-primary font-medium">
                      ✓ AI re-analysis will be triggered for {selectedCount} asset{selectedCount !== 1 ? "s" : ""} after saving
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Delete Option */}
          {onDelete && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-start space-x-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <Label className="font-medium text-destructive">
                      Delete Assets
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete all selected assets. This action cannot be undone. Files will be removed from storage and all associated data will be deleted.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSaving || isDeleting}
                    className="mt-2"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete {selectedCount} Asset{selectedCount !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isDeleting || !hasChanges}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {shouldReanalyze && !(selectedProductLineIds.length > 0 || selectedIcpTargets.length > 0 || selectedFunnelStage !== undefined) 
                  ? "Re-analyzing..." 
                  : "Updating..."}
              </>
            ) : shouldReanalyze && !(selectedProductLineIds.length > 0 || selectedIcpTargets.length > 0 || selectedFunnelStage !== undefined) ? (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Re-analyze {selectedCount} Asset{selectedCount !== 1 ? "s" : ""}
              </>
            ) : (
              `Update ${selectedCount} Asset${selectedCount !== 1 ? "s" : ""}`
            )}
          </Button>
        </div>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete {selectedCount} Asset{selectedCount !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2">
              <p>
                Are you sure you want to permanently delete {selectedCount} asset{selectedCount !== 1 ? "s" : ""}? This action cannot be undone.
              </p>
              <p className="font-medium text-destructive">
                All files will be removed from storage and all associated data will be permanently deleted.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {selectedCount} Asset{selectedCount !== 1 ? "s" : ""}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
