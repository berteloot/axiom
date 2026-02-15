"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Copy, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import { Asset } from "@/lib/types";

interface KeywordWithMatches {
  keyword: string;
  volume: number;
  cpc: number;
  competition: string;
  matchType?: "broad" | "phrase" | "exact";
  estimatedMonthlySpend?: number;
  searchIntent?: {
    main_intent: string;
  };
}

interface PPCampaignData {
  keywords: KeywordWithMatches[];
  metadata: {
    assetCount: number;
    keywordCount: number;
    totalEstimatedMonthlySpend: number;
  };
}

function escapeCsvCell(value: string): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface CampaignExportProps {
  campaignData: PPCampaignData;
  assignedKeywords: Map<string, string>; // keyword -> assetId
  adGroups: Map<string, KeywordWithMatches[]>;
  negativeKeywords?: Set<string>;
  assets: Asset[];
  campaignName?: string;
  onOpenInAdCopy?: () => void;
}

export function CampaignExport({
  campaignData,
  assignedKeywords,
  adGroups,
  negativeKeywords = new Set<string>(),
  assets,
  campaignName = "PPC Campaign",
  onOpenInAdCopy,
}: CampaignExportProps) {
  const handleExportCSV = () => {
    const headers = [
      "Campaign",
      "Ad Group",
      "Keyword",
      "Match Type",
      "Landing Page",
      "Max CPC",
      "Search Volume",
      "Competition",
      "Intent",
      "Est. Monthly Spend",
    ];

    const rows: string[][] = [];

    adGroups.forEach((keywords, groupName) => {
      keywords.forEach((kw) => {
        const assignedAssetId = assignedKeywords.get(kw.keyword);
        const landingPageUrl = "";

        rows.push([
          campaignName,
          groupName,
          kw.keyword,
          kw.matchType || "phrase",
          landingPageUrl,
          kw.cpc.toFixed(2),
          kw.volume.toString(),
          kw.competition,
          kw.searchIntent?.main_intent || "—",
          (kw.estimatedMonthlySpend || 0).toFixed(2),
        ]);
      });
    });

    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ppc-campaign-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const exportData = {
      campaign: {
        name: "PPC Campaign",
        created: new Date().toISOString(),
        metadata: campaignData.metadata,
      },
      adGroups: Array.from(adGroups.entries()).map(([groupName, keywords]) => ({
        name: groupName,
        keywords: keywords.map((kw) => {
          const assignedAssetId = assignedKeywords.get(kw.keyword);
          const asset = assignedAssetId
            ? assets.find((a) => a.id === assignedAssetId)
            : null;

          return {
            keyword: kw.keyword,
            matchType: kw.matchType || "phrase",
            maxCpc: kw.cpc,
            searchVolume: kw.volume,
            competition: kw.competition,
            intent: kw.searchIntent?.main_intent || null,
            estimatedMonthlySpend: kw.estimatedMonthlySpend || 0,
            landingPage: {
              assetId: assignedAssetId || null,
              assetTitle: asset?.title || null,
              assetUrl: null, // S3 URLs are private - configure public landing page URLs
              note: "S3 URLs are private markdown files. Configure public landing page URLs based on your website structure.",
            },
          };
        }),
        estimatedMonthlySpend: keywords.reduce(
          (sum, kw) => sum + (kw.estimatedMonthlySpend || 0),
          0
        ),
      })),
      negativeKeywords: Array.from(negativeKeywords),
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ppc-campaign-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyKeywords = () => {
    const keywordList = Array.from(assignedKeywords.keys()).join(", ");
    navigator.clipboard.writeText(keywordList);
    // Could add toast notification here
  };

  const totalKeywords = Array.from(adGroups.values()).reduce(
    (sum, kw) => sum + kw.length,
    0
  );
  const assignedCount = Array.from(assignedKeywords.keys()).filter((kw) => {
    for (const groupKeywords of adGroups.values()) {
      if (groupKeywords.find((k) => k.keyword === kw)) {
        return true;
      }
    }
    return false;
  }).length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium">Export Campaign</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Download your campaign data to import into Google Ads or other PPC platforms.
        </p>
      </div>

      {/* Campaign Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Ad Groups</div>
              <div className="text-2xl font-bold">{adGroups.size}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Keywords</div>
              <div className="text-2xl font-bold">{totalKeywords}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Keywords Mapped</div>
              <div className="text-2xl font-bold">{assignedCount}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Est. Monthly Spend</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${campaignData.metadata.totalEstimatedMonthlySpend.toFixed(0)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Negative Keywords */}
      {negativeKeywords.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Negative Keywords</CardTitle>
            <CardDescription>
              Keywords to exclude from your campaign ({negativeKeywords.size} total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Array.from(negativeKeywords).map((keyword) => (
                <Badge key={keyword} variant="destructive" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Landing Page URL Note */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="text-base text-yellow-700 dark:text-yellow-400">
            ⚠️ Landing Page URLs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <strong>Important:</strong> The exported CSV has blank landing page URLs. S3 storage URLs are private markdown files and cannot be used as public landing pages.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Before importing into Google Ads, configure landing page URLs based on your website structure (e.g., <code className="text-xs bg-muted px-1 py-0.5 rounded">https://yourwebsite.com/resources/[asset-title]</code>).
          </p>
        </CardContent>
      </Card>

      {/* Ad Copy integration */}
      {onOpenInAdCopy && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Ad copy (Claude)
            </CardTitle>
            <CardDescription>
              Open in Ad Copy Pro to generate RSA headlines & descriptions with your campaign keywords.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onOpenInAdCopy} variant="outline" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Open in Ad Copy Pro
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Export Options */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              CSV Export
            </CardTitle>
            <CardDescription>
              Import directly into Google Ads or Excel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportCSV} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5" />
              JSON Export
            </CardTitle>
            <CardDescription>
              Complete campaign data with all metadata
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportJSON} variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download JSON
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button onClick={handleCopyKeywords} variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Copy All Keywords
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Structure Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Structure Preview</CardTitle>
          <CardDescription>
            Review your ad groups and keywords before exporting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from(adGroups.entries()).map(([groupName, keywords]) => {
              const groupSpend = keywords.reduce(
                (sum, kw) => sum + (kw.estimatedMonthlySpend || 0),
                0
              );
              const mappedCount = keywords.filter((kw) =>
                assignedKeywords.has(kw.keyword)
              ).length;

              return (
                <div key={groupName} className="border rounded-md p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-medium">{groupName}</h4>
                      <div className="text-sm text-muted-foreground">
                        {keywords.length} keywords • {mappedCount} with landing pages • $
                        {groupSpend.toFixed(0)}/mo
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {keywords.slice(0, 10).map((kw, idx) => {
                      const isMapped = assignedKeywords.has(kw.keyword);
                      return (
                        <Badge
                          key={idx}
                          variant={isMapped ? "default" : "outline"}
                          className="text-xs"
                        >
                          {kw.keyword}
                        </Badge>
                      );
                    })}
                    {keywords.length > 10 && (
                      <Badge variant="outline" className="text-xs">
                        +{keywords.length - 10} more
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
