"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  TrendingUp,
  Lightbulb,
  FileText,
  ArrowRight,
  ArrowLeft,
  X,
  AlertCircle,
  Copy,
  Download,
  FileDown,
  ExternalLink,
  Search,
  FileCheck,
  FileEdit,
} from "lucide-react";
import { FunnelStage, ProductLine } from "@/lib/types";
import { useAccount } from "@/lib/account-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STAGE_DISPLAY: Record<FunnelStage, string> = {
  TOFU_AWARENESS: "TOFU",
  MOFU_CONSIDERATION: "MOFU",
  BOFU_DECISION: "BOFU",
  RETENTION: "RETENTION",
};

interface Gap {
  icp: string;
  stage: FunnelStage;
  painCluster?: string;
  productLineId?: string;
}

interface ContentIdea {
  assetType: string;
  title: string;
  strategicRationale: string;
  trendingAngle?: string;
  keyMessage: string;
  painClusterAddressed: string;
  format: string;
  priority: "high" | "medium" | "low";
}

interface ContentIdeasResponse {
  gap: Gap;
  strategicPriority: "high" | "medium" | "low";
  priorityRationale: string;
  trendingContext?: string;
  trendingTopics?: string[];
  trendingInsights?: string;
  trendingSources?: Array<{ 
    url: string; 
    title: string; 
    content: string; // Actual source content for draft generation
    relevance: string;
    sourceType?: string;
    isReputable?: boolean;
  }>;
  ideas: ContentIdea[];
  _apiWarnings?: Array<{ type: string; message: string; api: string }>; // Admin-only
}

interface ContentBrief {
  strategicPositioning: {
    whyThisMatters: string;
    painClusterAddress: string;
    trendingTopicsIntegration?: string;
    differentiation: string;
  };
  contentStructure: {
    recommendedSections: Array<{
      title: string;
      keyMessages: string[];
      dataPoints?: string[];
      trendingTopicReferences?: string[];
    }>;
    totalEstimatedWords: number;
  };
  toneAndStyle: {
    brandVoiceGuidance: string;
    icpSpecificTone: string;
    whatToAvoid: string[];
  };
  successMetrics: {
    whatMakesThisSuccessful: string;
    howToUseInSales: string;
    engagementIndicators: string[];
  };
  contentGapsToAddress: string[];
  seoStrategy: {
    primaryKeyword: string;
    secondaryKeywords: string[];
    targetSearchIntent: string;
    implementationNotes: string;
  };
  _apiWarnings?: Array<{ type: string; message: string; api: string }>; // Admin-only
}

interface ContentDraft {
  title: string;
  content: string;
  sources: Array<{
    url: string;
    title: string;
    sourceType: string;
    citation: string;
  }>;
  factCheckNotes: string[];
  wordCount: number;
  estimatedReadTime: number;
  // For non-blog-post content types
  isRecommendation?: boolean;
  assetType?: string;
  recommendations?: string;
  message?: string;
}

type WorkflowStep = "gap-selection" | "trending-discovery" | "idea-generation" | "idea-selection" | "brief-review" | "draft-generation" | "draft-review" | "complete";

interface CreateContentWorkflowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGap?: Gap;
}

export function CreateContentWorkflow({
  open,
  onOpenChange,
  initialGap,
}: CreateContentWorkflowProps) {
  // Reset state when dialog opens with a new gap
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(
    initialGap ? "trending-discovery" : "gap-selection"
  );
  const [selectedGap, setSelectedGap] = useState<Gap | null>(initialGap || null);

  // Reset workflow when initialGap changes or dialog opens
  useEffect(() => {
    if (open) {
      if (initialGap) {
        setSelectedGap(initialGap);
        setCurrentStep("trending-discovery");
      } else {
        setSelectedGap(null);
        setCurrentStep("gap-selection");
      }
      // Reset all other state
      setTrendingData(null);
      setContentIdeas(null);
      setSelectedIdea(null);
      setContentBrief(null);
      setContentDraft(null);
      setError(null);
      setApiWarnings([]); // Reset API warnings
      setIsDiscoveringTrends(false);
      setIsGeneratingIdeas(false);
      setIsGeneratingBrief(false);
      setIsGeneratingDraft(false);
    }
  }, [open, initialGap]);
  const [isDiscoveringTrends, setIsDiscoveringTrends] = useState(false);
  const [trendingData, setTrendingData] = useState<{
    topics: string[];
    insights: string;
    sources: Array<{ url: string; title: string; relevance: string }>;
  } | null>(null);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [contentIdeas, setContentIdeas] = useState<ContentIdeasResponse | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<ContentIdea | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [contentBrief, setContentBrief] = useState<ContentBrief | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [contentDraft, setContentDraft] = useState<ContentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Get current account for admin check
  const { currentAccount } = useAccount();
  const isAdmin = currentAccount?.role === "OWNER" || currentAccount?.role === "ADMIN";
  const [apiWarnings, setApiWarnings] = useState<Array<{ type: string; message: string; api: string }>>([]);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [selectedProductLineId, setSelectedProductLineId] = useState<string | undefined>(
    initialGap?.productLineId
  );

  // Fetch product lines on mount
  useEffect(() => {
    const fetchProductLines = async () => {
      try {
        const response = await fetch("/api/product-lines");
        if (response.ok) {
          const data = await response.json();
          setProductLines(data.productLines || []);
        }
      } catch (error) {
        console.error("Error fetching product lines:", error);
      }
    };
    fetchProductLines();
  }, []);

  // Update selected product line when initialGap changes
  useEffect(() => {
    if (initialGap?.productLineId) {
      setSelectedProductLineId(initialGap.productLineId);
    }
  }, [initialGap]);

  const handleGapSelect = (gap: Gap) => {
    setSelectedGap(gap);
    setError(null);
    setCurrentStep("trending-discovery");
  };

  const handleDiscoverTrendingTopics = async () => {
    if (!selectedGap) return;

    setIsDiscoveringTrends(true);
    setError(null);

    try {
      const gapWithProductLine = {
        ...selectedGap,
        productLineId: selectedProductLineId,
      };
      const response = await fetch("/api/content/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gap: gapWithProductLine,
          includeTrendingTopics: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to discover trending topics");
      }

      const data: ContentIdeasResponse = await response.json();
      setTrendingData({
        topics: data.trendingTopics || [],
        insights: data.trendingInsights || "",
        sources: data.trendingSources || [],
      });
      setContentIdeas(data);
      
      // Collect API warnings for admin display
      if (isAdmin && (data as any)._apiWarnings) {
        setApiWarnings((data as any)._apiWarnings);
      }
      
      setCurrentStep("idea-generation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discover trending topics");
      // Continue to idea generation even if trending topics fail
      setCurrentStep("idea-generation");
    } finally {
      setIsDiscoveringTrends(false);
    }
  };

  const handleGenerateIdeas = async () => {
    if (!selectedGap) return;

    setIsGeneratingIdeas(true);
    setError(null);

    try {
      const gapWithProductLine = {
        ...selectedGap,
        productLineId: selectedProductLineId,
      };
      const response = await fetch("/api/content/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gap: gapWithProductLine,
          includeTrendingTopics: !!trendingData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate content ideas");
      }

      const data: ContentIdeasResponse = await response.json();
      setContentIdeas(data);
      setCurrentStep("idea-selection");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate content ideas");
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  const handleSelectIdea = async (idea: ContentIdea) => {
    // Don't allow selection if already generating
    if (isGeneratingBrief) return;
    
    // Set selected idea immediately for visual feedback
    setSelectedIdea(idea);
    setIsGeneratingBrief(true);
    setError(null);

    try {
      const gapWithProductLine = {
        ...selectedGap,
        productLineId: selectedProductLineId,
      };
      const response = await fetch("/api/content/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedIdea: idea,
          gap: gapWithProductLine,
          trendingTopics: trendingData?.topics,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate content brief");
      }

      const briefResponse = await response.json();
      setContentBrief(briefResponse);
      
      // Collect API warnings for admin display
      if (isAdmin && briefResponse._apiWarnings) {
        setApiWarnings(prev => [...prev, ...briefResponse._apiWarnings]);
      }
      
      setCurrentStep("brief-review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate content brief");
      setSelectedIdea(null); // Reset selection on error
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!contentBrief || !selectedIdea || !selectedGap) return;

    setIsGeneratingDraft(true);
    setError(null);

    // Log sources being sent to draft generation
    const sourcesToSend = contentIdeas?.trendingSources?.filter((s: any) => s.isReputable) || [];
    console.log(`[Content Workflow] Generating draft with ${sourcesToSend.length} reputable sources`);
    if (sourcesToSend.length === 0) {
      console.warn(`[Content Workflow] WARNING: No sources found! Available sources:`, contentIdeas?.trendingSources?.length || 0);
    }

    try {
      const gapWithProductLine = {
        ...selectedGap,
        productLineId: selectedProductLineId,
      };
      const response = await fetch("/api/content/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: contentBrief,
          idea: selectedIdea,
          gap: gapWithProductLine,
          trendingSources: sourcesToSend,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate content draft");
      }

      const draft: ContentDraft = await response.json();
      setContentDraft(draft);
      setCurrentStep("draft-review");
      
      // If it's a recommendation (not a full draft), log it
      if (draft.isRecommendation) {
        console.log(`[Content Workflow] Received recommendations for ${draft.assetType} instead of full draft`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate content draft");
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleCopyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      throw new Error("Failed to copy to clipboard. Please check browser permissions.");
    }
  };

  const handleExportPDF = (content: string, title: string) => {
    // Create a simple HTML document and trigger print
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
              h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
              h2 { color: #555; margin-top: 30px; }
              pre { white-space: pre-wrap; font-family: inherit; }
            </style>
          </head>
          <body>
            <h1>${title}</h1>
            <pre>${content}</pre>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleExportDOCX = async (content: string, title: string) => {
    // For DOCX export, we'd need a library like docx
    // For now, create a simple text file download
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportAllIdeas = async (format: "copy" | "pdf" | "docx" = "copy") => {
    if (!contentIdeas) {
      setError("No content ideas available to export");
      return;
    }
    
    const ideasText = contentIdeas.ideas.map((idea, idx) => `
${idx + 1}. ${idea.title}
   Type: ${idea.assetType.replace(/_/g, " ")}
   Priority: ${idea.priority}
   Strategic Rationale: ${idea.strategicRationale}
   Key Message: ${idea.keyMessage}
   Pain Cluster: ${idea.painClusterAddressed}
   ${idea.trendingAngle ? `Trending Angle: ${idea.trendingAngle}` : ""}
`).join("\n");

    const exportText = `Content Ideas for ${contentIdeas.gap.icp} - ${STAGE_DISPLAY[contentIdeas.gap.stage]}
${contentIdeas.gap.painCluster ? `Pain Cluster: ${contentIdeas.gap.painCluster}` : ""}

Strategic Priority: ${contentIdeas.strategicPriority}
Priority Rationale: ${contentIdeas.priorityRationale}

${contentIdeas.trendingTopics && contentIdeas.trendingTopics.length > 0
  ? `Trending Topics: ${contentIdeas.trendingTopics.join(", ")}\n`
  : ""}

IDEAS:
${ideasText}
`;

    const title = `Content Ideas - ${contentIdeas.gap.icp} - ${STAGE_DISPLAY[contentIdeas.gap.stage]}`;

    try {
      if (format === "copy") {
        await handleCopyToClipboard(exportText);
        // Show success feedback - clear any previous errors
        setError(null);
        // Use alert for now (could be replaced with toast notification)
        alert(`Successfully copied ${contentIdeas.ideas.length} content idea${contentIdeas.ideas.length > 1 ? "s" : ""} to clipboard`);
      } else if (format === "pdf") {
        handleExportPDF(exportText, title);
        setError(null);
      } else if (format === "docx") {
        await handleExportDOCX(exportText, title);
        setError(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to export ideas";
      setError(errorMessage);
      console.error("Export error:", err);
    }
  };

  const handleReset = () => {
    setCurrentStep(initialGap ? "trending-discovery" : "gap-selection");
    setSelectedGap(initialGap || null);
    setTrendingData(null);
    setContentIdeas(null);
    setSelectedIdea(null);
    setContentBrief(null);
    setContentDraft(null);
    setError(null);
    setIsDiscoveringTrends(false);
    setIsGeneratingIdeas(false);
    setIsGeneratingBrief(false);
    setIsGeneratingDraft(false);
  };

  const getStepNumber = (step: WorkflowStep): number => {
    const steps: WorkflowStep[] = [
      "gap-selection",
      "trending-discovery",
      "idea-generation",
      "idea-selection",
      "brief-review",
      "draft-generation",
      "draft-review",
      "complete",
    ];
    return steps.indexOf(step) + 1;
  };

  const getTotalSteps = (): number => {
    return initialGap ? 7 : 8;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden w-[95vw] sm:w-[90vw] md:w-[85vw] lg:max-w-6xl xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Strategic Content Creation
          </DialogTitle>
          <DialogDescription>
            Create publication-ready content that solves your pain clusters. Get strategic ideas, a detailed brief, and a complete draft with source citations.
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4, 5, 6, 7].map((step) => {
            const stepNames = initialGap
              ? ["Trending", "Ideas", "Select", "Brief", "Draft", "Review", "Complete"]
              : ["Gap", "Trending", "Ideas", "Select", "Brief", "Draft", "Review"];
            const isActive = getStepNumber(currentStep) >= step;
            const isCurrent = getStepNumber(currentStep) === step;

            return (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    } ${isCurrent ? "ring-2 ring-primary ring-offset-2" : ""}`}
                  >
                    {isActive && !isCurrent ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      step
                    )}
                  </div>
                  <span className="text-xs mt-1 text-center text-muted-foreground">
                    {stepNames[step - 1]}
                  </span>
                </div>
                {step < getTotalSteps() && (
                  <div
                    className={`h-0.5 flex-1 mx-2 ${
                      isActive ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Error</p>
              <p className="text-sm text-destructive/80 mt-1">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Separator className="my-4" />

        {/* Step Content */}
        <div className="min-h-[400px]">
          {currentStep === "gap-selection" && !initialGap && (
            <GapSelectionStep
              onGapSelect={handleGapSelect}
              selectedGap={selectedGap}
            />
          )}

          {currentStep === "trending-discovery" && selectedGap ? (
            <TrendingDiscoveryStep
              gap={selectedGap}
              isDiscovering={isDiscoveringTrends}
              trendingData={trendingData}
              onDiscover={handleDiscoverTrendingTopics}
              onSkip={async () => {
                setCurrentStep("idea-generation");
                // Generate ideas without trending topics
                setIsGeneratingIdeas(true);
                setError(null);
                try {
                  const gapWithProductLine = {
                    ...selectedGap,
                    productLineId: selectedProductLineId,
                  };
                  const response = await fetch("/api/content/generate-ideas", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      gap: gapWithProductLine,
                      includeTrendingTopics: false,
                    }),
                  });
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Failed to generate content ideas");
                  }
                  const data: ContentIdeasResponse = await response.json();
                  setContentIdeas(data);
                  setCurrentStep("idea-selection");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to generate content ideas");
                } finally {
                  setIsGeneratingIdeas(false);
                }
              }}
              productLines={productLines}
              selectedProductLineId={selectedProductLineId}
              onProductLineChange={setSelectedProductLineId}
            />
          ) : currentStep === "trending-discovery" ? (
            <div className="space-y-4 text-center py-8">
              <p className="text-sm text-muted-foreground">
                No gap selected. Please select a gap first.
              </p>
            </div>
          ) : null}

          {currentStep === "idea-generation" && selectedGap && (
            <IdeaGenerationStep
              gap={selectedGap}
              isGenerating={isGeneratingIdeas}
              onGenerate={handleGenerateIdeas}
              contentIdeas={contentIdeas}
              onIdeasReady={() => setCurrentStep("idea-selection")}
            />
          )}

          {currentStep === "idea-selection" && contentIdeas && (
            <IdeaSelectionStep
              ideas={contentIdeas.ideas}
              trendingTopics={contentIdeas.trendingTopics}
              trendingSources={contentIdeas.trendingSources}
              onSelectIdea={handleSelectIdea}
              isGeneratingBrief={isGeneratingBrief}
              selectedIdea={selectedIdea}
              onExportIdeas={handleExportAllIdeas}
            />
          )}

          {currentStep === "brief-review" && contentBrief && selectedIdea && (
            <BriefReviewStep
              brief={contentBrief}
              idea={selectedIdea}
              isAdmin={isAdmin}
              apiWarnings={apiWarnings}
              onGenerateDraft={() => {
                setCurrentStep("draft-generation");
                handleGenerateDraft();
              }}
              isGeneratingDraft={isGeneratingDraft}
            />
          )}

          {currentStep === "draft-generation" && (
            <DraftGenerationStep
              isGenerating={isGeneratingDraft}
            />
          )}

          {currentStep === "draft-review" && contentDraft && selectedIdea && (
            <DraftReviewStep
              draft={contentDraft}
              idea={selectedIdea}
              onCopy={() => handleCopyToClipboard(contentDraft.content)}
              onExportPDF={() => handleExportPDF(contentDraft.content, contentDraft.title)}
              onExportDOCX={() => handleExportDOCX(contentDraft.content, contentDraft.title)}
              onComplete={() => {
                setCurrentStep("complete");
              }}
            />
          )}

          {currentStep === "complete" && (
            <CompleteStep 
              onReset={handleReset} 
              onClose={() => onOpenChange(false)}
              onExportIdeas={contentIdeas ? handleExportAllIdeas : undefined}
              draft={contentDraft}
              idea={selectedIdea}
              gap={selectedGap}
              trendingSources={contentIdeas?.trendingSources}
            />
          )}
        </div>

        {/* Navigation */}
        {currentStep !== "complete" && (
          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (currentStep === "idea-selection") {
                  setCurrentStep("idea-generation");
                } else if (currentStep === "brief-review") {
                  setCurrentStep("idea-selection");
                } else if (currentStep === "draft-generation") {
                  setCurrentStep("brief-review");
                } else if (currentStep === "draft-review") {
                  setCurrentStep("draft-generation");
                } else if (currentStep === "trending-discovery") {
                  setCurrentStep(initialGap ? "trending-discovery" : "gap-selection");
                }
              }}
              disabled={currentStep === "gap-selection" || currentStep === "trending-discovery"}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Step Components
function GapSelectionStep({
  onGapSelect,
  selectedGap,
}: {
  onGapSelect: (gap: Gap) => void;
  selectedGap: Gap | null;
}) {
  // This would typically come from props or be fetched
  // For now, showing a placeholder
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Content Gap</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a gap from your strategic matrix to create content for
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage Gaps</CardTitle>
          <CardDescription>
            Matrix cells with no assets. Click &quot;Create Content&quot; in the Critical Gaps modal to start.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function TrendingDiscoveryStep({
  gap,
  isDiscovering,
  trendingData,
  onDiscover,
  onSkip,
  productLines,
  selectedProductLineId,
  onProductLineChange,
}: {
  gap: Gap;
  isDiscovering: boolean;
  trendingData: { topics: string[]; insights: string; sources: Array<{ url: string; title: string }> } | null;
  onDiscover: () => void;
  onSkip: () => void;
  productLines: ProductLine[];
  selectedProductLineId?: string;
  onProductLineChange: (productLineId: string | undefined) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Discover Trending Topics</h3>
        <p className="text-sm text-muted-foreground mb-2">
          We&apos;ll search for current industry conversations from reputable sources (consulting firms, industry media, research organizations) to make your content timely and credible.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          <strong>Value:</strong> Your content will reference current trends and cite credible sources, increasing authority and relevance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Gap Context
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">ICP</Badge>
            <span className="text-sm">{gap.icp}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Stage</Badge>
            <span className="text-sm">{STAGE_DISPLAY[gap.stage]}</span>
          </div>
          {gap.painCluster && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Pain Cluster</Badge>
              <span className="text-sm">{gap.painCluster}</span>
            </div>
          )}
          {productLines.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Product Line</Badge>
              <Select
                value={selectedProductLineId || "none"}
                onValueChange={(value) => onProductLineChange(value === "none" ? undefined : value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select product line (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All Product Lines</SelectItem>
                  {productLines.map((pl) => (
                    <SelectItem key={pl.id} value={pl.id}>
                      {pl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {isDiscovering && (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              Discovering trending topics...
            </p>
          </CardContent>
        </Card>
      )}

      {trendingData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trending Topics Found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Topics:</p>
              <div className="flex flex-wrap gap-2">
                {trendingData.topics.map((topic, idx) => (
                  <Badge key={idx} variant="secondary">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
            {trendingData.insights && (
              <div>
                <p className="text-sm font-medium mb-2">Insights:</p>
                <p className="text-sm text-muted-foreground">{trendingData.insights}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button
          onClick={onDiscover}
          disabled={isDiscovering || !!trendingData}
          className="flex-1"
        >
          {isDiscovering ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Discovering...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Discover Trending Topics
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onSkip} disabled={isDiscovering}>
          Skip
        </Button>
      </div>
    </div>
  );
}

function IdeaGenerationStep({
  gap,
  isGenerating,
  onGenerate,
  contentIdeas,
  onIdeasReady,
}: {
  gap: Gap;
  isGenerating: boolean;
  onGenerate: () => void;
  contentIdeas: ContentIdeasResponse | null;
  onIdeasReady: () => void;
}) {
  // Auto-advance when ideas are ready
  useEffect(() => {
    if (contentIdeas && !isGenerating) {
      const timer = setTimeout(() => onIdeasReady(), 100);
      return () => clearTimeout(timer);
    }
  }, [contentIdeas, isGenerating, onIdeasReady]);

  if (contentIdeas && !isGenerating) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Generate Content Ideas</h3>
        <p className="text-sm text-muted-foreground mb-2">
          We&apos;ll generate 3-5 strategic content ideas that solve your pain clusters using your brand identity, value proposition, and differentiators.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          <strong>Value:</strong> Each idea will directly address the pain cluster and leverage your unique positioning. You&apos;ll get ready-to-use concepts.
        </p>
      </div>

      {isGenerating ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              Generating content ideas...
            </p>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={onGenerate} className="w-full" size="lg">
          <Lightbulb className="h-4 w-4 mr-2" />
          Generate Content Ideas
        </Button>
      )}
    </div>
  );
}

/**
 * Determine production capability for an asset type
 */
function getProductionCapability(assetType: string): {
  capability: "full" | "outline";
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
} {
  const normalizedType = assetType.replace(/_/g, " ").toLowerCase();
  const isBlogPost = normalizedType === "blog post" || assetType === "Blog_Post";

  if (isBlogPost) {
    return {
      capability: "full",
      label: "Fully Producible",
      icon: <FileCheck className="h-3.5 w-3.5" />,
      color: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
      description: "Complete content will be generated",
    };
  } else {
    return {
      capability: "outline",
      label: "Outline & Recommendations",
      icon: <FileEdit className="h-3.5 w-3.5" />,
      color: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
      description: "Strategic recommendations and structure provided",
    };
  }
}

function IdeaSelectionStep({
  ideas,
  trendingTopics,
  trendingSources,
  onSelectIdea,
  isGeneratingBrief,
  selectedIdea,
  onExportIdeas,
}: {
  ideas: ContentIdea[];
  trendingTopics?: string[];
  trendingSources?: Array<{ 
    url: string; 
    title: string; 
    sourceType?: string;
    isReputable?: boolean;
  }>;
  onSelectIdea: (idea: ContentIdea) => void;
  isGeneratingBrief: boolean;
  selectedIdea: ContentIdea | null;
  onExportIdeas?: (format?: "copy" | "pdf" | "docx") => void;
}) {
  const isIdeaSelected = (idea: ContentIdea) => {
    return selectedIdea?.title === idea.title && selectedIdea?.assetType === idea.assetType;
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Content Idea</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Review the generated ideas below and <strong className="text-foreground">click on one</strong> to start creating your content.
        </p>
        <div className="bg-muted/50 rounded-md p-3 mb-4">
          <p className="text-xs font-medium mb-2">What happens when you click:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>We&apos;ll create a detailed content brief (30-45 seconds)</li>
            <li>You&apos;ll review the brief and approve it</li>
            <li>
              <strong className="text-foreground">Blog Posts:</strong> Complete draft with source citations will be generated (30-60 seconds)
            </li>
            <li>
              <strong className="text-foreground">Other Content Types:</strong> Strategic recommendations and structure outline will be provided
            </li>
          </ol>
          <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
              <FileCheck className="h-3 w-3" />
              Fully Producible
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
              <FileEdit className="h-3 w-3" />
              Outline & Recommendations
            </span>
          </div>
        </div>
      </div>

      {isGeneratingBrief && selectedIdea && (
        <Card className="border-primary bg-primary/5 animate-in fade-in slide-in-from-top-2">
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="font-medium text-sm">
                  Generating content brief for: <span className="text-primary">{selectedIdea.title}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Creating a detailed brief with strategic positioning, content structure, and key messages...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {trendingTopics && trendingTopics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Trending Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {trendingTopics.map((topic, idx) => (
                <Badge key={idx} variant="secondary">
                  {topic}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {trendingSources && trendingSources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Research Sources ({trendingSources.length})
            </CardTitle>
            <CardDescription className="text-xs">
              These sources will be used to support your content with real data. Click to view the original articles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {trendingSources.map((source, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors border"
                >
                  <Badge 
                    variant={source.isReputable ? "default" : "secondary"} 
                    className="text-xs shrink-0"
                  >
                    {source.sourceType || "source"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {source.title || "View Source"}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {source.url}
                    </p>
                    {source.isReputable && (
                      <Badge variant="outline" className="text-xs mt-1">
                        ✓ Reputable
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {ideas.map((idea, idx) => {
          const isSelected = isIdeaSelected(idea);
          const isDisabled = isGeneratingBrief && !isSelected;
          
          return (
            <Card
              key={idx}
              className={`
                cursor-pointer transition-all duration-200
                ${isSelected 
                  ? "border-primary border-2 bg-primary/5 shadow-md scale-[1.02]" 
                  : isDisabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:border-primary hover:shadow-sm"
                }
                ${isSelected ? "ring-2 ring-primary/20" : ""}
              `}
              onClick={() => {
                if (!isGeneratingBrief) {
                  onSelectIdea(idea);
                }
              }}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base break-words">{idea.title}</CardTitle>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-primary animate-in zoom-in flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <CardDescription className="m-0 break-words">
                        {idea.assetType.replace(/_/g, " ")}
                      </CardDescription>
                      {(() => {
                        const capability = getProductionCapability(idea.assetType);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${capability.color} flex-shrink-0`}>
                            {capability.icon}
                            {capability.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isSelected && isGeneratingBrief && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    <Badge
                      variant={
                        idea.priority === "high"
                          ? "default"
                          : idea.priority === "medium"
                          ? "secondary"
                          : "outline"
                      }
                      className="whitespace-nowrap"
                    >
                      {idea.priority}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
            <CardContent className="space-y-2 w-full overflow-hidden">
              {(() => {
                const capability = getProductionCapability(idea.assetType);
                return (
                  <div className={`rounded-md p-2.5 mb-2 border ${capability.color} bg-opacity-50 w-full`}>
                    <div className="flex items-start gap-2 w-full">
                      <div className="flex-shrink-0">{capability.icon}</div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="text-xs font-semibold mb-0.5 break-words">{capability.label}</p>
                        <p className="text-xs opacity-90 break-words">{capability.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="w-full overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Strategic Rationale
                </p>
                <p className="text-sm break-words overflow-wrap-anywhere">{idea.strategicRationale}</p>
              </div>
              {idea.trendingAngle && (
                <div className="w-full overflow-hidden">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Trending Angle
                  </p>
                  <p className="text-sm break-words overflow-wrap-anywhere">{idea.trendingAngle}</p>
                </div>
              )}
              <div className="w-full overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Key Message
                </p>
                <p className="text-sm break-words overflow-wrap-anywhere">{idea.keyMessage}</p>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      {onExportIdeas && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Export All Ideas
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExportIdeas?.("copy")}>
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExportIdeas?.("pdf")}>
              <FileText className="h-4 w-4 mr-2" />
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExportIdeas?.("docx")}>
              <Download className="h-4 w-4 mr-2" />
              Export as Document
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function BriefReviewStep({
  brief,
  idea,
  onGenerateDraft,
  isGeneratingDraft,
  isAdmin,
  apiWarnings,
}: {
  brief: ContentBrief;
  idea: ContentIdea;
  onGenerateDraft: () => void;
  isGeneratingDraft: boolean;
  isAdmin: boolean;
  apiWarnings: Array<{ type: string; message: string; api: string }>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Content Brief</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Review the strategic brief with section-by-section guidance. This ensures the content aligns with your strategy.
        </p>
        <div className="text-xs text-muted-foreground mb-4 space-y-2">
          {(() => {
            const capability = getProductionCapability(idea.assetType);
            return capability.capability === "full" ? (
              <p className="break-words">
                <strong>Next step:</strong> Click &quot;Generate Draft&quot; to create the complete, publication-ready content with source citations.
              </p>
            ) : (
              <p className="break-words">
                <strong>Next step:</strong> Click &quot;Generate Draft&quot; to receive strategic recommendations and an outline for this {idea.assetType.replace("_", " ")}. Full content production requires team collaboration and real data.
              </p>
            );
          })()}
        </div>
      </div>

      {/* Admin-only API Warnings */}
      {isAdmin && apiWarnings.length > 0 && (
        <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/5">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
            API Status (Admin Only)
          </AlertTitle>
          <AlertDescription className="text-xs text-yellow-800 dark:text-yellow-200 mt-2 space-y-1">
            {apiWarnings.map((warning, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <Badge variant="outline" className="text-xs shrink-0">
                  {warning.api}
                </Badge>
                <span>{warning.message}</span>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* SEO Strategy Card - Prominently displayed at the top */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            SEO Strategy
          </CardTitle>
          <CardDescription>
            Data-backed keyword strategy based on funnel stage and search intent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="default" className="font-semibold">
                Primary Keyword
              </Badge>
              <span className="text-sm font-medium">{brief.seoStrategy.primaryKeyword}</span>
            </div>
            {brief.seoStrategy.secondaryKeywords && brief.seoStrategy.secondaryKeywords.length > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">
                  Secondary
                </Badge>
                <div className="flex flex-wrap gap-1">
                  {brief.seoStrategy.secondaryKeywords.map((keyword, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <span className="font-medium">Search Intent:</span>{" "}
                <Badge variant="outline" className="ml-1">
                  {brief.seoStrategy.targetSearchIntent}
                </Badge>
              </div>
              <div className="bg-muted/50 rounded-md p-3 mt-2">
                <p className="text-xs font-medium mb-1">Implementation Notes:</p>
                <p className="text-xs text-muted-foreground">
                  {brief.seoStrategy.implementationNotes}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base break-words">{idea.title}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <CardDescription className="m-0 break-words">{idea.assetType.replace("_", " ")}</CardDescription>
                {(() => {
                  const capability = getProductionCapability(idea.assetType);
                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${capability.color} flex-shrink-0`}>
                      {capability.icon}
                      {capability.label}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 w-full overflow-hidden">
          {(() => {
            const capability = getProductionCapability(idea.assetType);
            return (
              <div className={`rounded-md p-3 border ${capability.color} bg-opacity-50 w-full`}>
                <div className="flex items-start gap-2 w-full">
                  <div className="flex-shrink-0">{capability.icon}</div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-sm font-semibold mb-1 break-words">{capability.label}</p>
                    <p className="text-xs opacity-90 break-words overflow-wrap-anywhere">{capability.description}</p>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="w-full overflow-hidden">
            <h4 className="text-sm font-semibold mb-2">Strategic Positioning</h4>
            <div className="space-y-2 text-sm w-full">
              <p className="break-words overflow-wrap-anywhere">
                <span className="font-medium">Why this matters:</span>{" "}
                {brief.strategicPositioning.whyThisMatters}
              </p>
              <p className="break-words overflow-wrap-anywhere">
                <span className="font-medium">Pain cluster address:</span>{" "}
                {brief.strategicPositioning.painClusterAddress}
              </p>
              {brief.strategicPositioning.trendingTopicsIntegration && (
                <p className="break-words overflow-wrap-anywhere">
                  <span className="font-medium">Trending topics:</span>{" "}
                  {brief.strategicPositioning.trendingTopicsIntegration}
                </p>
              )}
              <p className="break-words overflow-wrap-anywhere">
                <span className="font-medium">Differentiation:</span>{" "}
                {brief.strategicPositioning.differentiation}
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-2">Content Structure</h4>
            <div className="space-y-3">
              {brief.contentStructure.recommendedSections.map((section, idx) => (
                <div key={idx} className="border rounded-lg p-3">
                  <p className="font-medium text-sm mb-2">{section.title}</p>
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {section.keyMessages.map((msg, msgIdx) => (
                      <li key={msgIdx} className="break-words">{msg}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-2">
                Estimated word count: {brief.contentStructure.totalEstimatedWords}
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-2">Success Metrics</h4>
            <div className="space-y-2 text-sm">
              <p className="break-words">
                <span className="font-medium">What makes this successful:</span>{" "}
                {brief.successMetrics.whatMakesThisSuccessful}
              </p>
              <p className="break-words">
                <span className="font-medium">How to use in sales:</span>{" "}
                {brief.successMetrics.howToUseInSales}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button 
        onClick={onGenerateDraft} 
        className="w-full" 
        size="lg"
        disabled={isGeneratingDraft}
      >
        {isGeneratingDraft ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating Draft...
          </>
        ) : (
          <>
            Generate Draft
            <ArrowRight className="h-4 w-4 ml-2" />
          </>
        )}
      </Button>
    </div>
  );
}

function DraftGenerationStep({
  isGenerating,
}: {
  isGenerating: boolean;
}) {
  return (
    <div className="space-y-4 text-center py-8">
      <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
      <h3 className="text-lg font-semibold">Generating Content Draft</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Creating your complete, publication-ready content with source citations and fact-checking notes...
      </p>
    </div>
  );
}

function DraftReviewStep({
  draft,
  idea,
  onCopy,
  onExportPDF,
  onExportDOCX,
  onComplete,
}: {
  draft: ContentDraft;
  idea: ContentIdea;
  onCopy: () => void;
  onExportPDF: () => void;
  onExportDOCX: () => void;
  onComplete: () => void;
}) {
  // Handle recommendation responses (non-blog-post content types)
  if (draft.isRecommendation) {
    const handleCopyRecommendations = async () => {
      try {
        await navigator.clipboard.writeText(draft.recommendations || "");
        // You could add a toast notification here
      } catch (err) {
        console.error("Failed to copy recommendations:", err);
      }
    };

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Strategic Recommendations</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {draft.message || `For ${draft.assetType?.replace(/_/g, " ") || "this content type"}, we provide strategic recommendations and guidance rather than fully generated content.`}
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base break-words">{draft.title}</CardTitle>
                <CardDescription className="mt-1 break-words">
                  {draft.assetType?.replace(/_/g, " ") || idea.assetType.replace("_", " ")} • Recommendations & Guidance
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyRecommendations}
                  title="Copy recommendations to clipboard"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
                {draft.recommendations || "No recommendations available."}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Next Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use these recommendations along with your content brief to plan and produce this {draft.assetType?.replace(/_/g, " ") || "content"} with your team. 
              The brief contains the strategic positioning, structure, and SEO strategy you'll need.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 pt-4">
          <Button onClick={onComplete} variant="default">
            Complete
          </Button>
        </div>
      </div>
    );
  }

  // Regular blog post draft
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Content Draft Ready</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your publication-ready content is complete. Review, copy, or export it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base break-words">{draft.title}</CardTitle>
              <CardDescription className="mt-1 break-words">
                {idea.assetType.replace("_", " ")} • {draft.wordCount} words • ~{draft.estimatedReadTime} min read
              </CardDescription>
            </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCopy}
                  title="Copy to clipboard"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onExportPDF}
                  title="Export as PDF"
                >
                  <FileDown className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onExportDOCX}
                  title="Export as document"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
        <CardContent className="space-y-6">
          <div className="border rounded-lg p-4 bg-muted/30 max-h-[400px] overflow-y-auto overflow-x-hidden">
            <pre className="whitespace-pre-wrap text-sm font-sans break-words">{draft.content}</pre>
          </div>

          {draft.sources.length > 0 && (
            <div className="border-t pt-4 mt-4">
              <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Sources & References
            </h4>
              <p className="text-xs text-muted-foreground mb-3">
                All sources used in this content. Click to view the original articles.
              </p>
              <div className="space-y-3">
                {draft.sources.map((source, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {source.sourceType}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline flex items-center gap-1 mb-1"
                      >
                        {source.title}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary truncate block"
                      >
                        {source.url}
                      </a>
                      {source.citation && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          {source.citation}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {draft.factCheckNotes.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2 text-yellow-800">
                ⚠️ Fact-Check Required
              </h4>
              <ul className="text-sm space-y-1 list-disc list-inside text-yellow-700">
                {draft.factCheckNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onCopy} variant="outline" className="flex-1">
          <Copy className="h-4 w-4 mr-2" />
          Copy Text
        </Button>
        <Button onClick={onExportPDF} variant="outline" className="flex-1">
          <FileDown className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
        <Button onClick={onExportDOCX} variant="outline" className="flex-1">
          <Download className="h-4 w-4 mr-2" />
          Export Doc
        </Button>
      </div>

      <Button onClick={onComplete} className="w-full" size="lg">
        Complete
        <CheckCircle2 className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}

function CompleteStep({
  onReset,
  onClose,
  onExportIdeas,
  draft,
  idea,
  gap,
  trendingSources,
}: {
  onReset: () => void;
  onClose: () => void;
  onExportIdeas?: (format?: "copy" | "pdf" | "docx") => void;
  draft?: ContentDraft | null;
  idea?: ContentIdea | null;
  gap?: Gap | null;
  trendingSources?: Array<{
    url: string;
    title: string;
    content?: string;
    sourceType?: string;
    isReputable?: boolean;
  }>;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveToLibrary = async () => {
    if (!draft || !idea || !gap) {
      setSaveError("Missing content data. Please try creating the content again.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Merge draft sources with reputable trending sources
      // Prioritize reputable sources from research
      const reputableTrendingSources = (trendingSources || [])
        .filter(s => s.isReputable && s.url)
        .map(s => ({
          url: s.url,
          title: s.title,
          sourceType: s.sourceType || "research",
          citation: `Research source: ${s.title}`,
        }));

      // Combine with draft sources, avoiding duplicates
      const draftSourceUrls = new Set((draft.sources || []).map(s => s.url));
      const additionalSources = reputableTrendingSources.filter(
        s => !draftSourceUrls.has(s.url)
      );

      const allSources = [...(draft.sources || []), ...additionalSources];

      const response = await fetch("/api/assets/from-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          content: draft.content,
          assetType: idea.assetType,
          funnelStage: gap.stage,
          icpTargets: [gap.icp],
          painClusters: gap.painCluster ? [gap.painCluster] : [],
          sources: allSources,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save to asset library");
      }

      const result = await response.json();
      setSaveSuccess(true);
      console.log("Asset saved successfully:", result);
      
      // Set flag to switch to library view on dashboard
      sessionStorage.setItem('switch-to-library-view', 'true');
      
      // Navigate to dashboard after a brief delay to show success message
      setTimeout(() => {
        onClose();
        router.push("/dashboard");
      }, 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save to asset library");
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = draft && idea && gap && !saveSuccess;

  return (
    <div className="space-y-4 text-center py-8">
      <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
      <h3 className="text-xl font-semibold">Content Created Successfully!</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Your content draft is ready. You can save it to your asset library, export it, or create another piece of content.
      </p>

      {/* Save to Library Section */}
      {canSave && (
        <Card className="max-w-md mx-auto mt-4">
          <CardContent className="pt-4">
            <div className="text-left space-y-2">
              <p className="text-sm font-medium">Save to Asset Library</p>
              <p className="text-xs text-muted-foreground">
                This will add "{draft?.title}" to your library as:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary">{gap?.icp}</Badge>
                <Badge variant="outline">{STAGE_DISPLAY[gap?.stage as FunnelStage]}</Badge>
                {gap?.painCluster && (
                  <Badge variant="outline">{gap.painCluster}</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md mx-auto">
          <p className="text-sm font-medium text-green-800 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Saved to Asset Library!
          </p>
          <p className="text-xs text-green-700 mt-1">
            The asset has been added with {gap?.icp} as the ICP target and {STAGE_DISPLAY[gap?.stage as FunnelStage]} funnel stage.
          </p>
        </div>
      )}

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md mx-auto">
          <p className="text-sm font-medium text-red-800 flex items-center justify-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {saveError}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-center mt-6">
        {canSave && (
          <Button 
            onClick={handleSaveToLibrary} 
            disabled={isSaving}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Save to Asset Library
              </>
            )}
          </Button>
        )}
        {onExportIdeas && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export All Ideas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExportIdeas("copy")}>
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExportIdeas("pdf")}>
                <FileText className="h-4 w-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExportIdeas("docx")}>
                <Download className="h-4 w-4 mr-2" />
                Export as Document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button onClick={onReset} variant="outline">
          Create Another
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
