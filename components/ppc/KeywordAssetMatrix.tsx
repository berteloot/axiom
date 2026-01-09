"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Asset } from "@/lib/types";
import { CheckCircle2, XCircle, TrendingUp, DollarSign } from "lucide-react";

interface AssetMatch {
  assetId: string;
  assetTitle: string;
  score: number;
  reasons: string[];
  funnelStage: string;
  productLines: string[];
}

interface SearchIntent {
  main_intent: "informational" | "commercial" | "transactional" | "navigational";
}

interface KeywordWithMatches {
  keyword: string;
  volume: number;
  cpc: number;
  competition: string;
  searchIntent?: SearchIntent;
  assetMatches: AssetMatch[];
  recommendedAssetId?: string;
  estimatedMonthlySpend?: number;
}

interface KeywordAssetMatrixProps {
  keywords: KeywordWithMatches[];
  assets: Asset[];
  assignedKeywords: Map<string, string>; // keyword -> assetId
  onAssignmentChange: (assignments: Map<string, string>) => void;
}

export function KeywordAssetMatrix({
  keywords,
  assets,
  assignedKeywords,
  onAssignmentChange,
}: KeywordAssetMatrixProps) {
  const handleAssetAssignment = (keyword: string, assetId: string) => {
    const newAssignments = new Map(assignedKeywords);
    if (assetId === "none" || assetId === "") {
      newAssignments.delete(keyword);
    } else {
      newAssignments.set(keyword, assetId);
    }
    onAssignmentChange(newAssignments);
  };

  const getIntentColor = (intent?: string) => {
    switch (intent) {
      case "transactional":
        return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      case "commercial":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      case "informational":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20";
    }
  };

  const getCompetitionColor = (competition: string) => {
    switch (competition.toLowerCase()) {
      case "high":
        return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
      case "low":
        return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20";
    }
  };

  // Sort keywords by recommended match or best score
  const sortedKeywords = [...keywords].sort((a, b) => {
    const aHasAssignment = assignedKeywords.has(a.keyword);
    const bHasAssignment = assignedKeywords.has(b.keyword);
    if (aHasAssignment !== bHasAssignment) {
      return aHasAssignment ? -1 : 1;
    }
    
    const aBestScore = a.assetMatches[0]?.score || 0;
    const bBestScore = b.assetMatches[0]?.score || 0;
    return bBestScore - aBestScore;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Keyword-to-Asset Mapping</h3>
          <p className="text-sm text-muted-foreground">
            Assign the best landing page (asset) for each keyword. High match scores indicate better alignment.
            <span className="block mt-1 text-xs">
              Volume = Average monthly search volume (12-month average). CPC = Cost per click in selected currency.
            </span>
          </p>
        </div>
        <Badge variant="secondary">
          {assignedKeywords.size} of {keywords.length} assigned
        </Badge>
      </div>

      <div className="rounded-md border max-h-[600px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Keyword</TableHead>
              <TableHead className="w-36 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-sm font-medium">Avg Monthly Volume</span>
                  <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">(12-month avg)</span>
                </div>
              </TableHead>
              <TableHead className="w-24 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-sm font-medium">CPC</span>
                  <span className="text-xs font-normal text-muted-foreground">Cost per click</span>
                </div>
              </TableHead>
              <TableHead className="w-24">Competition</TableHead>
              <TableHead className="w-32">Intent</TableHead>
              <TableHead className="min-w-[300px]">Recommended Asset</TableHead>
              <TableHead className="w-32">Best Match Score</TableHead>
              <TableHead className="w-40">Assign Landing Page</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedKeywords.map((kw, idx) => {
              const assignedAssetId = assignedKeywords.get(kw.keyword);
              const assignedAsset = assignedAssetId
                ? assets.find((a) => a.id === assignedAssetId)
                : null;
              const bestMatch = kw.assetMatches[0];
              const recommendedAsset = kw.recommendedAssetId
                ? assets.find((a) => a.id === kw.recommendedAssetId)
                : null;

              return (
                <TableRow key={idx}>
                  <TableCell className="font-medium">
                    <div className="max-w-[200px] truncate" title={kw.keyword}>
                      {kw.keyword}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {kw.volume.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                    ${kw.cpc.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getCompetitionColor(kw.competition)}
                    >
                      {kw.competition}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {kw.searchIntent ? (
                      <Badge
                        variant="outline"
                        className={getIntentColor(kw.searchIntent.main_intent)}
                      >
                        {kw.searchIntent.main_intent}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {recommendedAsset ? (
                      <div className="space-y-1">
                        <div className="font-medium text-sm truncate" title={recommendedAsset.title}>
                          {recommendedAsset.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {bestMatch?.score}% match • {bestMatch?.funnelStage}
                        </div>
                      </div>
                    ) : bestMatch ? (
                      <div className="space-y-1">
                        <div className="font-medium text-sm truncate" title={bestMatch.assetTitle}>
                          {bestMatch.assetTitle}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {bestMatch.score}% match • {bestMatch.funnelStage}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">No strong match</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {bestMatch ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{bestMatch.score}%</span>
                        {bestMatch.score >= 70 ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : bestMatch.score >= 50 ? (
                          <TrendingUp className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={assignedAssetId || (kw.recommendedAssetId || "none")}
                      onValueChange={(value) => handleAssetAssignment(kw.keyword, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {kw.assetMatches.slice(0, 5).map((match) => {
                          const asset = assets.find((a) => a.id === match.assetId);
                          if (!asset) return null;
                          return (
                            <SelectItem key={match.assetId} value={match.assetId}>
                              <div className="flex items-center justify-between w-full">
                                <span className="truncate max-w-[200px]">{asset.title}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {match.score}%
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Match Score Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          <span>70%+ (Excellent Match)</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-yellow-500" />
          <span>50-69% (Good Match)</span>
        </div>
        <div className="flex items-center gap-1">
          <XCircle className="h-3 w-3 text-red-500" />
          <span>&lt;50% (Weak Match)</span>
        </div>
      </div>
    </div>
  );
}
