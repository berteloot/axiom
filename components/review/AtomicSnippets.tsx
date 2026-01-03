"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Info, Check, Copy, TrendingUp, Quote, Shield, Zap, BookOpen } from "lucide-react";
import { AtomicSnippet } from "@/lib/ai";

interface AtomicSnippetsProps {
  snippets: AtomicSnippet[];
}

export function AtomicSnippets({ snippets }: AtomicSnippetsProps) {
  const [copiedSnippets, setCopiedSnippets] = useState<Record<number, boolean>>({});

  if (!snippets || snippets.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case "ROI_STAT":
        return <TrendingUp className="h-4 w-4" />;
      case "CUSTOMER_QUOTE":
        return <Quote className="h-4 w-4" />;
      case "VALUE_PROP":
        return <Shield className="h-4 w-4" />;
      case "COMPETITIVE_WEDGE":
        return <Zap className="h-4 w-4" />;
      case "DEFINITION":
        return <BookOpen className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "ROI_STAT":
        return "ROI Stat";
      case "CUSTOMER_QUOTE":
        return "Quote";
      case "VALUE_PROP":
        return "Value Prop";
      case "COMPETITIVE_WEDGE":
        return "Competitive Edge";
      case "DEFINITION":
        return "Definition";
      default:
        return type;
    }
  };

  const handleCopy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedSnippets({ ...copiedSnippets, [idx]: true });
    setTimeout(() => {
      setCopiedSnippets((prev) => {
        const newState = { ...prev };
        delete newState[idx];
        return newState;
      });
    }, 2000);
  };

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-3">Atomic Highlights</h3>
      <div className="grid gap-3">
        {snippets.map((snippet, idx) => (
          <div key={idx} className="border rounded-md p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {getIcon(snippet.type)}
                <span className="text-xs font-medium text-muted-foreground">{getTypeLabel(snippet.type)}</span>
                {snippet.confidenceScore && (
                  <Badge variant="outline" className="text-xs">
                    {snippet.confidenceScore}/100
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleCopy(snippet.content, idx)}
              >
                {copiedSnippets[idx] ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <p className="text-sm mb-2">{snippet.content}</p>
            {snippet.context && (
              <p className="text-xs text-muted-foreground italic">
                💡 {snippet.context}
              </p>
            )}
            {snippet.pageLocation && (
              <p className="text-xs text-muted-foreground mt-1">
                Page {snippet.pageLocation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
