"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Download, Sparkles, ChevronDown, ChevronUp, Bot, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PLATFORMS, type PlatformKey } from "@/lib/ad-copy/platforms";

const TONE_OPTIONS = [
  "Professional & Authoritative",
  "Friendly & Conversational",
  "Urgent & Action-Oriented",
  "Trustworthy & Expert",
  "Bold & Disruptive",
] as const;

function escapeCsvCell(value: string): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function PlatformCard({
  platform,
  onGenerate,
  isLoading,
}: {
  platform: PlatformKey;
  onGenerate: () => void;
  isLoading: boolean;
}) {
  const p = PLATFORMS[platform];
  const fieldSpecs = Object.entries(p.fields)
    .map(([k, s]) => `${s.label}: ${s.default_count} items ↑ ≤${s.max_chars} chars`)
    .join(" • ");
  return (
    <Card key={platform} className="border border-border bg-card text-card-foreground shadow-md">
      <CardHeader>
        <CardTitle className="text-foreground">{p.name}</CardTitle>
        <CardDescription className="text-muted-foreground">{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {fieldSpecs}
        </div>
        <Button
          type="button"
          onClick={onGenerate}
          disabled={isLoading}
          className="gap-2 bg-brand-blue hover:bg-brand-dark-blue"
        >
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Generate {p.name.split(" (")[0]} Copy</>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">Fill in: Brand Name, Product Description, Target Audience, Keywords</p>
      </CardContent>
    </Card>
  );
}

function buildCsvForPlatform(
  platformKey: PlatformKey,
  copy: Record<string, string[]>,
  campaignLabel: string
): string {
  const platform = PLATFORMS[platformKey];
  const headers = platform.csv_columns;
  const rowParts: string[] = [campaignLabel];
  for (const [fieldKey, spec] of Object.entries(platform.fields)) {
    const arr = copy[fieldKey] ?? [];
    for (let i = 0; i < spec.default_count; i++) {
      rowParts.push(arr[i] ?? "");
    }
  }
  return [headers.map(escapeCsvCell).join(","), rowParts.map(escapeCsvCell).join(",")].join("\r\n");
}

export function AdCopyGenerator() {
  const [brandName, setBrandName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState<string>(TONE_OPTIONS[0]);
  const [callToAction, setCallToAction] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [platform, setPlatform] = useState<PlatformKey>("google_ads_rsa");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    platform: PlatformKey;
    copy: Record<string, string[]>;
    agentProof?: {
      backend: string;
      steps: Array<{
        agent: string;
        model: string;
        inputTokens?: number;
        outputTokens?: number;
        timestamp: string;
      }>;
    };
  } | null>(null);

  const keywords = keywordsText
    .split(/[\n,\s;]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  const canGenerate =
    brandName.trim().length > 0 &&
    productDescription.trim().length > 0 &&
    targetAudience.trim().length > 0 &&
    keywords.length > 0;

  const handleGenerate = async () => {
    if (!brandName.trim()) {
      setError("Brand / company name is required.");
      return;
    }
    if (!productDescription.trim()) {
      setError("Product / service description is required.");
      return;
    }
    if (!targetAudience.trim()) {
      setError("Target audience is required.");
      return;
    }
    if (keywords.length === 0) {
      setError("Enter at least one keyword (comma-separated).");
      return;
    }
    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/ad-copy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          brandName: brandName.trim(),
          productDescription: productDescription.trim(),
          targetAudience: targetAudience.trim(),
          keywords,
          toneOfVoice: toneOfVoice || undefined,
          callToAction: callToAction.trim() || undefined,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate ad copy.");
        return;
      }
      setResult({
        platform: data.platform,
        copy: data.copy ?? {},
        agentProof: data.agentProof,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!result) return;
    const campaignLabel = brandName.trim() || "Campaign";
    const csv = buildCsvForPlatform(result.platform, result.copy, campaignLabel);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adcopy-${result.platform}-${campaignLabel.replace(/\s+/g, "-")}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyForFigma = () => {
    if (!result) return;
    const json = JSON.stringify(result.copy, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopiedForFigma(true);
      setTimeout(() => setCopiedForFigma(false), 2000);
    }).catch(() => setError("Could not copy to clipboard"));
  };

  const [proofExpanded, setProofExpanded] = useState(false);
  const [copiedForFigma, setCopiedForFigma] = useState(false);
  const inputClass =
    "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const textareaClass = inputClass + " min-h-[80px] resize-y";
  const labelClass = "text-muted-foreground";

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 min-h-[calc(100vh-6rem)]">
      {/* Left sidebar */}
      <aside className="w-full lg:w-80 shrink-0">
        <Card className="border border-border bg-card text-card-foreground shadow-md">
          <CardHeader>
            <CardTitle className="text-foreground text-base">
              Fill in your campaign details to generate ad copy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="brand" className={labelClass}>Brand / Company Name</Label>
              <Input id="brand" placeholder="e.g. Acme Cloud" value={brandName} onChange={(e) => setBrandName(e.target.value)} className={inputClass} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="product" className={labelClass}>Product / Service Description</Label>
              <Textarea id="product" placeholder="e.g. AI-powered project management tool..." value={productDescription} onChange={(e) => setProductDescription(e.target.value)} rows={3} className={textareaClass} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="audience" className={labelClass}>Target Audience</Label>
              <Input id="audience" placeholder="e.g. SaaS startup founders, 25-45" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} className={inputClass} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="keywords" className={labelClass}>Keywords (comma-separated)</Label>
              <Input id="keywords" placeholder="e.g. project management, team coll..." value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} className={inputClass} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tone" className={labelClass}>Tone of Voice</Label>
              <select
                id="tone"
                value={toneOfVoice}
                onChange={(e) => setToneOfVoice(e.target.value)}
                className={inputClass + " cursor-pointer"}
              >
                {TONE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cta" className={labelClass}>Call to Action</Label>
              <Input id="cta" placeholder="e.g. Start Free Trial, Learn More" value={callToAction} onChange={(e) => setCallToAction(e.target.value)} className={inputClass} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="context" className={labelClass}>Additional Context (optional)</Label>
              <Textarea id="context" placeholder="e.g. 30-day free trial promotion..." value={additionalContext} onChange={(e) => setAdditionalContext(e.target.value)} rows={3} className={textareaClass} />
            </div>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading}
              className="gap-2 bg-brand-blue hover:bg-brand-dark-blue text-white w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Generate Ad Copy</>
              )}
            </Button>
            {!canGenerate && !isLoading && (
              <p className="text-xs text-muted-foreground mt-2" role="status">
                Fill Brand, Product, Target Audience, and Keywords for best results.
              </p>
            )}
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mt-2">{error}</div>
            )}
          </CardContent>
        </Card>
      </aside>

      <main className="flex-1 min-w-0 space-y-6">
        <div className="rounded-xl bg-brand-dark-blue px-6 py-5 text-white shadow-lg">
          <h1 className="flex items-center gap-2 text-2xl font-bold font-roboto-condensed">
            <Sparkles className="h-7 w-7" />
            AdCopy Pro
          </h1>
          <p className="mt-1 text-sm text-white/90">
            AI-powered ad copy generation using Claude Agent Skills &amp; marketing agents. RSA headlines/descriptions
            with CSV export (5–10x faster). Use the Figma plugin for creative variations.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="platform" className={labelClass}>Platform</Label>
            <select
              id="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PlatformKey)}
              className={inputClass + " cursor-pointer max-w-xs"}
            >
              {(Object.keys(PLATFORMS) as PlatformKey[]).map((key) => (
                <option key={key} value={key}>{PLATFORMS[key].name.split(" (")[0]}</option>
              ))}
            </select>
          </div>
          <PlatformCard
            platform={platform}
            onGenerate={handleGenerate}
            isLoading={isLoading}
          />
        </div>

        {result && (
          <Card className="border border-border bg-card text-card-foreground shadow-md">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-foreground">Generated copy</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Review and export for {PLATFORMS[result.platform].name}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-2">
                    <Download className="h-4 w-4" /> Export CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopyForFigma} className="gap-2" title="Copy JSON for Figma Ad Creative Variations plugin">
                    <Palette className="h-4 w-4" /> {copiedForFigma ? "Copied!" : "Copy for Figma"}
                  </Button>
                </div>
              </div>
              {result.agentProof && (
                <div className="mt-4 rounded-lg border border-border bg-muted/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setProofExpanded((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/80 transition-colors"
                  >
                      <span className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Bot className="h-4 w-4" />
                      {result.agentProof.backend === "skills-enhanced"
                        ? "Agent Skills + Code Execution"
                        : "Claude marketing agents"}
                    </span>
                    {proofExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {proofExpanded && (
                    <div className="border-t border-border px-4 py-3 space-y-2">
                      {result.agentProof.steps.map((step, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{step.agent}</span>
                          <span className="text-muted-foreground text-xs">
                            {step.model}
                            {(step.inputTokens != null || step.outputTokens != null) && (
                              <span className="ml-2">
                                ({step.inputTokens ?? 0} in / {step.outputTokens ?? 0} out)
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground pt-1">
                        Backend: {result.agentProof.backend}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(PLATFORMS[result.platform].fields).map(([fieldKey, spec]) => {
                const items = result.copy[fieldKey] ?? [];
                return (
                  <div key={fieldKey}>
                    <h4 className="text-sm font-medium text-foreground mb-2">
                      {spec.label} (max {spec.max_chars} chars)
                    </h4>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-sm text-foreground [&>span:first-of-type]:min-w-0 [&>span:first-of-type]:flex-1"
                        >
                          <Badge variant="secondary" className="shrink-0 w-7 justify-center">
                            {i + 1}
                          </Badge>
                          <span className="break-words">{item}</span>
                          <span className={`shrink-0 ${item.length > spec.max_chars ? "text-destructive" : "text-muted-foreground"}`}>
                            {item.length}/{spec.max_chars}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
