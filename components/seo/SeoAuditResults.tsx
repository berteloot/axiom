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

// Helper to extract score value - handles both old format (number) and new format ({score, confidence})
function getScoreValue(score: number | { score: number; confidence: string } | undefined): number {
  if (score === undefined || score === null) return 0;
  if (typeof score === "number") return score;
  if (typeof score === "object" && "score" in score) return score.score;
  return 0;
}

function getScoreColor(score: number | { score: number; confidence: string } | undefined): string {
  const value = getScoreValue(score);
  if (value >= 80) return "text-green-600";
  if (value >= 60) return "text-blue-600";
  if (value >= 40) return "text-yellow-600";
  return "text-red-600";
}

function getScoreBgColor(score: number | { score: number; confidence: string } | undefined): string {
  const value = getScoreValue(score);
  if (value >= 80) return "bg-green-50 border-green-200";
  if (value >= 60) return "bg-blue-50 border-blue-200";
  if (value >= 40) return "bg-yellow-50 border-yellow-200";
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

function getConfidenceColor(confidence: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high":
      return "text-green-600 bg-green-50";
    case "medium":
      return "text-yellow-600 bg-yellow-50";
    case "low":
      return "text-orange-600 bg-orange-50";
  }
}

function getObservationTypeColor(type: "observed" | "inferred" | "cannot_determine"): string {
  switch (type) {
    case "observed":
      return "bg-green-100 text-green-800 border-green-300";
    case "inferred":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "cannot_determine":
      return "bg-gray-100 text-gray-800 border-gray-300";
  }
}

function getScoreConfidence(score: number | { score: number; confidence: string } | undefined): string | null {
  if (score === undefined || score === null) return null;
  return typeof score === "number" ? null : score.confidence;
}

export function SeoAuditResults({ result, url }: SeoAuditResultsProps) {
  const [copied, setCopied] = useState(false);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
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

      {/* Data Quality Indicator */}
      {result.data_quality && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              Data Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className={result.data_quality.html_available ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}>
                HTML: {result.data_quality.html_available ? "Available" : "Unavailable"}
              </Badge>
              <Badge variant="outline" className={result.data_quality.dom_parse_success ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}>
                DOM Parse: {result.data_quality.dom_parse_success ? "Success" : "Failed"}
              </Badge>
              {result.data_quality.content_truncated && (
                <Badge variant="outline" className="bg-yellow-50 border-yellow-200">
                  Content Truncated
                </Badge>
              )}
              <Badge variant="outline">
                Content: {(result.data_quality.jina_content_length / 1000).toFixed(1)}k chars
              </Badge>
            </div>
            {result.data_quality.limitations && result.data_quality.limitations.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ {result.data_quality.limitations.join("; ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Extractability</CardTitle>
            <Search className={`h-4 w-4 ${getScoreColor(result.scores.extractability)}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(result.scores.extractability)}`}>
              {getScoreValue(result.scores.extractability)}
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
              {getScoreValue(result.scores.structure)}
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
              {getScoreValue(result.scores.trust)}
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
              {getScoreValue(result.scores.internal_discovery)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Internal linking quality
            </p>
          </CardContent>
        </Card>

        {/* Only show Answer Block if available (new schema) */}
        {result.scores.answer_block && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Answer Block</CardTitle>
              <TrendingUp className={`h-4 w-4 ${getScoreColor(result.scores.answer_block)}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(result.scores.answer_block)}`}>
                {getScoreValue(result.scores.answer_block)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                First 150-250 words value
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Answer Block Analysis */}
      {result.answer_block_analysis && (
        <Card className={`border-l-4 ${
          result.answer_block_analysis.answer_quality === "excellent" ? "border-l-green-500 bg-green-50/50" :
          result.answer_block_analysis.answer_quality === "good" ? "border-l-blue-500 bg-blue-50/50" :
          result.answer_block_analysis.answer_quality === "needs_improvement" ? "border-l-yellow-500 bg-yellow-50/50" :
          "border-l-red-500 bg-red-50/50"
        }`}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Answer Block Analysis
                </CardTitle>
                <CardDescription className="mt-1">
                  AI systems extract content from the first 150-250 words. This analysis evaluates if your page provides immediate value.
                </CardDescription>
              </div>
              <Badge className={
                result.answer_block_analysis.answer_quality === "excellent" ? "bg-green-100 text-green-800" :
                result.answer_block_analysis.answer_quality === "good" ? "bg-blue-100 text-blue-800" :
                result.answer_block_analysis.answer_quality === "needs_improvement" ? "bg-yellow-100 text-yellow-800" :
                "bg-red-100 text-red-800"
              }>
                {result.answer_block_analysis.answer_quality.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-full ${result.answer_block_analysis.has_answer_block ? "bg-green-100" : "bg-red-100"}`}>
                  {result.answer_block_analysis.has_answer_block ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">Answer Block Present</p>
                  <p className="text-xs text-muted-foreground">
                    {result.answer_block_analysis.has_answer_block ? "Yes" : "No"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-full ${result.answer_block_analysis.primary_query_addressed ? "bg-green-100" : "bg-yellow-100"}`}>
                  {result.answer_block_analysis.primary_query_addressed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">Query Addressed</p>
                  <p className="text-xs text-muted-foreground">
                    {result.answer_block_analysis.primary_query_addressed ? "Yes" : "No"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-blue-100">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Word Count</p>
                  <p className="text-xs text-muted-foreground">
                    {result.answer_block_analysis.answer_block_word_count} words
                    {result.answer_block_analysis.answer_block_word_count >= 150 && result.answer_block_analysis.answer_block_word_count <= 250 
                      ? " ✓" 
                      : result.answer_block_analysis.answer_block_word_count < 150 
                        ? " (target: 150-250)" 
                        : " (could be more concise)"}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Current Introduction Summary:</h4>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                {result.answer_block_analysis.current_intro_summary}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Why This Matters:</h4>
              <p className="text-sm text-muted-foreground">
                {result.answer_block_analysis.rationale}
              </p>
            </div>

            {/* Search Queries from DataForSEO */}
            {result.search_queries && result.search_queries.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Search className="h-4 w-4 text-brand-blue" />
                  Related Search Queries
                  <Badge variant="outline" className="text-[10px]">DataForSEO</Badge>
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Real search data showing what users search for. Prioritize answering high-volume queries in your content.
                </p>
                <div className="space-y-2">
                  {result.search_queries.slice(0, 8).map((query, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                        query.isQuestion ? "bg-purple-50 border border-purple-200" : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                        <span className={`truncate ${query.isQuestion ? "text-purple-700 font-medium" : ""}`}>
                          {query.query}
                        </span>
                        {query.isQuestion && (
                          <Badge className="bg-purple-100 text-purple-700 text-[9px] shrink-0">Question</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-xs font-medium">
                          {query.searchVolume.toLocaleString()}/mo
                        </span>
                        {query.cpc > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ${query.cpc.toFixed(2)} CPC
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {result.search_queries.filter(q => q.isQuestion).length > 0 && (
                  <p className="text-xs text-purple-600 mt-2">
                    💡 Question queries are highlighted - these are ideal for answer blocks and FAQ sections.
                  </p>
                )}
              </div>
            )}

            {result.answer_block_analysis.suggested_answer_block && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-brand-blue" />
                    Suggested Answer Block
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(result.answer_block_analysis.suggested_answer_block!);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="h-7 text-xs"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                  <p className="text-sm whitespace-pre-line">
                    {result.answer_block_analysis.suggested_answer_block}
                  </p>
                </div>
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                        Where to Place This:
                      </h5>
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        {result.answer_block_analysis.placement_recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="recommendations" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="issues">Top Issues</TabsTrigger>
          <TabsTrigger value="outline">Outline</TabsTrigger>
          <TabsTrigger value="schema">Schema</TabsTrigger>
          {/* Brand tab temporarily removed - code kept below for future review */}
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
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={getPriorityColor(rec.priority)}>
                          {rec.priority}
                        </Badge>
                        {rec.observation_type && (
                          <Badge className={getObservationTypeColor(rec.observation_type)}>
                            {rec.observation_type.replace("_", " ")}
                          </Badge>
                        )}
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
                    {rec.code_example && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold">Code Example:</h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyCode(rec.code_example!, idx)}
                            className="h-7 text-xs"
                          >
                            {copiedCodeIndex === idx ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                        {rec.placement_instructions && (
                          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md">
                            <div className="flex items-start gap-2">
                              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                              <div className="flex-1">
                                <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                                  Where to Paste This Code:
                                </h5>
                                <div className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-line">
                                  {rec.placement_instructions}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="border rounded-md bg-muted/50 p-3 overflow-x-auto">
                          <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                            {rec.code_example}
                          </pre>
                        </div>
                      </div>
                    )}
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
                    <div className="flex flex-col gap-1 items-end">
                      <Badge variant="outline" className={getImpactColor(issue.impact)}>
                        {issue.impact}
                      </Badge>
                      {issue.observation_type && (
                        <Badge className={`text-[10px] ${getObservationTypeColor(issue.observation_type)}`}>
                          {issue.observation_type.replace("_", " ")}
                        </Badge>
                      )}
                    </div>
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
                      {heading.rationale && (
                        <p className="text-xs text-blue-600 mt-1 italic">{heading.rationale}</p>
                      )}
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
                        {module.rationale && (
                          <p className="text-xs text-blue-600 mt-1 italic">{module.rationale}</p>
                        )}
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
                    <div className="flex gap-2">
                      {schema.observation_type && (
                        <Badge className={`text-[10px] ${getObservationTypeColor(schema.observation_type)}`}>
                          {schema.observation_type.replace("_", " ")}
                        </Badge>
                      )}
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
