"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronUp, ChevronDown, Copy, Check } from "lucide-react";
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

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          {onRegenerate && (
            <Button variant="outline" onClick={onRegenerate}>
              Regenerate Sequence
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
