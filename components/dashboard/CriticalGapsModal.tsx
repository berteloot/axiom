"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, TrendingDown, Clock, FileX, Star, Sparkles } from "lucide-react";
import { Asset, FunnelStage } from "@/lib/types";
import { format } from "date-fns";
import { CreateContentWorkflow } from "@/components/content/CreateContentWorkflow";

export interface CriticalGap {
  type: "coverage" | "quality" | "expiring" | "missing_score";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  count: number;
  details?: {
    location?: string; // e.g., "CTO - TOFU"
    assets?: Asset[];
    score?: number;
    expiryDate?: string;
  }[];
}

interface CriticalGapsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gaps: CriticalGap[];
  totalAssets: number;
}

const STAGE_DISPLAY: Record<FunnelStage, string> = {
  TOFU_AWARENESS: "TOFU",
  MOFU_CONSIDERATION: "MOFU",
  BOFU_DECISION: "BOFU",
  RETENTION: "RETENTION",
};

function getGapIcon(type: CriticalGap["type"]) {
  switch (type) {
    case "coverage":
      return <FileX className="h-5 w-5" />;
    case "quality":
      return <TrendingDown className="h-5 w-5" />;
    case "expiring":
      return <Clock className="h-5 w-5" />;
    case "missing_score":
      return <Star className="h-5 w-5" />;
  }
}

function getSeverityColor(severity: CriticalGap["severity"]) {
  switch (severity) {
    case "high":
      return "text-red-600 bg-red-50 border-red-200";
    case "medium":
      return "text-orange-600 bg-orange-50 border-orange-200";
    case "low":
      return "text-yellow-600 bg-yellow-50 border-yellow-200";
  }
}

function getQualityScoreExplanation(score: number): {
  level: string;
  color: string;
  explanation: string;
  recommendations: string[];
} {
  if (score >= 90) {
    return {
      level: "Exceptional",
      color: "text-green-600",
      explanation: "This asset has specific ROI stats, customer quotes, clear value props, and is well-structured.",
      recommendations: [
        "Use as a template for creating similar high-quality content",
        "Feature prominently in sales sequences",
        "Consider creating derivative content from this asset"
      ],
    };
  } else if (score >= 70) {
    return {
      level: "Good",
      color: "text-blue-600",
      explanation: "This asset has actionable content with some concrete examples and clear messaging.",
      recommendations: [
        "Add more specific metrics or case studies",
        "Include customer testimonials or quotes",
        "Enhance with more detailed value propositions"
      ],
    };
  } else if (score >= 50) {
    return {
      level: "Average",
      color: "text-yellow-600",
      explanation: "This asset has generic content with limited specifics and needs improvement.",
      recommendations: [
        "Add specific ROI metrics or statistics",
        "Include real customer examples or case studies",
        "Clarify and strengthen value propositions",
        "Add more actionable insights for sales teams"
      ],
    };
  } else if (score >= 30) {
    return {
      level: "Poor",
      color: "text-orange-600",
      explanation: "This asset contains mostly fluff, vague claims, and has low actionability.",
      recommendations: [
        "Rewrite with specific, concrete examples",
        "Add quantifiable metrics and data points",
        "Remove vague marketing language",
        "Focus on solving specific customer problems",
        "Consider significant revision or replacement"
      ],
    };
  } else {
    return {
      level: "Very Poor",
      color: "text-red-600",
      explanation: "This asset has no usable content and contains marketing speak without substance.",
      recommendations: [
        "Consider removing from active use",
        "Complete rewrite with specific, actionable content",
        "Replace with higher-quality alternatives",
        "If keeping, add substantial real-world examples and data"
      ],
    };
  }
}

export function CriticalGapsModal({
  open,
  onOpenChange,
  gaps,
  totalAssets,
}: CriticalGapsModalProps) {
  const totalGaps = gaps.reduce((sum, gap) => sum + gap.count, 0);
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(false);
  const [selectedGap, setSelectedGap] = useState<{
    icp: string;
    stage: FunnelStage;
    painCluster?: string;
  } | null>(null);

  const parseGapLocation = (location: string): {
    icp: string;
    stage: FunnelStage;
  } | null => {
    const parts = location.split(" - ");
    if (parts.length !== 2) return null;
    const [icp, stageStr] = parts;
    const stageMap: Record<string, FunnelStage> = {
      TOFU: "TOFU_AWARENESS",
      MOFU: "MOFU_CONSIDERATION",
      BOFU: "BOFU_DECISION",
      RETENTION: "RETENTION",
    };
    const stage = stageMap[stageStr];
    if (!stage) return null;
    return { icp, stage };
  };

  const handleCreateContent = (location: string) => {
    const gap = parseGapLocation(location);
    if (gap) {
      setSelectedGap(gap);
      setIsWorkflowOpen(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Critical Gaps Analysis
          </DialogTitle>
          <DialogDescription>
            {totalGaps} critical issue{totalGaps !== 1 ? "s" : ""} identified across {totalAssets} total assets
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {gaps.map((gap, index) => (
            <Card key={index} className="border-2">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${getSeverityColor(gap.severity)}`}>
                      {getGapIcon(gap.type)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{gap.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {gap.description}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={getSeverityColor(gap.severity)}
                  >
                    {gap.count} {gap.count === 1 ? "issue" : "issues"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {gap.details && gap.details.length > 0 && (
                  <div className="space-y-3">
                    {gap.type === "quality" && (
                      <div className="space-y-3">
                        {gap.details.slice(0, 10).map((detail, idx) => {
                          if (!detail.assets || detail.assets.length === 0) return null;
                          const asset = detail.assets[0];
                          const score = detail.score || asset.contentQualityScore || 0;
                          const explanation = getQualityScoreExplanation(score);

                          return (
                            <div
                              key={idx}
                              className="border rounded-lg p-4 space-y-3 bg-muted/30"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-sm mb-1">
                                    {asset.title}
                                  </h4>
                                  {detail.location && (
                                    <p className="text-xs text-muted-foreground">
                                      Location: {detail.location}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className={`font-bold text-lg ${explanation.color}`}>
                                    {score}/100
                                  </div>
                                  <div className={`text-xs ${explanation.color}`}>
                                    {explanation.level}
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">
                                    Why this score?
                                  </p>
                                  <p className="text-sm">{explanation.explanation}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">
                                    Recommendations:
                                  </p>
                                  <ul className="text-sm space-y-1 list-disc list-inside">
                                    {explanation.recommendations.map((rec, recIdx) => (
                                      <li key={recIdx} className="text-muted-foreground">
                                        {rec}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {gap.details.length > 10 && (
                          <p className="text-xs text-muted-foreground text-center pt-2">
                            ... and {gap.details.length - 10} more asset{gap.details.length - 10 !== 1 ? "s" : ""} with quality issues
                          </p>
                        )}
                      </div>
                    )}

                    {gap.type === "expiring" && (
                      <div className="space-y-2">
                        {gap.details.slice(0, 10).map((detail, idx) => {
                          if (!detail.assets || detail.assets.length === 0) return null;
                          const asset = detail.assets[0];

                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                            >
                              <div className="flex-1">
                                <h4 className="font-semibold text-sm">{asset.title}</h4>
                                {detail.location && (
                                  <p className="text-xs text-muted-foreground">
                                    {detail.location}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                {detail.expiryDate && (
                                  <div className="text-sm font-medium">
                                    {format(new Date(detail.expiryDate), "MMM d, yyyy")}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {gap.details.length > 10 && (
                          <p className="text-xs text-muted-foreground text-center pt-2">
                            ... and {gap.details.length - 10} more asset{gap.details.length - 10 !== 1 ? "s" : ""} expiring soon
                          </p>
                        )}
                      </div>
                    )}

                    {gap.type === "coverage" && (
                      <div className="space-y-2">
                        {gap.details.slice(0, 20).map((detail, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                          >
                            <span className="text-sm font-medium">
                              {detail.location || "Unknown location"}
                            </span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                No assets
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => detail.location && handleCreateContent(detail.location)}
                                className="h-7 text-xs"
                              >
                                <Sparkles className="h-3 w-3 mr-1" />
                                Create
                              </Button>
                            </div>
                          </div>
                        ))}
                        {gap.details.length > 20 && (
                          <p className="text-xs text-muted-foreground text-center pt-2">
                            ... and {gap.details.length - 20} more empty cells
                          </p>
                        )}
                      </div>
                    )}

                    {gap.type === "missing_score" && (
                      <div className="space-y-2">
                        {gap.details.slice(0, 10).map((detail, idx) => {
                          if (!detail.assets || detail.assets.length === 0) return null;
                          const asset = detail.assets[0];

                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                            >
                              <div className="flex-1">
                                <h4 className="font-semibold text-sm">{asset.title}</h4>
                                {detail.location && (
                                  <p className="text-xs text-muted-foreground">
                                    {detail.location}
                                  </p>
                                )}
                              </div>
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                Not analyzed
                              </Badge>
                            </div>
                          );
                        })}
                        {gap.details.length > 10 && (
                          <p className="text-xs text-muted-foreground text-center pt-2">
                            ... and {gap.details.length - 10} more asset{gap.details.length - 10 !== 1 ? "s" : ""} without scores
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {gaps.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-lg font-medium mb-2">No critical gaps found!</p>
              <p className="text-sm">Your asset library is in great shape.</p>
            </div>
          )}
        </div>
      </DialogContent>

      <CreateContentWorkflow
        open={isWorkflowOpen}
        onOpenChange={(open) => {
          setIsWorkflowOpen(open);
          if (!open) {
            // Reset selected gap when workflow closes
            setSelectedGap(null);
          }
        }}
        initialGap={selectedGap || undefined}
      />
    </Dialog>
  );
}
