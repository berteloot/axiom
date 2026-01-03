"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MultiSelectCombobox } from "@/components/ui/combobox"
import { EditableBadge } from "@/components/ui/editable-badge"
import { INDUSTRIES } from "@/lib/constants/industries"
import { BRAND_VOICES } from "@/lib/constants/brand-voices"
import { ALL_JOB_TITLES } from "@/lib/job-titles"
import { extractCustomTargets, isCustomTarget } from "@/lib/icp-targets"
import { Sparkles, Loader2, X, Check, Building2, Target, Zap, Users, TrendingUp, MessageSquare } from "lucide-react"

const brandIdentitySchema = z.object({
  brandVoice: z.array(z.string()).min(1, "Select at least one brand voice attribute"),
  competitors: z.array(z.string()),
  targetIndustries: z.array(z.string()).min(1, "Select at least one industry"),
  websiteUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  // Strategic fields
  valueProposition: z.string().optional().or(z.literal("")),
  painClusters: z.array(z.string()),
  keyDifferentiators: z.array(z.string()),
  primaryICPRoles: z.array(z.string()),
  useCases: z.array(z.string()),
  roiClaims: z.array(z.string()),
})

export type BrandIdentityFormData = z.infer<typeof brandIdentitySchema>

interface BrandIdentityFormProps {
  initialData?: {
    brandVoice?: string[]
    competitors?: string[]
    targetIndustries?: string[]
    websiteUrl?: string | null
    valueProposition?: string | null
    painClusters?: string[]
    keyDifferentiators?: string[]
    primaryICPRoles?: string[]
    useCases?: string[]
    roiClaims?: string[]
  }
  onSubmit: (data: BrandIdentityFormData) => Promise<void>
  isLoading?: boolean
}

// Reusable tag input component
function TagInput({
  value,
  onChange,
  placeholder,
  id,
  disabled,
}: {
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  id: string
  disabled?: boolean
}) {
  const [input, setInput] = React.useState("")

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault()
      if (!value.includes(input.trim())) {
        onChange([...value, input.trim()])
        setInput("")
      }
    }
  }

  const handleRemove = (item: string) => {
    onChange(value.filter((v) => v !== item))
  }

  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-secondary rounded-md"
            >
              {item}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  className="hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Detected info display type
interface DetectedInfo {
  productName: string
  tagline: string
  valueProposition: string
  brandVoice: string
  idealCustomerProfile: string
}

export function BrandIdentityForm({
  initialData,
  onSubmit,
  isLoading = false,
}: BrandIdentityFormProps) {
  const [icpOptions, setIcpOptions] = React.useState<string[]>(ALL_JOB_TITLES);
  const [isLoadingIcp, setIsLoadingIcp] = React.useState(true);
  const [customTargets, setCustomTargets] = React.useState<string[]>([]);

  const form = useForm<BrandIdentityFormData>({
    resolver: zodResolver(brandIdentitySchema),
    defaultValues: {
      brandVoice: initialData?.brandVoice || [],
      competitors: initialData?.competitors || [],
      targetIndustries: initialData?.targetIndustries || [],
      websiteUrl: initialData?.websiteUrl || "",
      valueProposition: initialData?.valueProposition || "",
      painClusters: initialData?.painClusters || [],
      keyDifferentiators: initialData?.keyDifferentiators || [],
      primaryICPRoles: initialData?.primaryICPRoles || [],
      useCases: initialData?.useCases || [],
      roiClaims: initialData?.roiClaims || [],
    },
  })

  // Fetch unified ICP targets on mount
  React.useEffect(() => {
    const fetchIcpTargets = async () => {
      try {
        const response = await fetch("/api/icp-targets");
        if (response.ok) {
          const data = await response.json();
          setIcpOptions(data.icpTargets || ALL_JOB_TITLES);
          setCustomTargets(data.customTargets || []);
        }
      } catch (error) {
        console.error("Error fetching ICP targets:", error);
      } finally {
        setIsLoadingIcp(false);
      }
    };
    fetchIcpTargets();
  }, []);

  // Auto-save custom ICP targets when they're created
  const handlePrimaryICPRolesChange = async (selected: string[]) => {
    form.setValue("primaryICPRoles", selected);
    
    // Extract custom targets (not in standard list)
    const customTargets = extractCustomTargets(selected, ALL_JOB_TITLES);
    
    // If there are custom targets, save them to the account
    if (customTargets.length > 0) {
      try {
        await fetch("/api/icp-targets/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets: customTargets }),
        });
        
        // Refresh the ICP options list to include the new custom targets
        const response = await fetch("/api/icp-targets");
        if (response.ok) {
          const data = await response.json();
          setIcpOptions(data.icpTargets || ALL_JOB_TITLES);
        }
      } catch (error) {
        console.error("Error saving custom ICP targets:", error);
      }
    }
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data)
  })

  const [isAnalyzing, setIsAnalyzing] = React.useState(false)
  const [isAnalyzingText, setIsAnalyzingText] = React.useState(false)
  const [analyzeError, setAnalyzeError] = React.useState<string | null>(null)
  const [analyzeTextError, setAnalyzeTextError] = React.useState<string | null>(null)
  const [detectedInfo, setDetectedInfo] = React.useState<DetectedInfo | null>(null)
  const [showDetectedSummary, setShowDetectedSummary] = React.useState(false)
  const [pastedText, setPastedText] = React.useState("")

  // Helper function to auto-fill form fields from extracted data
  const autoFillFromExtractedData = (data: any) => {
    // Store the full detected info for display
    if (data.detectedInfo) {
      setDetectedInfo(data.detectedInfo)
      setShowDetectedSummary(true)
    }

    // Auto-fill basic fields
    if (data.targetIndustries?.length > 0) {
      form.setValue("targetIndustries", data.targetIndustries)
    }
    
    if (data.brandVoice?.length > 0) {
      form.setValue("brandVoice", data.brandVoice)
    }
    
    if (data.competitors?.length > 0) {
      const currentCompetitors = form.getValues("competitors")
      const merged = [...new Set([...currentCompetitors, ...data.competitors])]
      form.setValue("competitors", merged)
    }

    // Auto-fill strategic fields
    if (data.detectedInfo?.valueProposition) {
      form.setValue("valueProposition", data.detectedInfo.valueProposition)
    }

    if (data.painClusters?.length > 0) {
      form.setValue("painClusters", data.painClusters)
    }

    if (data.keyDifferentiators?.length > 0) {
      form.setValue("keyDifferentiators", data.keyDifferentiators)
    }

    if (data.primaryICPRoles?.length > 0) {
      form.setValue("primaryICPRoles", data.primaryICPRoles)
    }

    if (data.useCases?.length > 0) {
      form.setValue("useCases", data.useCases)
    }

    if (data.roiClaims?.length > 0) {
      form.setValue("roiClaims", data.roiClaims)
    }
  }

  const handleAutoDetect = async () => {
    const websiteUrl = form.getValues("websiteUrl")
    
    if (!websiteUrl || websiteUrl.trim() === "") {
      setAnalyzeError("Please enter a website URL first")
      return
    }

    setIsAnalyzing(true)
    setAnalyzeError(null)
    setDetectedInfo(null)

    try {
      const response = await fetch("/api/profile/analyze-website", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: websiteUrl }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to analyze website")
      }

      const result = await response.json()
      const { data } = result

      autoFillFromExtractedData(data)
      setAnalyzeError(null)
    } catch (error) {
      console.error("Error auto-detecting profile:", error)
      setAnalyzeError(
        error instanceof Error 
          ? error.message 
          : "Failed to analyze website. Please try again."
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleExtractFromText = async () => {
    if (!pastedText || pastedText.trim().length < 50) {
      setAnalyzeTextError("Please paste at least 50 characters of text (e.g., brand guide, value proposition, company description)")
      return
    }

    setIsAnalyzingText(true)
    setAnalyzeTextError(null)
    setDetectedInfo(null)

    try {
      const response = await fetch("/api/profile/analyze-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: pastedText }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to extract information from text")
      }

      const result = await response.json()
      const { data } = result

      autoFillFromExtractedData(data)
      setAnalyzeTextError(null)
    } catch (error) {
      console.error("Error extracting from text:", error)
      setAnalyzeTextError(
        error instanceof Error 
          ? error.message 
          : "Failed to extract information from text. Please try again."
      )
    } finally {
      setIsAnalyzingText(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Website URL with Auto-Detect */}
      <div className="space-y-2 p-4 border border-dashed border-primary/30 rounded-lg bg-primary/5">
        <Label htmlFor="websiteUrl" className="text-base font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Quick Start: Auto-Detect from Website
        </Label>
        <div className="flex gap-2">
          <Input
            id="websiteUrl"
            {...form.register("websiteUrl")}
            placeholder="https://example.com or www.example.com"
            type="url"
            className="flex-1"
            disabled={isAnalyzing || isAnalyzingText}
          />
          <Button
            type="button"
            variant="default"
            onClick={handleAutoDetect}
            disabled={isAnalyzing || isAnalyzingText || isLoading}
            className="whitespace-nowrap"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Auto-Detect
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste your website URL to automatically detect your company profile, pain points, ICP, and more.
        </p>
        {analyzeError && (
          <p className="text-sm text-red-500">{analyzeError}</p>
        )}
        {form.formState.errors.websiteUrl && (
          <p className="text-sm text-red-500">{form.formState.errors.websiteUrl.message}</p>
        )}
      </div>

      {/* Text Paste with Extract */}
      <div className="space-y-2 p-4 border border-dashed border-primary/30 rounded-lg bg-primary/5">
        <Label htmlFor="pastedText" className="text-base font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Or: Extract from Pasted Text
        </Label>
        <div className="space-y-2">
          <Textarea
            id="pastedText"
            value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value)
              setAnalyzeTextError(null)
            }}
            placeholder="Paste your brand guide, value proposition document, company description, or any text that describes your company, products, target customers, pain points, etc. (minimum 50 characters)"
            rows={6}
            className="font-mono text-sm"
            disabled={isAnalyzing || isAnalyzingText}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="default"
              onClick={handleExtractFromText}
              disabled={isAnalyzing || isAnalyzingText || isLoading || !pastedText.trim()}
              className="whitespace-nowrap"
            >
              {isAnalyzingText ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Extract Information
                </>
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste text from brand guides, value propositions, company descriptions, or marketing materials. The AI will extract pain clusters, ICP roles, value proposition, differentiators, use cases, and more.
        </p>
        {analyzeTextError && (
          <p className="text-sm text-red-500">{analyzeTextError}</p>
        )}
      </div>

      {/* Detected Summary Card */}
      {showDetectedSummary && detectedInfo && (
        <div className="p-4 border border-green-500/30 rounded-lg bg-green-500/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium flex items-center gap-2 text-green-700 dark:text-green-400">
              <Check className="h-4 w-4" />
              AI Analysis Complete
            </h3>
            <button
              type="button"
              onClick={() => setShowDetectedSummary(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            {/* Company Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Detected Company
              </div>
              <div className="pl-6 space-y-1">
                <p className="font-semibold">{detectedInfo.productName}</p>
                <p className="text-sm text-muted-foreground italic">&quot;{detectedInfo.tagline}&quot;</p>
              </div>
            </div>

            {/* Brand Voice */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Brand Voice
              </div>
              <p className="pl-6 text-sm">{detectedInfo.brandVoice}</p>
            </div>

            {/* ICP */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                Ideal Customer
              </div>
              <p className="pl-6 text-sm">{detectedInfo.idealCustomerProfile}</p>
            </div>

            {/* Value Prop */}
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Value Proposition
              </div>
              <p className="pl-6 text-sm">{detectedInfo.valueProposition}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-2 border-t">
            ✓ Form fields below have been auto-filled. Review and edit as needed before saving.
          </p>
        </div>
      )}

      {/* Value Proposition */}
      <div className="space-y-2">
        <Label htmlFor="valueProposition" className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          Value Proposition
        </Label>
        <Textarea
          id="valueProposition"
          {...form.register("valueProposition")}
          placeholder="We help [Target] achieve [Outcome] by [Mechanism]"
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Your core promise to customers
        </p>
      </div>

      {/* Pain Clusters */}
      <div className="space-y-2">
        <Label htmlFor="painClusters" className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          Pain Clusters
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Key for Asset Analysis</span>
        </Label>
        <TagInput
          id="painClusters"
          value={form.watch("painClusters")}
          onChange={(value) => form.setValue("painClusters", value)}
          placeholder="e.g., Data Silos, Manual Processes, Compliance Risk (press Enter)"
        />
        <p className="text-xs text-muted-foreground">
          Core problems your product solves. Assets will be categorized by these pain points.
        </p>
      </div>

      {/* Primary ICP Roles */}
      <div className="space-y-2">
        <Label htmlFor="primaryICPRoles" className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Primary ICP Roles
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Key for Asset Analysis</span>
        </Label>
        <MultiSelectCombobox
          options={icpOptions}
          value={form.watch("primaryICPRoles")}
          onChange={handlePrimaryICPRolesChange}
          placeholder={isLoadingIcp ? "Loading job titles..." : "Select or create job titles..."}
          searchPlaceholder="Search job titles..."
          emptyText="No job titles found."
          creatable={true}
          createText="Create"
        />
        {form.watch("primaryICPRoles") && form.watch("primaryICPRoles").length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {form.watch("primaryICPRoles").map((role, idx) => {
              const isCustom = isCustomTarget(role);
              
              if (isCustom) {
                return (
                  <EditableBadge
                    key={idx}
                    value={role}
                    isCustom={true}
                    variant="secondary"
                    onRemove={() => {
                      const newRoles = form.watch("primaryICPRoles").filter((_, i) => i !== idx);
                      form.setValue("primaryICPRoles", newRoles);
                    }}
                    onSave={async (newValue) => {
                      try {
                        const response = await fetch("/api/icp-targets/update", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ oldTarget: role, newTarget: newValue }),
                        });
                        
                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || "Failed to update ICP target");
                        }
                        
                        // Update the form data
                        const updatedRoles = form.watch("primaryICPRoles").map(
                          r => r === role ? newValue : r
                        );
                        form.setValue("primaryICPRoles", updatedRoles);
                        
                        // Refresh the ICP options list
                        const refreshResponse = await fetch("/api/icp-targets");
                        if (refreshResponse.ok) {
                          const data = await refreshResponse.json();
                          setIcpOptions(data.icpTargets || ALL_JOB_TITLES);
                          setCustomTargets(data.customTargets || []);
                        }
                      } catch (error) {
                        console.error("Error updating ICP target:", error);
                        throw error;
                      }
                    }}
                    className="text-sm"
                  />
                );
              }
              
              return (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-secondary rounded-md"
                >
                  {role}
                  <button
                    type="button"
                    onClick={() => {
                      const newRoles = form.watch("primaryICPRoles").filter((_, i) => i !== idx)
                      form.setValue("primaryICPRoles", newRoles)
                    }}
                    className="hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Job titles of your target buyers. Assets will be matched to these personas. You can select from the list or create custom titles.
        </p>
      </div>

      {/* Brand Voice */}
      <div className="space-y-2">
        <Label htmlFor="brandVoice">Brand Voice</Label>
        <MultiSelectCombobox
          options={[...BRAND_VOICES]}
          value={form.watch("brandVoice")}
          onChange={(value) => form.setValue("brandVoice", value)}
          placeholder="Select brand voice attributes..."
          searchPlaceholder="Search brand voices..."
        />
        <p className="text-xs text-muted-foreground">
          How your company communicates
        </p>
        {form.formState.errors.brandVoice && (
          <p className="text-sm text-red-500">{form.formState.errors.brandVoice.message}</p>
        )}
      </div>

      {/* Target Industries */}
      <div className="space-y-2">
        <Label htmlFor="targetIndustries">Target Industries</Label>
        <MultiSelectCombobox
          options={[...INDUSTRIES]}
          value={form.watch("targetIndustries")}
          onChange={(value) => form.setValue("targetIndustries", value)}
          placeholder="Select industries..."
          searchPlaceholder="Search industries..."
        />
        <p className="text-xs text-muted-foreground">
          Industries your company serves
        </p>
        {form.formState.errors.targetIndustries && (
          <p className="text-sm text-red-500">{form.formState.errors.targetIndustries.message}</p>
        )}
      </div>

      {/* Key Differentiators */}
      <div className="space-y-2">
        <Label htmlFor="keyDifferentiators" className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          Key Differentiators
        </Label>
        <TagInput
          id="keyDifferentiators"
          value={form.watch("keyDifferentiators")}
          onChange={(value) => form.setValue("keyDifferentiators", value)}
          placeholder="e.g., AI-Powered, No-Code, Enterprise Security (press Enter)"
        />
        <p className="text-xs text-muted-foreground">
          What makes you different from competitors
        </p>
      </div>

      {/* Use Cases */}
      <div className="space-y-2">
        <Label htmlFor="useCases">Use Cases</Label>
        <TagInput
          id="useCases"
          value={form.watch("useCases")}
          onChange={(value) => form.setValue("useCases", value)}
          placeholder="e.g., Sales Pipeline Management, Customer Onboarding (press Enter)"
        />
        <p className="text-xs text-muted-foreground">
          How customers use your product
        </p>
      </div>

      {/* Competitors */}
      <div className="space-y-2">
        <Label htmlFor="competitors">Main Competitors</Label>
        <TagInput
          id="competitors"
          value={form.watch("competitors")}
          onChange={(value) => form.setValue("competitors", value)}
          placeholder="Type competitor name and press Enter"
        />
        <p className="text-xs text-muted-foreground">
          Your main competitors
        </p>
      </div>

      {/* ROI Claims */}
      <div className="space-y-2">
        <Label htmlFor="roiClaims" className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          ROI Claims
        </Label>
        <TagInput
          id="roiClaims"
          value={form.watch("roiClaims")}
          onChange={(value) => form.setValue("roiClaims", value)}
          placeholder="e.g., 40% cost reduction, 3x faster deployment (press Enter)"
        />
        <p className="text-xs text-muted-foreground">
          Specific metrics and results you can claim
        </p>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Saving..." : "Save Brand Identity"}
      </Button>
    </form>
  )
}
