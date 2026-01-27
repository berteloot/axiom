"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronUp, ChevronDown, Copy, Check, Download, FileText, FileSpreadsheet, FileCode } from "lucide-react";
import { FunnelStage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SequenceEmail {
  subject: string;
  body: string;
}

interface SequenceAsset {
  id: string;
  title: string;
  funnelStage: FunnelStage;
  s3Url: string;
  atomicSnippets?: any;
}

interface SequenceData {
  assets: SequenceAsset[];
  emails: SequenceEmail[];
}

interface SequenceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sequence: SequenceData | null;
  onReorder?: (newOrder: number[]) => void;
  onRegenerate?: () => void;
}

const getStageColor = (stage: FunnelStage) => {
  switch (stage) {
    case "TOFU_AWARENESS":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
    case "MOFU_CONSIDERATION":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
    case "BOFU_DECISION":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
    case "RETENTION":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20";
  }
};

const formatStage = (stage: FunnelStage): string => {
  return stage
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

export function SequenceModal({
  open,
  onOpenChange,
  sequence,
  onReorder,
  onRegenerate,
}: SequenceModalProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<number[]>([]);
  const [exportCopied, setExportCopied] = useState<string | null>(null);

  // Initialize local order based on sequence length
  useEffect(() => {
    if (sequence) {
      setLocalOrder(sequence.emails.map((_, idx) => idx));
    }
  }, [sequence]);

  if (!sequence) return null;

  // Use local order state to handle reordering
  const orderedEmails = localOrder.length === sequence.emails.length
    ? localOrder.map((idx) => sequence.emails[idx])
    : sequence.emails;
  const orderedAssets = localOrder.length === sequence.assets.length
    ? localOrder.map((idx) => sequence.assets[idx])
    : sequence.assets;

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    
    const newOrder = [...localOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setLocalOrder(newOrder);
    
    if (onReorder) {
      onReorder(newOrder);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index === orderedEmails.length - 1) return;
    
    const newOrder = [...localOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setLocalOrder(newOrder);
    
    if (onReorder) {
      onReorder(newOrder);
    }
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyEmail = async (email: SequenceEmail, index: number) => {
    const emailText = `Subject: ${email.subject}\n\n${email.body}`;
    await handleCopy(emailText, index);
  };

  // Export as plain text
  const exportAsText = () => {
    const lines: string[] = [
      `NURTURE SEQUENCE (${orderedEmails.length} Emails)`,
      `${"=".repeat(50)}`,
      "",
    ];

    orderedEmails.forEach((email, index) => {
      const asset = orderedAssets[index];
      lines.push(`EMAIL ${index + 1} OF ${orderedEmails.length}`);
      lines.push(`Funnel Stage: ${formatStage(asset.funnelStage)}`);
      lines.push(`${"─".repeat(40)}`);
      lines.push("");
      lines.push(`SUBJECT: ${email.subject}`);
      lines.push("");
      lines.push("BODY:");
      lines.push(email.body);
      lines.push("");
      lines.push(`LINKED ASSET: ${asset.title}`);
      lines.push(`ASSET URL: ${asset.s3Url}`);
      lines.push("");
      lines.push(`${"─".repeat(40)}`);
      lines.push("");
    });

    return lines.join("\n");
  };

  // Export as Markdown
  const exportAsMarkdown = () => {
    const lines: string[] = [
      `# Nurture Sequence (${orderedEmails.length} Emails)`,
      "",
      "## Sequence Overview",
      "",
      "| Order | Subject | Funnel Stage | Asset |",
      "|-------|---------|--------------|-------|",
    ];

    orderedEmails.forEach((email, index) => {
      const asset = orderedAssets[index];
      lines.push(`| ${index + 1} | ${email.subject} | ${formatStage(asset.funnelStage)} | ${asset.title} |`);
    });

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Email Details");
    lines.push("");

    orderedEmails.forEach((email, index) => {
      const asset = orderedAssets[index];
      lines.push(`### Email ${index + 1}: ${formatStage(asset.funnelStage)}`);
      lines.push("");
      lines.push(`**Subject:** ${email.subject}`);
      lines.push("");
      lines.push("**Body:**");
      lines.push("");
      lines.push(email.body);
      lines.push("");
      lines.push(`**Linked Asset:** [${asset.title}](${asset.s3Url})`);
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  };

  // Export as CSV
  const exportAsCSV = () => {
    const escapeCSV = (str: string) => {
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ["Order", "Subject", "Body", "Funnel Stage", "Asset Title", "Asset URL"];
    const rows = orderedEmails.map((email, index) => {
      const asset = orderedAssets[index];
      return [
        (index + 1).toString(),
        escapeCSV(email.subject),
        escapeCSV(email.body),
        formatStage(asset.funnelStage),
        escapeCSV(asset.title),
        asset.s3Url,
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  };

  const handleExportCopy = async (format: "text" | "markdown") => {
    const content = format === "text" ? exportAsText() : exportAsMarkdown();
    await navigator.clipboard.writeText(content);
    setExportCopied(format);
    setTimeout(() => setExportCopied(null), 2000);
  };

  const handleExportDownload = (format: "csv" | "text" | "markdown") => {
    let content: string;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case "csv":
        content = exportAsCSV();
        filename = "nurture-sequence.csv";
        mimeType = "text/csv";
        break;
      case "markdown":
        content = exportAsMarkdown();
        filename = "nurture-sequence.md";
        mimeType = "text/markdown";
        break;
      default:
        content = exportAsText();
        filename = "nurture-sequence.txt";
        mimeType = "text/plain";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nurture Sequence</DialogTitle>
          <DialogDescription>
            Review and reorder the email sequence. Drag to reorder or use the arrow buttons.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {orderedEmails.map((email, index) => {
            const asset = orderedAssets[index];
            const isFirst = index === 0;
            const isLast = index === orderedEmails.length - 1;

            return (
              <Card key={index} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-lg">Email {index + 1}</CardTitle>
                        <Badge
                          variant="outline"
                          className={getStageColor(asset.funnelStage)}
                        >
                          {formatStage(asset.funnelStage)}
                        </Badge>
                      </div>
                      <div className="font-semibold text-sm text-muted-foreground mt-1">
                        {email.subject}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleMoveUp(index)}
                          disabled={isFirst}
                          title="Move up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleMoveDown(index)}
                          disabled={isLast}
                          title="Move down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Copy button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyEmail(email, index)}
                        className="gap-2"
                      >
                        {copiedIndex === index ? (
                          <>
                            <Check className="h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Email Body */}
                  <div className="bg-muted/50 rounded-md p-4">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {email.body}
                    </p>
                  </div>

                  {/* Asset Card */}
                  <div className="border-t pt-4">
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      Attached Asset:
                    </div>
                    <div className="bg-background border rounded-lg p-3">
                      <div className="font-medium text-sm">{asset.title}</div>
                      {asset.atomicSnippets && Array.isArray(asset.atomicSnippets) && asset.atomicSnippets.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <div className="font-medium mb-1">Key Points:</div>
                          <ul className="list-disc list-inside space-y-1">
                            {asset.atomicSnippets.slice(0, 3).map((snippet: any, idx: number) => (
                              <li key={idx}>{snippet.content}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export Sequence
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => handleExportCopy("text")} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4" />
                <span className="flex-1">Copy as Text</span>
                {exportCopied === "text" && <Check className="h-4 w-4 text-green-500" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportCopy("markdown")} className="gap-2 cursor-pointer">
                <FileCode className="h-4 w-4" />
                <span className="flex-1">Copy as Markdown</span>
                {exportCopied === "markdown" && <Check className="h-4 w-4 text-green-500" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportDownload("csv")} className="gap-2 cursor-pointer">
                <FileSpreadsheet className="h-4 w-4" />
                Download as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportDownload("text")} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4" />
                Download as Text
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportDownload("markdown")} className="gap-2 cursor-pointer">
                <FileCode className="h-4 w-4" />
                Download as Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex gap-2">
            {onRegenerate && (
              <Button variant="outline" onClick={onRegenerate}>
                Regenerate Sequence
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
