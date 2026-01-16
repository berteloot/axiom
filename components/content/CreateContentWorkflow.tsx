"use client";

import { useState, useEffect, useRef } from "react";
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
import { MultiSelectCombobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

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
  icpTargets?: string[]; // Allow multiple ICP targets (new feature)
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
  sections?: string[];
  sourcesToUse?: string[];
}

interface ContentIdeasResponse {
  gap: Gap;
  strategicPriority: "high" | "medium" | "low";
  priorityRationale: string;
  trendingContext?: string;
  trendingTopics?: string[];
  trendingInsights?: string;
  trendingSources?: Array<{ 
    id?: string; // Source ID (new format)
    url: string; 
    title: string; 
    content: string; // Actual source content for draft generation
    relevance: string;
    sourceType?: string;
    isReputable?: boolean;
  }>;
  sources?: Array<{ // Alternative sources array (from trendingOnly mode)
    id: string;
    url: string;
    title: string;
    publisher?: string | null;
    publishedDate?: string | null;
    excerpt?: string | null;
    relevance: string;
    sourceType: string;
    isReputable: boolean;
    whyReputable?: string | null;
    whyRelevant?: string | null;
    content?: string; // Optional content for preview
  }>;
  ideas: ContentIdea[];
  selectionGuidance?: string;
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

// STREAMLINED: 4-step workflow - brief is the final deliverable (no draft generation)
type WorkflowStep = "gap-selection" | "idea-generation" | "idea-selection" | "brief-review" | "complete";

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
  // STREAMLINED: Auto-start idea generation when gap is provided
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(
    initialGap ? "idea-generation" : "gap-selection"
  );
  const [selectedGap, setSelectedGap] = useState<Gap | null>(initialGap || null);

  // Track previous values to detect actual changes and prevent infinite loops
  const prevOpenRef = useRef(open);
  const prevGapKeyRef = useRef<string | null>(null);
  
  // Create a stable key from gap to detect actual changes (not just reference changes)
  const getGapKey = (gap: Gap | undefined): string | null => {
    if (!gap) return null;
    return `${gap.icp}|${gap.stage}|${gap.painCluster || ""}|${gap.productLineId || ""}`;
  };
  
  // Reset workflow when dialog opens or when initialGap actually changes
  useEffect(() => {
    const currentGapKey = getGapKey(initialGap);
    const gapChanged = currentGapKey !== prevGapKeyRef.current;
    const dialogJustOpened = open && !prevOpenRef.current;
    
    // Only reset when:
    // 1. Dialog just opened, OR
    // 2. Dialog is open AND the gap actually changed (not just object reference)
    if (open && (dialogJustOpened || gapChanged)) {
      prevGapKeyRef.current = currentGapKey;
      
      if (initialGap) {
        setSelectedGap(initialGap);
        setCurrentStep("idea-generation"); // STREAMLINED: Skip to idea generation (auto-triggers research)
      } else {
        setSelectedGap(null);
        setCurrentStep("gap-selection");
      }
      // Reset all other state
      setContentIdeas(null);
      setSelectedIdea(null);
      setContentBrief(null);
      setError(null);
      setApiWarnings([]);
      setIsGeneratingIdeas(false);
      setIsGeneratingBrief(false);
      setSelectedSources(new Set<string>());
      setPreviewSource(null);
    }
    
    // Track previous open state
    prevOpenRef.current = open;
    
    // If dialog closes, reset the gap key so it will detect changes on next open
    if (!open) {
      prevGapKeyRef.current = null;
    }
  }, [open, initialGap?.icp, initialGap?.stage, initialGap?.painCluster, initialGap?.productLineId]); // Only depend on primitive values
  // STREAMLINED: Removed trendingData state - now handled automatically during idea generation
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [contentIdeas, setContentIdeas] = useState<ContentIdeasResponse | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<ContentIdea | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [contentBrief, setContentBrief] = useState<ContentBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Get current account for admin check
  const { currentAccount } = useAccount();
  const isAdmin = currentAccount?.role === "OWNER" || currentAccount?.role === "ADMIN";
  const [apiWarnings, setApiWarnings] = useState<Array<{ type: string; message: string; api: string }>>([]);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [selectedProductLineId, setSelectedProductLineId] = useState<string | undefined>(
    initialGap?.productLineId
  );
  const [icpOptions, setIcpOptions] = useState<string[]>([]);
  const [isLoadingIcp, setIsLoadingIcp] = useState(true);
  const [selectedICPTargets, setSelectedICPTargets] = useState<string[]>(
    initialGap?.icpTargets || (initialGap?.icp ? [initialGap.icp] : [])
  );
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    missingCriticalFields: string[];
    missingOptionalFields: string[];
    suggestions: Array<{ field: string; message: string; required: boolean }>;
    canProceed: boolean;
    currentContext: any;
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [previewSource, setPreviewSource] = useState<{ url: string; title: string; content: string } | null>(null);

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

  // Fetch ICP targets on mount
  useEffect(() => {
    const fetchIcpTargets = async () => {
      setIsLoadingIcp(true);
      try {
        const response = await fetch("/api/icp-targets");
        if (response.ok) {
          const data = await response.json();
          setIcpOptions(data.icpTargets || []);
        }
      } catch (error) {
        console.error("Error fetching ICP targets:", error);
      } finally {
        setIsLoadingIcp(false);
      }
    };
    fetchIcpTargets();
  }, []);

  // Update selected product line and ICP targets when initialGap changes
  useEffect(() => {
    if (initialGap?.productLineId) {
      setSelectedProductLineId(initialGap.productLineId);
    }
    if (initialGap?.icpTargets) {
      setSelectedICPTargets(initialGap.icpTargets);
    } else if (initialGap?.icp) {
      setSelectedICPTargets([initialGap.icp]);
    }
  }, [initialGap]);

  // STREAMLINED: Skip validation step - go directly to idea generation
  const handleGapSelect = (gap: Gap) => {
    setSelectedGap(gap);
    setError(null);
    // Auto-trigger idea generation with research included
    setCurrentStep("idea-generation");
  };

  // STREAMLINED: Removed separate trending discovery and source selection steps
  // Research and source selection now happen automatically during idea generation

  // STREAMLINED: Auto-trigger idea generation when gap is selected (research included automatically)
  useEffect(() => {
    if (currentStep === "idea-generation" && selectedGap && !contentIdeas && !isGeneratingIdeas) {
      handleGenerateIdeas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, selectedGap]);

  const handleGenerateIdeas = async () => {
    if (!selectedGap) return;

    setIsGeneratingIdeas(true);
    setError(null);

    try {
      const gapWithProductLine = {
        ...selectedGap,
        productLineId: selectedProductLineId,
        icpTargets: selectedICPTargets.length > 0 ? selectedICPTargets : [selectedGap.icp],
      };
      
      // STREAMLINED: Always include research automatically (no separate step needed)
      const response = await fetch("/api/content/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gap: gapWithProductLine,
          includeTrendingTopics: true, // Always true - research is automatic
          // Removed mode parameter - research is always included
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate content ideas");
      }

      const data: ContentIdeasResponse = await response.json();
      
      // STREAMLINED: Sources are automatically included in the API response
        // Ensure trendingSources has all necessary fields for draft generation
      if (data.trendingSources && data.trendingSources.length > 0) {
        data.trendingSources = data.trendingSources.map((s: any) => ({
          ...s,
          content: s.content || s.excerpt || "",
          title: s.title || "Untitled Source",
        }));
        console.log(`[Content Workflow] Received ${data.trendingSources.length} sources from API in contentIdeas response`);
      }
      
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
    if (!selectedGap) return;
    
    // Set selected idea immediately for visual feedback
    setSelectedIdea(idea);
    setIsGeneratingBrief(true);
    setError(null);

    try {
      const gapWithProductLine = {
        ...selectedGap,
        productLineId: selectedProductLineId,
        icpTargets: selectedICPTargets.length > 0 ? selectedICPTargets : [selectedGap.icp],
      };
      const response = await fetch("/api/content/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedIdea: idea,
          gap: gapWithProductLine,
          trendingTopics: contentIdeas?.trendingTopics,
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

  // REMOVED: Draft generation step - brief is now the final deliverable

  const handleCopyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      throw new Error("Failed to copy to clipboard. Please check browser permissions.");
    }
  };

  // Export brief in different formats
  const handleExportBrief = async (
    brief: ContentBrief,
    idea: ContentIdea | null,
    format: "copy" | "pdf" | "docx" = "copy"
  ) => {
    if (!idea) return;

    // Format brief as markdown/text
    const briefText = formatBriefAsMarkdown(brief, idea);

    if (format === "copy") {
      await handleCopyToClipboard(briefText);
      return;
    }

    if (format === "pdf") {
      handleExportPDF(briefText, `${idea.title} - Content Brief`);
      return;
    }

    if (format === "docx") {
      handleExportDOCX(briefText, `${idea.title} - Content Brief`);
      return;
    }
  };

  // Format brief as markdown for export
  const formatBriefAsMarkdown = (brief: ContentBrief, idea: ContentIdea): string => {
    let markdown = `# Content Brief: ${idea.title}\n\n`;
    markdown += `**Asset Type:** ${idea.assetType.replace(/_/g, " ")}\n\n`;
    markdown += `---\n\n`;

    // SEO Strategy
    markdown += `## SEO Strategy\n\n`;
    markdown += `**Primary Keyword:** ${brief.seoStrategy.primaryKeyword}\n\n`;
    if (brief.seoStrategy.secondaryKeywords.length > 0) {
      markdown += `**Secondary Keywords:** ${brief.seoStrategy.secondaryKeywords.join(", ")}\n\n`;
    }
    markdown += `**Search Intent:** ${brief.seoStrategy.targetSearchIntent}\n\n`;
    markdown += `**Implementation Notes:**\n${brief.seoStrategy.implementationNotes}\n\n`;
    markdown += `---\n\n`;

    // Strategic Positioning
    markdown += `## Strategic Positioning\n\n`;
    markdown += `**Why This Matters:**\n${brief.strategicPositioning.whyThisMatters}\n\n`;
    markdown += `**Pain Cluster Address:**\n${brief.strategicPositioning.painClusterAddress}\n\n`;
    if (brief.strategicPositioning.trendingTopicsIntegration) {
      markdown += `**Trending Topics Integration:**\n${brief.strategicPositioning.trendingTopicsIntegration}\n\n`;
    }
    markdown += `**Differentiation:**\n${brief.strategicPositioning.differentiation}\n\n`;
    markdown += `---\n\n`;

    // Content Structure
    markdown += `## Content Structure\n\n`;
    markdown += `**Estimated Word Count:** ${brief.contentStructure.totalEstimatedWords} words\n\n`;
    brief.contentStructure.recommendedSections.forEach((section, idx) => {
      markdown += `### ${idx + 1}. ${section.title}\n\n`;
      if (section.keyMessages.length > 0) {
        markdown += `**Key Messages:**\n`;
        section.keyMessages.forEach(msg => {
          markdown += `- ${msg}\n`;
        });
        markdown += `\n`;
      }
    });
    markdown += `---\n\n`;

    // Tone and Style
    markdown += `## Tone and Style\n\n`;
    markdown += `**Brand Voice Guidance:**\n${brief.toneAndStyle.brandVoiceGuidance}\n\n`;
    markdown += `**ICP-Specific Tone:**\n${brief.toneAndStyle.icpSpecificTone}\n\n`;
    if (brief.toneAndStyle.whatToAvoid.length > 0) {
      markdown += `**What to Avoid:**\n`;
      brief.toneAndStyle.whatToAvoid.forEach(item => {
        markdown += `- ${item}\n`;
      });
      markdown += `\n`;
    }
    markdown += `---\n\n`;

    // Success Metrics
    markdown += `## Success Metrics\n\n`;
    markdown += `**What Makes This Successful:**\n${brief.successMetrics.whatMakesThisSuccessful}\n\n`;
    markdown += `**How to Use in Sales:**\n${brief.successMetrics.howToUseInSales}\n\n`;
    if (brief.successMetrics.engagementIndicators.length > 0) {
      markdown += `**Engagement Indicators:**\n`;
      brief.successMetrics.engagementIndicators.forEach(indicator => {
        markdown += `- ${indicator}\n`;
      });
      markdown += `\n`;
    }
    markdown += `---\n\n`;

    // Content Gaps
    if (brief.contentGapsToAddress.length > 0) {
      markdown += `## Content Gaps to Address\n\n`;
      brief.contentGapsToAddress.forEach(gap => {
        markdown += `- ${gap}\n`;
      });
      markdown += `\n`;
    }

    return markdown;
  };

  // Escape HTML entities to prevent injection
  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  const handleExportPDF = (content: string, title: string) => {
    // Create a simple HTML document and trigger print
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      // Escape HTML entities to prevent injection
      const escapedTitle = escapeHtml(title);
      const escapedContent = escapeHtml(content);
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${escapedTitle}</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
              h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
              h2 { color: #555; margin-top: 30px; }
              pre { white-space: pre-wrap; font-family: inherit; }
            </style>
          </head>
          <body>
            <h1>${escapedTitle}</h1>
            <pre>${escapedContent}</pre>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleExportDOCX = async (content: string, title: string) => {
    // Note: This is currently a text file export, not a real DOCX
    // TODO: Implement proper DOCX export using a library like docx or mammoth
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

  // STREAMLINED: Reset to 4-step workflow (brief is final deliverable)
  const handleReset = () => {
    setCurrentStep(initialGap ? "idea-generation" : "gap-selection");
    setSelectedGap(initialGap || null);
    setContentIdeas(null);
    setSelectedIdea(null);
    setContentBrief(null);
    setError(null);
    setIsGeneratingIdeas(false);
    setIsGeneratingBrief(false);
  };

  // STREAMLINED: Progress tracking for 4-step workflow (brief is final deliverable)
  const getStepNumber = (step: WorkflowStep): number => {
    const steps: WorkflowStep[] = ["gap-selection", "idea-generation", "idea-selection", "brief-review", "complete"];
    return steps.indexOf(step) + 1;
  };

  const getTotalSteps = (): number => {
    return 4; // Brief is the final deliverable - no draft generation
  };
  
  const getStepLabels = (): string[] => {
    return ["Gap", "Ideas", "Select", "Brief"]; // 4-step workflow ending at brief
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

        {/* STREAMLINED: Progress Indicator for 5-step workflow */}
        <div className="flex items-center gap-2 mb-6">
          {getStepLabels().map((label, index) => {
            const stepNumber = index + 1;
            const steps: WorkflowStep[] = ["gap-selection", "idea-generation", "idea-selection", "brief-review"];
            const isActive = getStepNumber(currentStep) >= stepNumber;
            const isCurrent = getStepNumber(currentStep) === stepNumber;

            return (
              <div key={index} className="flex items-center flex-1">
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
                      stepNumber
                    )}
                  </div>
                  <span className="text-xs mt-1 text-center text-muted-foreground">
                    {label}
                  </span>
                </div>
                {stepNumber < getTotalSteps() && (
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

          {/* STREAMLINED: Removed input-validation step - validation happens inline during gap selection */}

          {/* STREAMLINED: Removed source-selection step - AI auto-selects best sources during idea generation */}

          {previewSource && (
            <Dialog open={!!previewSource} onOpenChange={() => setPreviewSource(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between">
                    <span>Article Preview</span>
                    <a
                      href={previewSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      Open Original
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-md">
                    <p className="text-xs font-medium mb-2">Full Content:</p>
                    <div className="prose prose-sm max-w-none">
                      <p className="text-sm whitespace-pre-wrap">{previewSource.content}</p>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* STREAMLINED: Removed trending-discovery step - research is now automatic */}

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
              trendingSources={contentIdeas.trendingSources || []}
              selectionGuidance={contentIdeas.selectionGuidance}
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
              gap={selectedGap}
              isAdmin={isAdmin}
              apiWarnings={apiWarnings}
              sources={contentIdeas?.trendingSources || []}
              onComplete={() => setCurrentStep("complete")}
              onExportBrief={(format) => handleExportBrief(contentBrief!, selectedIdea!, format)}
            />
          )}

          {currentStep === "complete" && (
            <CompleteStep 
              onReset={handleReset} 
              onClose={() => onOpenChange(false)}
              onExportIdeas={contentIdeas ? handleExportAllIdeas : undefined}
              brief={contentBrief}
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
                // STREAMLINED: 4-step workflow navigation (brief is final step)
                if (currentStep === "brief-review") {
                  setCurrentStep("idea-selection");
                } else if (currentStep === "idea-selection") {
                  setCurrentStep("idea-generation");
                } else if (currentStep === "idea-generation") {
                  setCurrentStep("gap-selection");
                }
              }}
              disabled={currentStep === "gap-selection"}
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

function InputValidationStep({
  gap,
  isValidating,
  validationResult,
  onValidate,
  onProceed,
}: {
  gap: Gap;
  isValidating: boolean;
  validationResult: {
    isValid: boolean;
    missingCriticalFields: string[];
    missingOptionalFields: string[];
    suggestions: Array<{ field: string; message: string; required: boolean }>;
    canProceed: boolean;
    currentContext: any;
  } | null;
  onValidate: () => Promise<void>;
  onProceed: () => void;
}) {
  useEffect(() => {
    if (!validationResult && !isValidating) {
      onValidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationResult, isValidating]);

  if (isValidating || !validationResult) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">
            Validating available information...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Prepare Search Context</h3>
        <p className="text-sm text-muted-foreground mb-4">
          We need to verify we have enough information to find relevant articles for your business.
        </p>
      </div>

      {/* Show current context */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="font-medium">ICP:</span>{" "}
              <Badge variant={gap.icp ? "default" : "secondary"}>
                {gap.icp || "Missing"}
              </Badge>
            </div>
            <div>
              <span className="font-medium">Stage:</span>{" "}
              <Badge variant="default">{STAGE_DISPLAY[gap.stage]}</Badge>
            </div>
            <div>
              <span className="font-medium">Pain Cluster:</span>{" "}
              <Badge variant={gap.painCluster ? "default" : "secondary"}>
                {gap.painCluster || "Missing"}
              </Badge>
            </div>
            <div>
              <span className="font-medium">Industry:</span>{" "}
              <Badge variant={validationResult.currentContext?.industry ? "default" : "destructive"}>
                {validationResult.currentContext?.industry || "CRITICAL: Missing"}
              </Badge>
            </div>
            <div>
              <span className="font-medium">Value Prop:</span>{" "}
              <Badge variant={validationResult.currentContext?.valueProposition ? "default" : "destructive"}>
                {validationResult.currentContext?.valueProposition ? "✓ Set" : "CRITICAL: Missing"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Show missing fields */}
      {validationResult.missingCriticalFields.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Critical Information Missing</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p className="text-sm">
              We need the following information to find relevant articles. Please update your brand identity settings:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {validationResult.missingCriticalFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Show optional fields */}
      {validationResult.missingOptionalFields.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Optional Information</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="text-sm mb-2">
              Additional information that will improve search quality:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {validationResult.missingOptionalFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Proceed button */}
      <div className="flex gap-2">
        <Button
          onClick={onProceed}
          disabled={!validationResult.canProceed}
          className="flex-1"
        >
          {validationResult.canProceed ? (
            <>
              Proceed to Search
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          ) : (
            "Complete Required Fields First (Update Brand Identity)"
          )}
        </Button>
      </div>
    </div>
  );
}

function SourceSelectionStep({
  sources,
  selectedSources,
  onSourceToggle,
  onPreview,
  onProceed,
}: {
  sources: Array<{
    url: string;
    title: string;
    content: string;
    relevance: string;
    sourceType?: string;
    isReputable?: boolean;
  }>;
  selectedSources: Set<string>;
  onSourceToggle: (identifier: string) => void; // Supports both ID and URL
  onPreview: (source: { url: string; title: string; content: string }) => void;
  onProceed: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Research Sources</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Review the articles found and select which sources should be used in your content.
          Click on any source to preview its content.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          <strong>Selected:</strong> {selectedSources.size} of {sources.length} sources
        </p>
      </div>

      {/* Source list with checkboxes */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {sources.filter((source) => source.url).map((source, idx) => {
          // Support both ID-based (new) and URL-based (legacy) selection
          const sourceId = (source as any).id || source.url;
          const isSelected = selectedSources.has(sourceId) || selectedSources.has(source.url);
          const contentPreview = source.content?.substring(0, 300) || "No content preview available";
          const sourceTitle = source.title || "Untitled Source"; // Handle empty titles

          return (
            <Card
              key={sourceId || `source-${idx}`}
              className={`cursor-pointer transition-all ${
                isSelected ? "border-primary border-2 bg-primary/5" : ""
              }`}
              onClick={() => onSourceToggle(sourceId)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div className="mt-1 shrink-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onSourceToggle(sourceId)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Source content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium break-words">{sourceTitle}</h4>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-primary hover:underline flex items-center gap-1 mt-1 break-all"
                        >
                          {source.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        <Badge variant={source.isReputable ? "default" : "secondary"} className="text-xs">
                          {source.sourceType || "source"}
                        </Badge>
                        <Badge
                          variant={
                            source.relevance === "high"
                              ? "default"
                              : source.relevance === "medium"
                              ? "secondary"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {source.relevance}
                        </Badge>
                      </div>
                    </div>

                    {/* Content preview */}
                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                      <p className="line-clamp-3">{contentPreview}...</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreview({
                            url: source.url,
                            title: sourceTitle,
                            content: source.content || "",
                          });
                        }}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Preview Full Content
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(source.url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Open in New Tab
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Selection summary */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {selectedSources.size} source{selectedSources.size !== 1 ? "s" : ""} selected
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedSources.size === 0
                  ? "Select at least one source to proceed"
                  : selectedSources.size < 3
                  ? "Consider selecting 2-3 sources for better content quality"
                  : "Ready to generate content"}
              </p>
            </div>
            <Button
              onClick={onProceed}
              disabled={selectedSources.size === 0}
            >
              Proceed with Selected Sources
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
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
  icpOptions,
  isLoadingIcp,
  selectedICPTargets,
  onICPTargetsChange,
}: {
  gap: Gap;
  isDiscovering: boolean;
  trendingData: { topics: string[]; insights: string; sources: Array<{ url: string; title: string }> } | null;
  onDiscover: () => void;
  onSkip: () => void;
  productLines: ProductLine[];
  selectedProductLineId?: string;
  onProductLineChange: (productLineId: string | undefined) => void;
  icpOptions: string[];
  isLoadingIcp: boolean;
  selectedICPTargets: string[];
  onICPTargetsChange: (icpTargets: string[]) => void;
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
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">ICP Targets</Badge>
            </div>
            <MultiSelectCombobox
              options={icpOptions}
              value={selectedICPTargets}
              onChange={onICPTargetsChange}
              placeholder={isLoadingIcp ? "Loading job titles..." : "Select target audience..."}
              searchPlaceholder="Search ICP targets..."
              emptyText="No ICP targets found"
              disabled={isLoadingIcp}
              creatable={true}
              createText="Add as custom ICP"
            />
            {selectedICPTargets.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedICPTargets.map((icp, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {icp}
                  </Badge>
                ))}
              </div>
            )}
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Product Line</Badge>
              </div>
              <Select
                value={selectedProductLineId || "none"}
                onValueChange={(value) => onProductLineChange(value === "none" ? undefined : value)}
              >
                <SelectTrigger className="w-full max-w-[300px]">
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
  selectionGuidance,
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
  selectionGuidance?: string;
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

      {selectionGuidance && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              Selection Guidance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{selectionGuidance}</p>
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
              {idea.sections && idea.sections.length > 0 && (
                <div className="w-full overflow-hidden">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Sections
                  </p>
                  <ul className="text-sm break-words overflow-wrap-anywhere list-disc list-inside space-y-0.5">
                    {idea.sections.map((section, idx) => (
                      <li key={idx} className="text-muted-foreground">{section}</li>
                    ))}
                  </ul>
                </div>
              )}
              {idea.sourcesToUse && idea.sourcesToUse.length > 0 && (
                <div className="w-full overflow-hidden">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Sources to Use
                  </p>
                  <p className="text-sm break-words overflow-wrap-anywhere text-muted-foreground italic">
                    {idea.sourcesToUse.join(", ")}
                  </p>
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
  gap,
  isAdmin,
  apiWarnings,
  sources,
  onComplete,
  onExportBrief,
}: {
  brief: ContentBrief;
  idea: ContentIdea;
  gap: Gap | null;
  isAdmin: boolean;
  apiWarnings: Array<{ type: string; message: string; api: string }>;
  sources: Array<{ url: string; title: string; sourceType?: string; isReputable?: boolean }>;
  onComplete: () => void;
  onExportBrief: (format: "copy" | "pdf" | "docx") => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Content Brief</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Review the strategic brief with section-by-section guidance, content outline, and keyword optimization recommendations. This brief provides everything needed to produce publication-ready content aligned with your strategy.
        </p>
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

      {/* Sources Reference */}
      {sources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Research Sources</CardTitle>
            <CardDescription>
              {sources.length} source{sources.length > 1 ? "s" : ""} identified for content creation
                </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {sources.slice(0, 5).map((source, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 border rounded text-sm">
                  <ExternalLink className="h-3 w-3 mt-1 flex-shrink-0 text-muted-foreground" />
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                    className="text-primary hover:underline break-words flex-1"
                      >
                        {source.title}
                  </a>
                  </div>
                ))}
              {sources.length > 5 && (
                <p className="text-xs text-muted-foreground pt-2">
                  +{sources.length - 5} more source{sources.length - 5 > 1 ? "s" : ""}
                </p>
              )}
            </div>
        </CardContent>
      </Card>
      )}

      {/* Export and Complete Actions */}
      <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex-1">
          <Download className="h-4 w-4 mr-2" />
              Export Brief
        </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExportBrief("copy")}>
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExportBrief("pdf")}>
              <FileText className="h-4 w-4 mr-2" />
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExportBrief("docx")}>
              <Download className="h-4 w-4 mr-2" />
              Export as Document
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      <Button 
          onClick={onComplete} 
          className="flex-1" 
        size="lg"
        >
        Complete
        <CheckCircle2 className="h-4 w-4 ml-2" />
      </Button>
    </div>
    </div>
  );
}

// REMOVED: DraftGenerationStep and DraftReviewStep - brief is now the final deliverable

function CompleteStep({
  onReset,
  onClose,
  onExportIdeas,
  brief,
  idea,
  gap,
  trendingSources,
}: {
  onReset: () => void;
  onClose: () => void;
  onExportIdeas?: (format?: "copy" | "pdf" | "docx") => void;
  brief?: ContentBrief | null;
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
  return (
    <div className="space-y-4 text-center py-8">
      <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
      <h3 className="text-xl font-semibold">Content Brief Ready!</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Your strategic content brief with outline, keywords, and writing guidelines is complete. Export it, create another brief, or close.
      </p>

      {brief && idea && (
        <Card className="max-w-md mx-auto mt-4">
          <CardContent className="pt-4">
            <div className="text-left space-y-2">
              <p className="text-sm font-medium">Brief Summary</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary">{gap?.icp || "N/A"}</Badge>
                <Badge variant="outline">{gap ? STAGE_DISPLAY[gap.stage as FunnelStage] : "N/A"}</Badge>
                {gap?.painCluster && (
                  <Badge variant="outline">{gap.painCluster}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <strong>Primary Keyword:</strong> {brief.seoStrategy.primaryKeyword}
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Estimated Words:</strong> {brief.contentStructure.totalEstimatedWords}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 justify-center mt-6">
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
