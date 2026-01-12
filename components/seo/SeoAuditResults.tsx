"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  FileText,
  Link as LinkIcon,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Shield,
  Network,
  Sparkles,
  ExternalLink,
  Copy,
  Download,
  Info,
} from "lucide-react";
import { SeoAuditResult } from "@/lib/ai/seo-audit";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SeoAuditResultsProps {
  result: SeoAuditResult;
  url: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-50 border-green-200";
  if (score >= 60) return "bg-blue-50 border-blue-200";
  if (score >= 40) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

function getPriorityColor(priority: "P0" | "P1" | "P2"): string {
  switch (priority) {
    case "P0":
      return "bg-red-100 text-red-800 border-red-300";
    case "P1":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "P2":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
  }
}

function getImpactColor(impact: "high" | "medium" | "low"): string {
  switch (impact) {
    case "high":
      return "text-red-600";
    case "medium":
      return "text-orange-600";
    case "low":
      return "text-yellow-600";
  }
}

export function SeoAuditResults({ result, url }: SeoAuditResultsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCsv = () => {
    // Convert recommendations to CSV
    const csvRows = [
      ["Priority", "Title", "Rationale", "Expected Effort", "Expected Impact", "Implementation Steps"].join(","),
      ...result.recommendations.map((rec) =>
        [
          rec.priority,
          `"${rec.title.replace(/"/g, '""')}"`,
          `"${rec.rationale.replace(/"/g, '""')}"`,
          rec.expected_effort,
          rec.expected_impact,
          `"${rec.implementation_steps.join("; ").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ];
    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `seo-audit-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-dark-blue">SEO Structure Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {result.page_title || "Page Analysis"} • {url}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyJson}>
            <Copy className="h-4 w-4 mr-2" />
            {copied ? "Copied!" : "Copy JSON"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Overall Score Card */}
      <Card className={getScoreBgColor(result.scores.overall)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Overall Score</CardTitle>
              <CardDescription>AI Extractability & Structure Assessment</CardDescription>
            </div>
            <div className={`text-4xl font-bold ${getScoreColor(result.scores.overall)}`}>
              {result.scores.overall}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={result.scores.overall} className="h-2" />
        </CardContent>
      </Card>

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Extractability</CardTitle>
            <Search className={`h-4 w-4 ${getScoreColor(result.scores.extractability)}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(result.scores.extractability)}`}>
              {result.scores.extractability}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              How easily AI can extract content
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Structure</CardTitle>
            <FileText className={`h-4 w-4 ${getScoreColor(result.scores.structure)}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(result.scores.structure)}`}>
              {result.scores.structure}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Page organization quality
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trust</CardTitle>
            <Shield className={`h-4 w-4 ${getScoreColor(result.scores.trust)}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(result.scores.trust)}`}>
              {result.scores.trust}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Authority & credibility signals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Internal Discovery</CardTitle>
            <Network className={`h-4 w-4 ${getScoreColor(result.scores.internal_discovery)}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(result.scores.internal_discovery)}`}>
              {result.scores.internal_discovery}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Internal linking quality
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="recommendations" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="issues">Top Issues</TabsTrigger>
          <TabsTrigger value="outline">Outline</TabsTrigger>
          <TabsTrigger value="schema">Schema</TabsTrigger>
          <TabsTrigger value="brand">Brand</TabsTrigger>
        </TabsList>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Actionable Recommendations</h2>
            <Badge variant="secondary">{result.recommendations.length} items</Badge>
          </div>

          <div className="space-y-4">
            {result.recommendations.map((rec, idx) => (
              <Card key={idx} className="border-l-4" style={{ borderLeftColor: rec.priority === "P0" ? "#ef4444" : rec.priority === "P1" ? "#f97316" : "#eab308" }}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getPriorityColor(rec.priority)}>
                          {rec.priority}
                        </Badge>
                        <Badge variant="outline">{rec.expected_effort}</Badge>
                        <Badge variant="outline" className={getImpactColor(rec.expected_impact)}>
                          {rec.expected_impact} impact
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{rec.title}</CardTitle>
                      <CardDescription className="mt-2">{rec.rationale}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Implementation Steps:</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        {rec.implementation_steps.map((step, stepIdx) => (
                          <li key={stepIdx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                    {rec.references.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">References:</h4>
                        <div className="flex flex-wrap gap-2">
                          {rec.references.map((ref, refIdx) => (
                            <Badge key={refIdx} variant="outline" className="text-xs">
                              {ref.type}: {ref.value.substring(0, 30)}...
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Top Issues Tab */}
        <TabsContent value="issues" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Top Issues</h2>
            <Badge variant="secondary">{result.top_issues.length} issues</Badge>
          </div>

          <div className="space-y-3">
            {result.top_issues.map((issue, idx) => (
              <Card key={idx} className={getImpactColor(issue.impact) === "text-red-600" ? "border-l-4 border-red-500" : getImpactColor(issue.impact) === "text-orange-600" ? "border-l-4 border-orange-500" : "border-l-4 border-yellow-500"}>
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 ${getImpactColor(issue.impact)}`} />
                    <div className="flex-1">
                      <CardTitle className="text-base">{issue.issue}</CardTitle>
                      <CardDescription className="mt-1">{issue.evidence}</CardDescription>
                    </div>
                    <Badge variant="outline" className={getImpactColor(issue.impact)}>
                      {issue.impact}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Proposed Outline Tab */}
        <TabsContent value="outline" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Proposed Page Outline</h2>
            <Badge variant="secondary">{result.proposed_outline.length} headings</Badge>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {result.proposed_outline.map((heading, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    style={{ paddingLeft: `${(parseInt(heading.level.charAt(1)) - 1) * 1.5 + 0.75}rem` }}
                  >
                    <Badge variant="outline" className="mt-0.5">
                      {heading.level}
                    </Badge>
                    <div className="flex-1">
                      <p className="font-medium">{heading.text}</p>
                      {heading.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{heading.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {result.suggested_modules.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Suggested Content Modules</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {result.suggested_modules.map((module, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 border rounded-lg">
                      <Sparkles className="h-4 w-4 mt-0.5 text-brand-blue" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{module.module}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Place: {module.where}
                        </p>
                        <ul className="list-disc list-inside text-xs text-muted-foreground mt-2 space-y-1">
                          {module.what_to_include.slice(0, 2).map((item, itemIdx) => (
                            <li key={itemIdx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Schema Recommendations Tab */}
        <TabsContent value="schema" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Schema.org Recommendations</h2>
            <Badge variant="secondary">{result.schema_recommendations.length} recommendations</Badge>
          </div>

          <div className="space-y-3">
            {result.schema_recommendations.map((schema, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{schema.schema_type}</CardTitle>
                    <Badge
                      variant={
                        schema.action === "add"
                          ? "default"
                          : schema.action === "fix"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {schema.action}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{schema.notes}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {result.internal_linking_suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Internal Linking Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.internal_linking_suggestions.map((link, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 border rounded-lg">
                      <LinkIcon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{link.anchor_text}</p>
                        <p className="text-xs text-muted-foreground">{link.target_page_idea}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium">Place:</span> {link.placement_hint}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Brand Consistency Tab */}
        <TabsContent value="brand" className="space-y-4">
          {result.brand_consistency ? (
            <>
              <Card className={getScoreBgColor(result.brand_consistency.overall_score)}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Brand Consistency Score</CardTitle>
                      <CardDescription>How accurately AI platforms represent your brand</CardDescription>
                    </div>
                    <div className={`text-4xl font-bold ${getScoreColor(result.brand_consistency.overall_score)}`}>
                      {result.brand_consistency.overall_score}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress value={result.brand_consistency.overall_score} className="h-2" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Average accuracy across {result.brand_consistency.platform_results.length} AI platform(s)
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {result.brand_consistency.platform_results.map((platform, idx) => (
                  <Card key={idx}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg capitalize">{platform.platform}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge className={getScoreBgColor(platform.accuracy_score)}>
                            {platform.accuracy_score}/100
                          </Badge>
                          <Badge variant="outline">{platform.tone_match}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-2">AI Description:</h4>
                        <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                          {platform.brand_description}
                        </p>
                      </div>

                      {platform.key_facts_present.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Accurately Represented:
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {platform.key_facts_present.map((fact, factIdx) => (
                              <Badge key={factIdx} variant="outline" className="bg-green-50 border-green-200">
                                {fact}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {platform.key_facts_missing.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                            Missing or Incorrect:
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {platform.key_facts_missing.map((fact, factIdx) => (
                              <Badge key={factIdx} variant="outline" className="bg-orange-50 border-orange-200">
                                {fact}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {platform.misstatements.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            Misstatements:
                          </h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {platform.misstatements.map((stmt, stmtIdx) => (
                              <li key={stmtIdx}>{stmt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {platform.recommendations.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Recommendations:</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                            {platform.recommendations.map((rec, recIdx) => (
                              <li key={recIdx}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {result.brand_consistency.summary && (
                <Card>
                  <CardHeader>
                    <CardTitle>Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.brand_consistency.summary.critical_gaps.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Critical Gaps:</h4>
                        <div className="flex flex-wrap gap-2">
                          {result.brand_consistency.summary.critical_gaps.map((gap, idx) => (
                            <Badge key={idx} variant="destructive">{gap}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.brand_consistency.summary.top_recommendations.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Top Recommendations:</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                          {result.brand_consistency.summary.top_recommendations.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Info className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Brand consistency analysis not included in this audit.
                    <br />
                    Enable it by setting <code className="text-xs bg-muted px-1 py-0.5 rounded">include_brand_consistency: true</code>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Errors (if any) */}
      {result.errors && result.errors.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-5 w-5" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.errors.map((error, idx) => (
                <li key={idx} className="text-sm text-yellow-800">
                  <span className="font-medium">{error.stage}:</span> {error.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
