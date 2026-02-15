"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Bot, Copy, Check, Download, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { saveAs } from "file-saver";
import { parseABMCSV, type CSVAccountRow } from "@/lib/abm/parse-csv";

type ABMResult = {
  accountBrief: {
    companyOverview: string;
    painPoints: string[];
    buyingSignals: string[];
    keyPersonas: string[];
  };
  emailOutreach: {
    subject: string;
    body: string;
  };
  linkedInOutreach: {
    connectionRequest: string;
    followUpMessage: string;
  };
};

export function ABMGenerator() {
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [keyContacts, setKeyContacts] = useState("");
  const [productOrService, setProductOrService] = useState("");
  const [valueProposition, setValueProposition] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    result: ABMResult;
    agentProof?: { backend: string; steps: Array<{ agent: string; model?: string }> };
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [csvRows, setCsvRows] = useState<CSVAccountRow[]>([]);
  const [csvRowIndex, setCsvRowIndex] = useState(0);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const inputClass =
    "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const textareaClass = inputClass + " min-h-[80px] resize-y";
  const labelClass = "text-muted-foreground text-sm";

  // Prefill from brand context
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/brand-context");
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const bc = data.brandContext;
        if (!bc) return;
        setValueProposition((prev) => prev || bc.valueProposition || "");
        setBrandVoice((prev) => prev || (bc.brandVoice?.join(", ") ?? ""));
      } catch {
        // ignore
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const applyRowToForm = (row: CSVAccountRow) => {
    setCompanyName(row.companyName);
    setIndustry(row.industry);
    setTargetRole(row.targetRole);
    setKeyContacts(row.keyContacts);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseABMCSV(text);
      e.target.value = "";
      if (rows.length === 0) {
        setError("No valid accounts found in CSV. Ensure headers: Company, Industry, Target Role, Key Contacts.");
        return;
      }
      setError(null);
      setCsvRows(rows);
      setCsvRowIndex(0);
      applyRowToForm(rows[0]);
      setResult(null);
    };
    reader.readAsText(file, "UTF-8");
  };

  const canGenerate =
    companyName.trim().length > 0 &&
    productOrService.trim().length > 0 &&
    valueProposition.trim().length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/abm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          industry: industry.trim() || undefined,
          targetRole: targetRole.trim() || undefined,
          keyContacts: keyContacts.trim() || undefined,
          productOrService: productOrService.trim(),
          valueProposition: valueProposition.trim(),
          brandVoice: brandVoice.trim() || undefined,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate ABM content.");
        return;
      }
      setResult({ result: data.result, agentProof: data.agentProof });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => setError("Could not copy to clipboard"));
  };

  const handleExportExcel = async () => {
    if (!result) return;
    setIsExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/abm/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: result.result,
          companyName: companyName.trim() || "Account",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export failed.");
        return;
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `ABM_${companyName.replace(/\s+/g, "_")}_${Date.now()}.xlsx`;
      saveAs(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Form */}
      <aside className="w-full lg:w-80 shrink-0">
        <Card className="border border-border bg-card text-card-foreground shadow-md">
          <CardHeader>
            <CardTitle className="text-foreground text-base">
              Target account & your offering
            </CardTitle>
            <CardDescription>
              Fill in the target company and your product to generate personalized ABM content.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* CSV upload */}
            <div className="space-y-2">
              <Label className={labelClass}>Upload CSV</Label>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCSVUpload}
              />
              <div className="flex flex-col sm:flex-row gap-2">
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
                {csvRows.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={csvRowIndex <= 0}
                      onClick={() => {
                        const next = csvRowIndex - 1;
                        setCsvRowIndex(next);
                        applyRowToForm(csvRows[next]);
                        setResult(null);
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Account {csvRowIndex + 1} of {csvRows.length}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={csvRowIndex >= csvRows.length - 1}
                      onClick={() => {
                        const next = csvRowIndex + 1;
                        setCsvRowIndex(next);
                        applyRowToForm(csvRows[next]);
                        setResult(null);
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => {
                        setCsvRows([]);
                        setCsvRowIndex(0);
                        setCompanyName("");
                        setIndustry("");
                        setTargetRole("");
                        setKeyContacts("");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                CSV with columns: Company, Industry, Target Role, Key Contacts
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company" className={labelClass}>Target company name *</Label>
              <Input
                id="company"
                placeholder="e.g. Acme Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="industry" className={labelClass}>Industry</Label>
              <Input
                id="industry"
                placeholder="e.g. SaaS, Healthcare"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role" className={labelClass}>Target role(s)</Label>
              <Input
                id="role"
                placeholder="e.g. VP Sales, CTO"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contacts" className={labelClass}>Key contacts / context</Label>
              <Textarea
                id="contacts"
                placeholder="Any known contacts or context"
                value={keyContacts}
                onChange={(e) => setKeyContacts(e.target.value)}
                className={textareaClass}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="product" className={labelClass}>Your product/service *</Label>
              <Textarea
                id="product"
                placeholder="What you offer"
                value={productOrService}
                onChange={(e) => setProductOrService(e.target.value)}
                className={textareaClass}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vp" className={labelClass}>Value proposition *</Label>
              <Textarea
                id="vp"
                placeholder="Key benefits, outcomes, ROI"
                value={valueProposition}
                onChange={(e) => setValueProposition(e.target.value)}
                className={textareaClass}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="voice" className={labelClass}>Brand voice (optional)</Label>
              <Input
                id="voice"
                placeholder="e.g. Professional, consultative"
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="context" className={labelClass}>Additional context</Label>
              <Textarea
                id="context"
                placeholder="Any extra info for personalization"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                className={textareaClass}
                rows={2}
              />
            </div>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || !canGenerate}
              className="gap-2 bg-brand-blue hover:bg-brand-dark-blue text-white w-full mt-4 disabled:opacity-50"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Generate ABM Content</>
              )}
            </Button>
            {!canGenerate && (
              <p className="text-xs text-muted-foreground">Fill company name, product, and value proposition.</p>
            )}
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
            )}
          </CardContent>
        </Card>
      </aside>

      {/* Results */}
      <main className="flex-1 min-w-0 space-y-6">
        <div className="rounded-xl bg-brand-dark-blue px-6 py-5 text-white shadow-lg">
          <h1 className="flex items-center gap-2 text-xl font-bold font-roboto-condensed">
            <Sparkles className="h-6 w-6" />
            ABM Pro
          </h1>
          <p className="mt-1 text-sm text-white/90">
            Account-based marketing content: research-backed briefs and personalized outreach for sales and marketing.
          </p>
        </div>

        {result && (
          <Card className="border border-border bg-card text-card-foreground shadow-md">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-foreground">Generated content</CardTitle>
                  {result.agentProof && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Bot className="h-4 w-4" />
                      {result.agentProof.backend === "skills-enhanced"
                        ? "Claude Agent Skills"
                        : "Claude"}
                    </div>
                  )}
                </div>
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
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Account Brief */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Account Brief</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Overview</p>
                    <p className="text-foreground whitespace-pre-wrap">{result.result.accountBrief.companyOverview}</p>
                  </div>
                  {result.result.accountBrief.painPoints.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">Pain points</p>
                      <ul className="list-disc pl-5 space-y-1 text-foreground">
                        {result.result.accountBrief.painPoints.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.result.accountBrief.buyingSignals.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">Buying signals</p>
                      <ul className="list-disc pl-5 space-y-1 text-foreground">
                        {result.result.accountBrief.buyingSignals.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.result.accountBrief.keyPersonas.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">Key personas</p>
                      <ul className="list-disc pl-5 space-y-1 text-foreground">
                        {result.result.accountBrief.keyPersonas.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Email outreach</h3>
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground text-sm">{result.result.emailOutreach.subject}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() =>
                        copyToClipboard(
                          `Subject: ${result.result.emailOutreach.subject}\n\n${result.result.emailOutreach.body}`,
                          "email"
                        )
                      }
                    >
                      {copiedField === "email" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      Copy
                    </Button>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{result.result.emailOutreach.body}</p>
                </div>
              </div>

              {/* LinkedIn */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">LinkedIn outreach</h3>
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div>
                    <p className="font-medium text-muted-foreground text-xs mb-1">Connection request</p>
                    <div className="flex justify-between gap-2">
                      <p className="text-sm text-foreground">{result.result.linkedInOutreach.connectionRequest}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() =>
                          copyToClipboard(result.result.linkedInOutreach.connectionRequest, "linkedin-conn")
                        }
                      >
                        {copiedField === "linkedin-conn" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs mb-1">Follow-up message</p>
                    <div className="flex justify-between gap-2">
                      <p className="text-sm text-foreground whitespace-pre-wrap flex-1">
                        {result.result.linkedInOutreach.followUpMessage}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() =>
                          copyToClipboard(result.result.linkedInOutreach.followUpMessage, "linkedin-follow")
                        }
                      >
                        {copiedField === "linkedin-follow" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
