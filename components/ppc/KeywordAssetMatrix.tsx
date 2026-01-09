"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Asset } from "@/lib/types";
import { CheckCircle2, XCircle, TrendingUp, Info } from "lucide-react";

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
  competition_index?: number;
  searchIntent?: SearchIntent;
  assetMatches: AssetMatch[];
  recommendedAssetId?: string;
  estimatedMonthlySpend?: number;
  bidRecommendation?: number;
  valueScore?: number;
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

  // Sort keywords by value score (DataForSEO best practices) and match quality
  const sortedKeywords = [...keywords].sort((a, b) => {
    const aHasAssignment = assignedKeywords.has(a.keyword);
    const bHasAssignment = assignedKeywords.has(b.keyword);
    if (aHasAssignment !== bHasAssignment) {
      return aHasAssignment ? -1 : 1;
    }
    
    // Primary sort: Value Score (DataForSEO best practices)
    const aValueScore = a.valueScore || 0;
    const bValueScore = b.valueScore || 0;
    if (aValueScore !== bValueScore) {
      return bValueScore - aValueScore;
    }
    
    // Secondary sort: Asset match score
    const aBestScore = a.assetMatches[0]?.score || 0;
    const bBestScore = b.assetMatches[0]?.score || 0;
    if (aBestScore !== bBestScore) {
      return bBestScore - aBestScore;
    }
    
    // Tertiary sort: Volume
    return (b.volume || 0) - (a.volume || 0);
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
              <br />Keywords are filtered per DataForSEO best practices (volume ≥200 or high CPC/low competition).
              <br />Value Score combines volume, CPC, and competition to prioritize opportunities.
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
              <TableHead className="w-28 text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end gap-1 cursor-help">
                        <span className="text-sm font-medium">Value Score</span>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Composite score (0-100) combining volume, CPC, and competition.
                        <br />Higher scores indicate better opportunities per DataForSEO best practices.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="w-32 text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-end gap-0.5 cursor-help">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium">Recommended Bid</span>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <span className="text-xs font-normal text-muted-foreground">Based on CPC & competition</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Suggested bid amount based on CPC and competition index.
                        <br />Higher competition requires higher bids to achieve good ad positions (DataForSEO best practice).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
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
                  <TableCell className="text-right">
                    {kw.valueScore !== undefined ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-end gap-1 cursor-help">
                              <span className={`font-semibold ${
                                kw.valueScore >= 70 ? "text-green-600 dark:text-green-400" :
                                kw.valueScore >= 50 ? "text-yellow-600 dark:text-yellow-400" :
                                "text-orange-600 dark:text-orange-400"
                              }`}>
                                {kw.valueScore}
                              </span>
                              <span className="text-xs text-muted-foreground">/100</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">
                              Value Score: {kw.valueScore}/100
                              <br />Combines volume ({kw.volume}), CPC (${kw.cpc.toFixed(2)}), and competition ({kw.competition}).
                              <br />Higher = better opportunity per DataForSEO best practices.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {kw.bidRecommendation !== undefined && kw.bidRecommendation > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col items-end cursor-help">
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                ${kw.bidRecommendation.toFixed(2)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                CPC: ${kw.cpc.toFixed(2)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">
                              Recommended bid: ${kw.bidRecommendation.toFixed(2)}
                              <br />Base CPC: ${kw.cpc.toFixed(2)}
                              <br />Competition: {kw.competition} ({((kw.competition_index || 0.5) * 100).toFixed(0)}%)
                              <br />Higher competition requires higher bids for good ad positions.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
    </div>
  );
}
