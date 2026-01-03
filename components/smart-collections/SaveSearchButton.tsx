"use client";

import { useState, useTransition } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createSmartCollection } from "@/app/actions/collections";
import { AssetFiltersState } from "@/components/AssetFilters";

interface SaveSearchButtonProps {
  filters: AssetFiltersState;
  disabled?: boolean;
  onSaved?: () => void;
}

export function SaveSearchButton({ filters, disabled, onSaved }: SaveSearchButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Check if there are any active filters worth saving
  const hasActiveFilters =
    filters.search ||
    filters.funnelStages.length > 0 ||
    filters.icpTargets.length > 0 ||
    filters.statuses.length > 0 ||
    filters.painClusters.length > 0;

  const handleSave = () => {
    if (!name.trim()) {
      setError("Please enter a name for this collection");
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await createSmartCollection(name.trim(), filters);
      
      if (result.success) {
        setName("");
        setIsOpen(false);
        onSaved?.();
      } else {
        setError(result.error);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isPending) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !hasActiveFilters}
          className="gap-2"
          title={hasActiveFilters ? "Save current filters as a smart collection" : "Apply filters to save as a collection"}
        >
          <Bookmark className="h-4 w-4" />
          <span className="hidden sm:inline">Save View</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Save Smart Collection</h4>
            <p className="text-sm text-muted-foreground">
              Save your current filters as a quick-access collection.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="collection-name">Collection Name</Label>
            <Input
              id="collection-name"
              placeholder="e.g., Marketing Approved Assets"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={isPending}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {/* Preview of what's being saved */}
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">Filters to save:</p>
            <ul className="text-muted-foreground space-y-0.5">
              {filters.search && (
                <li>• Search: "{filters.search}"</li>
              )}
              {filters.funnelStages.length > 0 && (
                <li>• Funnel: {filters.funnelStages.length} stage(s)</li>
              )}
              {filters.icpTargets.length > 0 && (
                <li>• ICP: {filters.icpTargets.length} target(s)</li>
              )}
              {filters.statuses.length > 0 && (
                <li>• Status: {filters.statuses.length} status(es)</li>
              )}
              {filters.painClusters.length > 0 && (
                <li>• Pain: {filters.painClusters.length} cluster(s)</li>
              )}
              <li>• Sort: {filters.sortBy} ({filters.sortDirection})</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsOpen(false);
                setName("");
                setError(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isPending || !name.trim()}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Collection"
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
