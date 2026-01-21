"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectCombobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, X } from "lucide-react";
import { SeoAuditResults } from "./SeoAuditResults";
import { AiSeoBestPractices } from "./AiSeoBestPractices";
import { SeoAuditResult } from "@/lib/ai/seo-audit";
import { BRAND_VOICES } from "@/lib/constants/brand-voices";
import { ALL_JOB_TITLES } from "@/lib/job-titles";

interface SeoAuditFormProps {
  accountId?: string;
}

export function SeoAuditForm({ accountId }: SeoAuditFormProps) {
  const [url, setUrl] = useState("");
  const [pageType, setPageType] = useState<string>("none");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [targetAudience, setTargetAudience] = useState<string[]>([]);
  const [brandVoice, setBrandVoice] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeoAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/seo-audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          page_type: pageType === "none" ? undefined : pageType,
          target_keyword: targetKeyword || undefined,
          // API expects comma-separated strings for these fields (see auditRequestSchema)
          target_audience: targetAudience.length > 0 ? targetAudience.join(", ") : undefined,
          brand_voice: brandVoice.length > 0 ? brandVoice.join(", ") : undefined,
          include_brand_consistency: false, // Brand consistency feature temporarily disabled
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to perform SEO audit";
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // Non-JSON error response (HTML, plain text, etc.)
          const text = await response.text();
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.success && data.data) {
        setResult(data.data);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <AiSeoBestPractices />
      <Card>
        <CardHeader>
          <CardTitle>AI SEO Structure Audit</CardTitle>
          <CardDescription>
            Audit any public URL for structure, extractability, and AI discoverability. Get actionable recommendations to improve your page's visibility in AI search results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pageType">Page Type (Optional)</Label>
                <Select value={pageType} onValueChange={setPageType} disabled={loading}>
                  <SelectTrigger id="pageType">
                    <SelectValue placeholder="Select page type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Auto-detect)</SelectItem>
                    <SelectItem value="blog">Blog</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="landing">Landing Page</SelectItem>
                    <SelectItem value="docs">Documentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetKeyword">Target Keyword (Optional)</Label>
                <Input
                  id="targetKeyword"
                  type="text"
                  placeholder="e.g., 'cloud migration'"
                  value={targetKeyword}
                  onChange={(e) => setTargetKeyword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="targetAudience">ICP Target (Optional)</Label>
                <MultiSelectCombobox
                  options={ALL_JOB_TITLES}
                  value={targetAudience}
                  onChange={setTargetAudience}
                  placeholder="Select or create job titles..."
                  searchPlaceholder="Search job titles..."
                  emptyText="No job titles found."
                  creatable={true}
                  createText="Create"
                  disabled={loading}
                />
                {targetAudience.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {targetAudience.map((audience, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-sm flex items-center gap-1 pr-1"
                      >
                        {audience}
                        <button
                          type="button"
                          onClick={() => setTargetAudience(targetAudience.filter((_, i) => i !== idx))}
                          className="ml-0.5 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                          aria-label={`Remove ${audience}`}
                          disabled={loading}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="brandVoice">Brand Voice (Optional)</Label>
                <MultiSelectCombobox
                  options={[...BRAND_VOICES]}
                  value={brandVoice}
                  onChange={setBrandVoice}
                  placeholder="Select brand voice attributes..."
                  searchPlaceholder="Search brand voices..."
                  disabled={loading}
                />
                {brandVoice.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {brandVoice.map((voice, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-sm flex items-center gap-1 pr-1"
                      >
                        {voice}
                        <button
                          type="button"
                          onClick={() => setBrandVoice(brandVoice.filter((_, i) => i !== idx))}
                          className="ml-0.5 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                          aria-label={`Remove ${voice}`}
                          disabled={loading}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <Button type="submit" disabled={loading || !url} className="w-full sm:w-auto">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Run Audit
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && <SeoAuditResults result={result} url={url} />}
    </div>
  );
}
