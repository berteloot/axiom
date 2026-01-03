"use client";

import { Calendar, Star, Info } from "lucide-react";
import { format } from "date-fns";
import { Asset } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface ContentMetricsProps {
  asset: Asset;
}

export function ContentMetrics({ asset }: ContentMetricsProps) {
  const hasMetrics = 
    (asset.contentQualityScore !== null && asset.contentQualityScore !== undefined) || 
    asset.expiryDate;

  if (!hasMetrics) return null;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold mb-3">Content Metrics</h3>
      {asset.contentQualityScore !== null && asset.contentQualityScore !== undefined && (
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium">Quality Score:</span>
          <span className="text-sm font-bold">{asset.contentQualityScore}/100</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:bg-muted"
                aria-label="Learn more about Quality Score"
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-sm mb-2">Quality Score Explained</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    The Quality Score (1-100) is an AI assessment of how actionable and well-written this asset is for sales and marketing teams.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-xs">
                    <span className="font-semibold text-green-600">90-100:</span>
                    <span className="text-muted-foreground ml-1">Exceptional - Has specific ROI stats, customer quotes, clear value props, well-structured</span>
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-blue-600">70-89:</span>
                    <span className="text-muted-foreground ml-1">Good - Actionable content with some concrete examples, clear messaging</span>
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-yellow-600">50-69:</span>
                    <span className="text-muted-foreground ml-1">Average - Generic content, limited specifics, needs improvement</span>
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-orange-600">30-49:</span>
                    <span className="text-muted-foreground ml-1">Poor - Mostly fluff, vague claims, low actionability</span>
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-red-600">1-29:</span>
                    <span className="text-muted-foreground ml-1">Very Poor - No usable content, marketing speak without substance</span>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    <strong>Factors considered:</strong> Specificity of claims, presence of data/quotes, clarity of value proposition, actionability for sales teams.
                  </p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
      {asset.expiryDate && (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium">Expires:</span>
          <span className="text-sm">{format(new Date(asset.expiryDate), "PPP")}</span>
        </div>
      )}
    </div>
  );
}
