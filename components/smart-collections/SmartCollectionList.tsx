"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderSearch, Trash2, Loader2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getSmartCollections,
  deleteSmartCollection,
  SmartCollection,
} from "@/app/actions/collections";
import { AssetFiltersState } from "@/components/AssetFilters";

interface SmartCollectionListProps {
  className?: string;
  onApplyFilters?: (filters: AssetFiltersState) => void;
  defaultOpen?: boolean;
}

export function SmartCollectionList({
  className,
  onApplyFilters,
  defaultOpen = true,
}: SmartCollectionListProps) {
  const [collections, setCollections] = useState<SmartCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const fetchCollections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    const result = await getSmartCollections();
    
    if (result.success) {
      setCollections(result.data);
    } else {
      setError(result.error);
    }
    
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleApplyCollection = (collection: SmartCollection) => {
    const filters = collection.filterState as AssetFiltersState;
    
    // If a callback is provided, use it directly
    if (onApplyFilters) {
      onApplyFilters(filters);
      return;
    }

    // Otherwise, navigate to dashboard with filters as URL params
    const params = new URLSearchParams();
    
    if (filters.search) {
      params.set("search", filters.search);
    }
    if (filters.funnelStages.length > 0) {
      params.set("stages", filters.funnelStages.join(","));
    }
    if (filters.icpTargets.length > 0) {
      params.set("icp", filters.icpTargets.join(","));
    }
    if (filters.statuses.length > 0) {
      params.set("status", filters.statuses.join(","));
    }
    if (filters.painClusters.length > 0) {
      params.set("pain", filters.painClusters.join(","));
    }
    if (filters.color) {
      // Encode the color (URL will encode # as %23)
      params.set("color", filters.color);
    }
    if (filters.sortBy && filters.sortBy !== "createdAt") {
      params.set("sort", filters.sortBy);
    }
    if (filters.sortDirection && filters.sortDirection !== "desc") {
      params.set("dir", filters.sortDirection);
    }

    const queryString = params.toString();
    router.push(`/dashboard${queryString ? `?${queryString}` : ""}`);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    
    startTransition(async () => {
      const result = await deleteSmartCollection(id);
      
      if (result.success) {
        setCollections((prev) => prev.filter((c) => c.id !== id));
      } else {
        setError(result.error);
      }
      
      setDeletingId(null);
    });
  };

  const getFilterSummary = (filters: AssetFiltersState) => {
    const parts: string[] = [];
    
    if (filters.search) {
      parts.push(`"${filters.search}"`);
    }
    if (filters.funnelStages.length > 0) {
      parts.push(`${filters.funnelStages.length} stage(s)`);
    }
    if (filters.icpTargets.length > 0) {
      parts.push(`${filters.icpTargets.length} ICP(s)`);
    }
    if (filters.statuses.length > 0) {
      parts.push(`${filters.statuses.length} status(es)`);
    }
    if (filters.painClusters.length > 0) {
      parts.push(`${filters.painClusters.length} cluster(s)`);
    }
    
    return parts.length > 0 ? parts.join(", ") : "All assets";
  };

  return (
    <div className={cn("w-full", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="gap-2 p-2 h-auto justify-start flex-1">
              <FolderSearch className="h-4 w-4 shrink-0" />
              <span className="font-medium">Smart Collections</span>
              {collections.length > 0 && (
                <Badge variant="secondary" className="ml-auto mr-2">
                  {collections.length}
                </Badge>
              )}
              {isOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
            </Button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              fetchCollections();
            }}
            disabled={isLoading}
            title="Refresh collections"
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          </Button>
        </div>

        <CollapsibleContent className="mt-2 space-y-1">
          {isLoading && collections.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : error ? (
            <div className="text-sm text-destructive py-2 px-2">
              {error}
            </div>
          ) : collections.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 px-2 text-center">
              <p>No saved collections yet.</p>
              <p className="text-xs mt-1">
                Apply filters in the dashboard and click "Save View" to create one.
              </p>
            </div>
          ) : (
            collections.map((collection) => (
              <div
                key={collection.id}
                className="group flex items-center gap-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                <button
                  onClick={() => handleApplyCollection(collection)}
                  className="flex-1 text-left px-3 py-2 text-sm"
                >
                  <div className="font-medium truncate">{collection.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {getFilterSummary(collection.filterState as AssetFiltersState)}
                  </div>
                </button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      disabled={isPending && deletingId === collection.id}
                    >
                      {isPending && deletingId === collection.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Collection</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{collection.name}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(collection.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
