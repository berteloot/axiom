"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Bot, User, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FunnelStage } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STAGE_DISPLAY: Record<FunnelStage, string> = {
  TOFU_AWARENESS: "TOFU",
  MOFU_CONSIDERATION: "MOFU",
  BOFU_DECISION: "BOFU",
  RETENTION: "RETENTION",
};

interface Message {
  role: "user" | "assistant";
  content: string;
  recommendations?: string[];
  sources?: string[];
}

interface Gap {
  icp: string;
  stage: FunnelStage;
  painCluster?: string;
  productLineId?: string;
  icpTargets?: string[];
}

interface WorkflowAssistantProps {
  gap: Gap;
  productLineName?: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function WorkflowAssistant({ gap, productLineName, isOpen, onToggle }: WorkflowAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `I'm here to help you create content for ${gap.icp} in ${STAGE_DISPLAY[gap.stage]}${gap.painCluster ? ` addressing ${gap.painCluster}` : ""}. Ask me about trending topics, content ideas, sources, or strategy.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/content/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userMessage.content,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          gapContext: {
            icp: gap.icp,
            stage: gap.stage,
            painCluster: gap.painCluster,
            productLineId: gap.productLineId,
            productLineName,
            icpTargets: gap.icpTargets,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer,
        recommendations: data.recommendations,
        sources: data.sources,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I apologize, but I encountered an error processing your question. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="fixed right-4 bottom-4 z-50 shadow-lg"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Ask Assistant
      </Button>
    );
  }

  return (
    <Card className="fixed right-4 bottom-4 w-[400px] h-[600px] z-50 shadow-2xl flex flex-col">
      <CardHeader className="pb-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Content Assistant</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggle}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {gap.icp} • {STAGE_DISPLAY[gap.stage]}{gap.painCluster ? ` • ${gap.painCluster}` : ""}
        </p>
      </CardHeader>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" ref={scrollAreaRef}>
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "flex gap-2",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {message.role === "assistant" && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            )}
            
            <div
              className={cn(
                "rounded-lg px-3 py-2 max-w-[85%] text-xs",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {message.role === "user" ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="space-y-2">
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  
                  {message.recommendations && message.recommendations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[10px] font-semibold mb-1 text-muted-foreground">
                        RECOMMENDATIONS:
                      </p>
                      <ul className="space-y-0.5">
                        {message.recommendations.map((rec, idx) => (
                          <li key={idx} className="text-[10px] list-disc list-inside">
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[10px] font-semibold mb-1 text-muted-foreground">
                        REFERENCED:
                      </p>
                      <ul className="space-y-0.5">
                        {message.sources.map((source, idx) => (
                          <li key={idx} className="text-[10px] list-disc list-inside">
                            {source}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {message.role === "user" && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-3 w-3 text-primary" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="rounded-lg px-3 py-2 bg-muted">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-3 border-t flex-shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about trends, ideas, or strategy..."
            className="min-h-[40px] max-h-[100px] resize-none text-xs"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[40px] w-[40px] flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Enter to send, Shift+Enter for new line
        </p>
      </div>
    </Card>
  );
}
