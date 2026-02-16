"use client";

import React, { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Search,
  Download,
  Upload,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveAs } from "file-saver";
import { parseResearchCSV, type ResearchCSVRow } from "@/lib/signal-research/parse-csv";
import type { ResearchOutput } from "@/lib/signal-research/types";

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass = inputClass + " min-h-[80px] resize-y";
const labelClass = "text-muted-foreground text-sm";

const STRENGTH_COLORS: Record<string, string> = {
  STRONG: "bg-green-500/20 text-green-800",
  MODERATE: "bg-yellow-500/20 text-yellow-800",
  WEAK: "bg-orange-500/20 text-orange-800",
  NONE: "bg-red-500/20 text-red-800",
};

export function SignalResearchGenerator() {
  const [researchPrompt, setResearchPrompt] = useState("");
  const [industry, setIndustry] = useState("");
  const [companies, setCompanies] = useState<ResearchCSVRow[]>([]);
  const [output, setOutput] = useState<ResearchOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseResearchCSV(text);
      e.target.value = "";
      if (rows.length === 0) {
        setError(
          "No valid companies found. Use columns: Company, Email Domain, or Industry."
        );
        return;
      }
      setError(null);
      setCompanies(rows);
      setOutput(null);
    };
    reader.readAsText(file, "UTF-8");
  };

  const addCompanyManually = () => {
    setCompanies((prev) => [...prev, { company: "New company", industry }]);
  };

  const removeCompany = (index: number) => {
    setCompanies((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCompany = (index: number, field: keyof ResearchCSVRow, value: string) => {
    setCompanies((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const canGenerate =
    researchPrompt.trim().length > 0 && companies.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setError(null);
    setOutput(null);
    setIsLoading(true);
    try {
      const toResearch = companies.slice(0, 8);
      const res = await fetch("/api/signal-research/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: toResearch.map((c) => ({
            company: c.company.trim(),
            domain: c.domain?.trim() || undefined,
            industry: c.industry?.trim() || industry.trim() || undefined,
          })),
          researchPrompt: researchPrompt.trim(),
          industry: industry.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to run research.");
        return;
      }
      setOutput(data.output);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!output) return;
    setIsExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/signal-research/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ output }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export failed.");
        return;
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `Signal_Research_${Date.now()}.xlsx`;
      saveAs(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const scoreToStatus = (s: number) =>
    s >= 8 ? "Hot" : s >= 6 ? "Warm" : s >= 4 ? "Nurture" : "Low";

  const sortedCompanies = output
    ? [...output.companies].sort((a, b) => b.overallScore - a.overallScore)
    : [];

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      <aside className="w-full lg:w-96 shrink-0">
        <Card className="border border-border bg-card text-card-foreground shadow-md">
          <CardHeader>
            <CardTitle className="text-foreground text-base">
              Research focus & companies
            </CardTitle>
            <CardDescription>
              Define what to research (e.g. SAP transformation, AI adoption, cloud migration). Then add companies via CSV or manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="prompt" className={labelClass}>
                Research focus *
              </Label>
              <Textarea
                id="prompt"
                placeholder="e.g. SAP S/4HANA migration, AI/ML adoption, digital transformation"
                value={researchPrompt}
                onChange={(e) => setResearchPrompt(e.target.value)}
                className={textareaClass}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="industry" className={labelClass}>
                Industry (optional)
              </Label>
              <Input
                id="industry"
                placeholder="e.g. Manufacturing, Healthcare, Retail"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <Label className={labelClass}>Companies</Label>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCSVUpload}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => csvInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Upload CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCompanyManually}
                >
                  Add company
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                CSV: Company, Email Domain, Industry. Max 8 companies per run (rate limit).
              </p>
              {companies.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1 rounded border p-2">
                  {companies.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 rounded bg-muted/50 px-2 py-1 text-sm"
                    >
                      <Input
                        value={c.company}
                        onChange={(e) => updateCompany(i, "company", e.target.value)}
                        className="h-7 text-sm border-0 bg-transparent px-1"
                        placeholder="Company"
                      />
                      <Input
                        value={c.domain ?? ""}
                        onChange={(e) => updateCompany(i, "domain", e.target.value)}
                        className="h-7 text-sm border-0 bg-transparent px-1 flex-1 min-w-0"
                        placeholder="Domain"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeCompany(i)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || !canGenerate}
              className="gap-2 bg-brand-blue hover:bg-brand-dark-blue text-white w-full mt-4 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Researching…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" /> Run research ({Math.min(companies.length, 8)}
                  {companies.length > 8 ? ` of ${companies.length}` : ""} companies)
                </>
              )}
            </Button>
            {!canGenerate && (
              <p className="text-xs text-muted-foreground">
                Add research focus and at least one company.
              </p>
            )}
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      </aside>

      <main className="flex-1 min-w-0 space-y-6">
        <div className="rounded-xl bg-brand-dark-blue px-6 py-5 text-white shadow-lg">
          <h1 className="flex items-center gap-2 text-xl font-bold font-roboto-condensed">
            <Search className="h-6 w-6" />
            ABM Research
          </h1>
          <p className="mt-1 text-sm text-white/90">
            Upload a CSV, define what to research, get results in the table below, and download to Excel.
          </p>
        </div>

        {output && (
          <Card className="border border-border bg-card text-card-foreground shadow-md">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-foreground">Research results</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={isExporting}
                  className="gap-2 w-fit"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isExporting ? "Exporting…" : "Export Excel"}
                </Button>
              </div>
              <CardDescription>
                Focus: {output.researchFocus}
                {output.industry && ` · Industry: ${output.industry}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead className="w-16">Score</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead>Opportunity</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCompanies.map((c, i) => (
                    <React.Fragment key={c.company}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedCompany(
                            expandedCompany === c.company ? null : c.company
                          )
                        }
                      >
                        <TableCell className="font-medium">{i + 1}</TableCell>
                        <TableCell className="font-medium">{c.company}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.industry ?? "—"}
                        </TableCell>
                        <TableCell>{c.overallScore}/10</TableCell>
                        <TableCell>
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              scoreToStatus(c.overallScore) === "Hot"
                                ? "bg-red-500/20 text-red-800"
                                : scoreToStatus(c.overallScore) === "Warm"
                                  ? "bg-orange-500/20 text-orange-800"
                                  : scoreToStatus(c.overallScore) === "Nurture"
                                    ? "bg-yellow-500/20 text-yellow-800"
                                    : "bg-slate-500/20 text-slate-800"
                            }`}
                          >
                            {scoreToStatus(c.overallScore)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {c.salesOpportunity ?? "—"}
                        </TableCell>
                        <TableCell>
                          {expandedCompany === c.company ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedCompany === c.company && (
                        <TableRow key={`${c.company}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/20">
                            <div className="space-y-3 py-2">
                              {c.keyEvidence && (
                                <p className="text-sm">
                                  <span className="font-medium text-muted-foreground">
                                    Evidence:
                                  </span>{" "}
                                  {c.keyEvidence}
                                </p>
                              )}
                              <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">
                                  Signals
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {c.signals.map((s, si) => (
                                    <span
                                      key={si}
                                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                        STRENGTH_COLORS[s.strength] ?? "bg-muted"
                                      }`}
                                    >
                                      {s.category}: {s.strength}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
