"use client";

import { Button } from "@/components/ui/button";
import { Mail, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SequenceActionBarProps {
  selectedCount: number;
  onDraftSequence: () => void;
  onClearSelection: () => void;
  isLoading?: boolean;
}

export function SequenceActionBar({
  selectedCount,
  onDraftSequence,
  onClearSelection,
  isLoading = false,
}: SequenceActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
        "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg",
        "px-4 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-2"
      )}
    >
      <div className="text-sm text-muted-foreground">
        <span className="font-medium">{selectedCount}</span> asset{selectedCount !== 1 ? "s" : ""} selected
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={onDraftSequence}
          disabled={isLoading || selectedCount < 2 || selectedCount > 4}
          className="gap-2"
        >
          <Mail className="h-4 w-4" />
          {isLoading ? "Drafting..." : "Draft Nurture Sequence"}
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isLoading}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      </div>

      {selectedCount < 2 && (
        <div className="text-xs text-muted-foreground">
          Select 2-4 assets to create a sequence
        </div>
      )}
      
      {selectedCount > 4 && (
        <div className="text-xs text-orange-600 dark:text-orange-400">
          Maximum 4 assets per sequence
        </div>
      )}
    </div>
  );
}
