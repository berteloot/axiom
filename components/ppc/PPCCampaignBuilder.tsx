"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChevronRight, ChevronLeft, Check, AlertCircle, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Asset } from "@/lib/types";
import { KeywordAssetMatrix } from "./KeywordAssetMatrix";
import { AdGroupOrganizer } from "./AdGroupOrganizer";
import { CampaignExport } from "./CampaignExport";

interface SearchIntent {
  main_intent: "informational" | "commercial" | "transactional" | "navigational";
  foreign_intent?: string[];
  intent_probability?: number;
}

interface AssetMatch {
  assetId: string;
  assetTitle: string;
  score: number;
  reasons: string[];
  funnelStage: string;
  productLines: string[];
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
  adGroupSuggestion?: string;
  matchType?: "broad" | "phrase" | "exact";
  estimatedMonthlySpend?: number;
}

interface PPCampaignData {
  keywords: KeywordWithMatches[];
  adGroups: Array<{
    name: string;
    keywords: number;
    estimatedMonthlySpend: number;
  }>;
  negativeKeywords: string[];
  metadata: {
    assetCount: number;
    keywordCount: number;
    totalEstimatedMonthlySpend: number;
    productLine?: string | null;
  };
  warnings?: Array<{
    type: string;
    message: string;
    api: string;
  }>;
}

interface PPCCampaignBuilderProps {
  assets: Asset[];
  selectedAssetIds: string[];
  onAssetSelectionChange?: (assetIds: string[]) => void;
}

type Step = "assets" | "analysis" | "mapping" | "groups" | "export";

export function PPCCampaignBuilder({
  assets,
  selectedAssetIds: initialSelectedAssetIds,
  onAssetSelectionChange,
}: PPCCampaignBuilderProps) {
  const [currentStep, setCurrentStep] = useState<Step>("assets");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(initialSelectedAssetIds);
  const [productLineFilter, setProductLineFilter] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [campaignData, setCampaignData] = useState<PPCampaignData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignedKeywords, setAssignedKeywords] = useState<Map<string, string>>(new Map()); // keyword -> assetId
  const [organizedAdGroups, setOrganizedAdGroups] = useState<Map<string, KeywordWithMatches[]>>(new Map());
  const [keywordToAdGroup, setKeywordToAdGroup] = useState<Map<string, string>>(new Map()); // keyword -> adGroupName
  const [negativeKeywords, setNegativeKeywords] = useState<Set<string>>(new Set());
  const [newAdGroupName, setNewAdGroupName] = useState<string>("");

  // Get available product lines
  const productLines = React.useMemo(() => {
    const plMap = new Map<string, { id: string; name: string }>();
    assets.forEach((asset) => {
      asset.productLines?.forEach((pl) => {
        if (!plMap.has(pl.id)) {
          plMap.set(pl.id, { id: pl.id, name: pl.name });
        }
      });
    });
    return Array.from(plMap.values());
  }, [assets]);

  // Get filtered assets
  const filteredAssets = React.useMemo(() => {
    if (!productLineFilter) return assets;
    return assets.filter((asset) =>
      asset.productLines?.some((pl) => pl.id === productLineFilter)
    );
  }, [assets, productLineFilter]);

  const handleAssetToggle = (assetId: string) => {
    const newSelection = selectedAssetIds.includes(assetId)
      ? selectedAssetIds.filter((id) => id !== assetId)
      : [...selectedAssetIds, assetId];
    setSelectedAssetIds(newSelection);
    onAssetSelectionChange?.(newSelection);
  };

  const handleSelectAll = () => {
    const allIds = filteredAssets.map((a) => a.id);
    setSelectedAssetIds(allIds);
    onAssetSelectionChange?.(allIds);
  };

  const handleAnalyze = async () => {
    if (selectedAssetIds.length === 0) {
      setError("Please select at least one asset");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/assets/ppc-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIds: selectedAssetIds,
          productLineId: productLineFilter || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to analyze assets");
      }

      const data: PPCampaignData = await response.json();
      setCampaignData(data);

      // Initialize assignments with recommendations
      const initialAssignments = new Map<string, string>();
      data.keywords.forEach((kw) => {
        if (kw.recommendedAssetId) {
          initialAssignments.set(kw.keyword, kw.recommendedAssetId);
        }
      });
      setAssignedKeywords(initialAssignments);

      // Initialize ad groups
      const initialGroups = new Map<string, KeywordWithMatches[]>();
      const initialKeywordToAdGroup = new Map<string, string>();
      data.keywords.forEach((kw) => {
        const groupName = kw.adGroupSuggestion || "General";
        if (!initialGroups.has(groupName)) {
          initialGroups.set(groupName, []);
        }
        initialGroups.get(groupName)!.push(kw);
        initialKeywordToAdGroup.set(kw.keyword, groupName);
      });
      setOrganizedAdGroups(initialGroups);
      setKeywordToAdGroup(initialKeywordToAdGroup);

      setCurrentStep("analysis");
    } catch (err) {
      console.error("Error analyzing:", err);
      setError(err instanceof Error ? err.message : "Failed to analyze assets");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNext = () => {
    const steps: Step[] = ["assets", "analysis", "mapping", "groups", "export"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const handlePrevious = () => {
    const steps: Step[] = ["assets", "analysis", "mapping", "groups", "export"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  // Handle moving keyword to ad group or negative keywords
  const handleMoveKeyword = (keyword: string, targetGroup: string) => {
    if (!campaignData) return;

    const keywordData = campaignData.keywords.find(kw => kw.keyword === keyword);
    if (!keywordData) return;

    // If moving to negative keywords
    if (targetGroup === "__negative__") {
      // Remove from current ad group
      const currentGroup = keywordToAdGroup.get(keyword);
      if (currentGroup) {
        const groupKeywords = organizedAdGroups.get(currentGroup) || [];
        const updatedGroup = groupKeywords.filter(kw => kw.keyword !== keyword);
        if (updatedGroup.length === 0) {
          organizedAdGroups.delete(currentGroup);
        } else {
          organizedAdGroups.set(currentGroup, updatedGroup);
        }
        setOrganizedAdGroups(new Map(organizedAdGroups));
        keywordToAdGroup.delete(keyword);
        setKeywordToAdGroup(new Map(keywordToAdGroup));
      }
      setNegativeKeywords(new Set(negativeKeywords).add(keyword));
      return;
    }

    // Remove from negative keywords if it was there
    if (negativeKeywords.has(keyword)) {
      const updatedNegative = new Set(negativeKeywords);
      updatedNegative.delete(keyword);
      setNegativeKeywords(updatedNegative);
    }

    // Remove from current ad group
    const currentGroup = keywordToAdGroup.get(keyword);
    if (currentGroup && currentGroup !== targetGroup) {
      const groupKeywords = organizedAdGroups.get(currentGroup) || [];
      const updatedGroup = groupKeywords.filter(kw => kw.keyword !== keyword);
      if (updatedGroup.length === 0) {
        organizedAdGroups.delete(currentGroup);
      } else {
        organizedAdGroups.set(currentGroup, updatedGroup);
      }
    }

    // Add to target ad group
    if (!organizedAdGroups.has(targetGroup)) {
      organizedAdGroups.set(targetGroup, []);
    }
    const targetGroupKeywords = organizedAdGroups.get(targetGroup) || [];
    if (!targetGroupKeywords.find(kw => kw.keyword === keyword)) {
      targetGroupKeywords.push(keywordData);
      organizedAdGroups.set(targetGroup, targetGroupKeywords);
    }

    keywordToAdGroup.set(keyword, targetGroup);

    // Update state
    setOrganizedAdGroups(new Map(organizedAdGroups));
    setKeywordToAdGroup(new Map(keywordToAdGroup));
  };

  // Handle creating new ad group
  const handleCreateAdGroup = () => {
    if (!newAdGroupName.trim() || !campaignData) return;

    const groupName = newAdGroupName.trim();
    if (!organizedAdGroups.has(groupName)) {
      organizedAdGroups.set(groupName, []);
      setOrganizedAdGroups(new Map(organizedAdGroups));
    }
    setNewAdGroupName("");
  };

  // Handle removing keyword from campaign
  const handleRemoveKeyword = (keyword: string) => {
    const currentGroup = keywordToAdGroup.get(keyword);
    if (currentGroup) {
      const groupKeywords = organizedAdGroups.get(currentGroup) || [];
      const updatedGroup = groupKeywords.filter(kw => kw.keyword !== keyword);
      if (updatedGroup.length === 0) {
        organizedAdGroups.delete(currentGroup);
      } else {
        organizedAdGroups.set(currentGroup, updatedGroup);
      }
      setOrganizedAdGroups(new Map(organizedAdGroups));
      keywordToAdGroup.delete(keyword);
      setKeywordToAdGroup(new Map(keywordToAdGroup));
    }
    if (negativeKeywords.has(keyword)) {
      const updatedNegative = new Set(negativeKeywords);
      updatedNegative.delete(keyword);
      setNegativeKeywords(updatedNegative);
    }
  };

  const steps: Array<{ id: Step; label: string; description: string }> = [
    { id: "assets", label: "Select Assets", description: "Choose assets to build campaign" },
    { id: "analysis", label: "Keyword Analysis", description: "Review discovered keywords" },
    { id: "mapping", label: "Map Keywords", description: "Assign landing pages" },
    { id: "groups", label: "Organize Groups", description: "Create ad groups" },
    { id: "export", label: "Export Campaign", description: "Download campaign data" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
          <span className="text-muted-foreground">{steps[currentStepIndex].label}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step Indicators */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = index < currentStepIndex;
          const isClickable = index <= currentStepIndex || (index === currentStepIndex + 1 && campaignData);

          return (
            <div
              key={step.id}
              className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            >
              <button
                onClick={() => {
                  if (isClickable) {
                    if (index > currentStepIndex && !campaignData && index > 1) return;
                    setCurrentStep(step.id);
                  }
                }}
                disabled={!isClickable}
                className={`flex flex-col items-center gap-2 ${
                  isClickable ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isCompleted
                      ? "bg-green-500 border-green-500 text-white"
                      : isActive
                      ? "bg-brand-orange border-brand-orange text-white"
                      : "bg-muted border-muted-foreground text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                <div className="text-center">
                  <div className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </div>
                </div>
              </button>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    isCompleted ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStepIndex].label}</CardTitle>
          <CardDescription>{steps[currentStepIndex].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === "assets" && (
            <div className="space-y-4">
              {/* Product Line Filter */}
              {productLines.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Filter by Product Line (Optional)</label>
                  <select
                    value={productLineFilter}
                    onChange={(e) => setProductLineFilter(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">All Product Lines</option>
                    {productLines.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Asset Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Select Assets ({selectedAssetIds.length} selected)
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {selectedAssetIds.length === filteredAssets.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="grid gap-2 max-h-[400px] overflow-y-auto border rounded-md p-4">
                  {filteredAssets.map((asset) => (
                    <label
                      key={asset.id}
                      className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAssetIds.includes(asset.id)}
                        onChange={() => handleAssetToggle(asset.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{asset.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {asset.funnelStage} • {asset.icpTargets.join(", ") || "No ICP"}
                          {asset.productLines && asset.productLines.length > 0 && (
                            <> • {asset.productLines.map(pl => pl.name).join(", ")}</>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing || selectedAssetIds.length === 0}
                className="w-full"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing Assets...
                  </>
                ) : (
                  <>
                    Analyze & Discover Keywords
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}

          {currentStep === "analysis" && campaignData && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Keywords Found</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{campaignData.metadata.keywordCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Assets Analyzed</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{campaignData.metadata.assetCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Est. Monthly Spend</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${campaignData.metadata.totalEstimatedMonthlySpend.toFixed(0)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Keywords List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Top Keywords</h3>
                  {/* Create New Ad Group */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newAdGroupName}
                      onChange={(e) => setNewAdGroupName(e.target.value)}
                      placeholder="New ad group name..."
                      className="text-xs border rounded px-2 py-1 w-40"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleCreateAdGroup();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCreateAdGroup}
                      disabled={!newAdGroupName.trim()}
                      className="h-7 text-xs"
                    >
                      Create Group
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {campaignData.keywords.slice(0, 20).map((kw, idx) => {
                    const currentGroup = keywordToAdGroup.get(kw.keyword);
                    const isNegative = negativeKeywords.has(kw.keyword);
                    const availableGroups = Array.from(organizedAdGroups.keys()).sort();
                    
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-3 border rounded-md ${
                          isNegative ? "bg-red-50 dark:bg-red-950/20" : ""
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{kw.keyword}</span>
                            {isNegative && (
                              <Badge variant="destructive" className="text-xs">Negative</Badge>
                            )}
                            {currentGroup && !isNegative && (
                              <Badge variant="outline" className="text-xs">{currentGroup}</Badge>
                            )}
                            {kw.recommendedAssetId && (
                              <Badge variant="secondary" className="text-xs">Has Match</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Volume: {kw.volume.toLocaleString()} • CPC: ${kw.cpc.toFixed(2)} • Competition: {kw.competition}
                            {kw.searchIntent && (
                              <> • Intent: {kw.searchIntent.main_intent}</>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Select
                            value={isNegative ? "__negative__" : (currentGroup || "none")}
                            onValueChange={(value) => handleMoveKeyword(kw.keyword, value)}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue placeholder="Move to..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Not assigned —</SelectItem>
                              {availableGroups.map((groupName) => (
                                <SelectItem key={groupName} value={groupName}>
                                  {groupName}
                                </SelectItem>
                              ))}
                              <SelectItem value="__negative__">🚫 Negative Keywords</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveKeyword(kw.keyword)}
                            className="h-8 w-8 p-0"
                            title="Remove keyword"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Only show error warnings (not cost/credit tracking messages) */}
              {campaignData.warnings && campaignData.warnings.filter(w => w.type === "error").length > 0 && (
                <div className="space-y-1">
                  {campaignData.warnings
                    .filter(w => w.type === "error")
                    .map((warning, idx) => (
                    <div
                      key={idx}
                      className="text-xs p-2 rounded bg-red-500/10 text-red-700 dark:text-red-400"
                    >
                      {warning.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === "mapping" && campaignData && (
            <KeywordAssetMatrix
              keywords={campaignData.keywords}
              assets={assets.filter((a) => selectedAssetIds.includes(a.id))}
              assignedKeywords={assignedKeywords}
              onAssignmentChange={setAssignedKeywords}
            />
          )}

          {currentStep === "groups" && campaignData && (
            <AdGroupOrganizer
              keywords={campaignData.keywords}
              adGroups={organizedAdGroups}
              onAdGroupsChange={setOrganizedAdGroups}
            />
          )}

          {currentStep === "export" && campaignData && (
            <CampaignExport
              campaignData={campaignData}
              assignedKeywords={assignedKeywords}
              adGroups={organizedAdGroups}
              negativeKeywords={negativeKeywords}
              assets={assets}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      {currentStep !== "assets" && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={handlePrevious}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          {currentStep !== "export" && (
            <Button onClick={handleNext} disabled={!campaignData && currentStep === "analysis"}>
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
