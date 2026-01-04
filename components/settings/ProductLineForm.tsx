"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { MultiSelectCombobox } from "@/components/ui/combobox"
import { ALL_JOB_TITLES } from "@/lib/job-titles"
import { Sparkles, Loader2, X } from "lucide-react"

const productLineSchema = z.object({
  name: z.string().min(1, "Product line name is required"),
  description: z.string().optional(),
  valueProposition: z.string().optional(),
  specificICP: z.array(z.string()).optional(),
})

export type ProductLineFormData = {
  name: string
  description?: string
  valueProposition?: string
  specificICP?: string[]
}

interface ProductLineFormProps {
  initialData?: {
    name?: string
    description?: string
    valueProposition?: string
    specificICP?: string[]
  }
  onSubmit: (data: ProductLineFormData) => Promise<void>
  onCancel?: () => void
  isLoading?: boolean
}

export function ProductLineForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: ProductLineFormProps) {
  const form = useForm<ProductLineFormData>({
    resolver: zodResolver(productLineSchema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      valueProposition: initialData?.valueProposition || "",
      specificICP: initialData?.specificICP || [],
    },
  })

  const { reset } = form

  // Reset form when initialData changes (important for edit mode)
  React.useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name || "",
        description: initialData.description || "",
        valueProposition: initialData.valueProposition || "",
        specificICP: initialData.specificICP || [],
      })
    } else {
      reset({
        name: "",
        description: "",
        valueProposition: "",
        specificICP: [],
      })
    }
  }, [initialData, reset])

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data)
  })

  const [isAnalyzingText, setIsAnalyzingText] = React.useState(false)
  const [analyzeTextError, setAnalyzeTextError] = React.useState<string | null>(null)
  const [pastedText, setPastedText] = React.useState("")
  const [icpOptions, setIcpOptions] = React.useState<string[]>(ALL_JOB_TITLES)
  const [isLoadingIcp, setIsLoadingIcp] = React.useState(true)

  // Fetch unified ICP targets on mount
  React.useEffect(() => {
    const fetchIcpTargets = async () => {
      setIsLoadingIcp(true)
      try {
        const response = await fetch("/api/icp-targets")
        if (response.ok) {
          const data = await response.json()
          setIcpOptions(data.icpTargets || ALL_JOB_TITLES)
        }
      } catch (error) {
        console.error("Error fetching ICP targets:", error)
      } finally {
        setIsLoadingIcp(false)
      }
    }
    fetchIcpTargets()
  }, [])

  const handleExtractFromText = async () => {
    if (!pastedText || pastedText.trim().length < 50) {
      setAnalyzeTextError("Please paste at least 50 characters of text (e.g., product description, product sheet, marketing material)")
      return
    }

    setIsAnalyzingText(true)
    setAnalyzeTextError(null)

    try {
      const response = await fetch("/api/product-lines/analyze-text", {
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

      // Auto-fill form fields from extracted data
      if (data.name) {
        form.setValue("name", data.name)
      }

      if (data.description) {
        form.setValue("description", data.description)
      }

      if (data.valueProposition) {
        form.setValue("valueProposition", data.valueProposition)
      }

      // specificICP from AI might be a string description - we'll skip auto-fill for this field
      // since it now expects an array of ICP targets from the dropdown

      setAnalyzeTextError(null)
      setPastedText("") // Clear the textarea after successful extraction
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
      {/* Text Paste with Extract */}
      <div className="space-y-2 p-4 border border-dashed border-primary/30 rounded-lg bg-primary/5">
        <Label htmlFor="pastedText" className="text-base font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Quick Start: Extract from Pasted Text
        </Label>
        <div className="space-y-2">
          <Textarea
            id="pastedText"
            value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value)
              setAnalyzeTextError(null)
            }}
            placeholder="Paste your product description, product sheet, marketing material, or any text that describes this specific product line (minimum 50 characters)"
            rows={4}
            className="font-mono text-sm"
            disabled={isAnalyzingText || isLoading}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="default"
              onClick={handleExtractFromText}
              disabled={isAnalyzingText || isLoading || !pastedText.trim()}
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
          Paste text from product descriptions, product sheets, or marketing materials. The AI will extract the product line name, description, value proposition, and target audience.
        </p>
        {analyzeTextError && (
          <p className="text-sm text-red-500">{analyzeTextError}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Product Line Name</Label>
        <Input
          id="name"
          {...form.register("name")}
          placeholder="e.g., Cloud Services, Consumer Electronics, Residential Solar"
        />
        <p className="text-xs text-muted-foreground">
          A broad category, product line, business unit, service offering, or other dimension within your company (e.g., &quot;Cloud Services&quot;, &quot;Consumer Electronics&quot;, &quot;Enterprise Solutions&quot;).
        </p>
        {form.formState.errors.name && (
          <p className="text-sm text-red-500">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          Description <span className="text-xs text-muted-foreground">(Optional)</span>
        </Label>
        <Textarea
          id="description"
          {...form.register("description")}
          placeholder="Describe this product line or category..."
          rows={3}
        />
        {form.formState.errors.description && (
          <p className="text-sm text-red-500">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="valueProposition">
          Key Value Proposition <span className="text-xs text-muted-foreground">(Optional)</span>
        </Label>
        <Textarea
          id="valueProposition"
          {...form.register("valueProposition")}
          placeholder="What makes THIS product line unique? Why would customers choose it?"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Specific to this product line, not your general company value prop. You can add this later.
        </p>
        {form.formState.errors.valueProposition && (
          <p className="text-sm text-red-500">
            {form.formState.errors.valueProposition.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="specificICP">
          Target Audience <span className="text-xs text-muted-foreground">(Optional)</span>
        </Label>
        <MultiSelectCombobox
          options={icpOptions}
          value={form.watch("specificICP") || []}
          onChange={(selected) => form.setValue("specificICP", selected)}
          placeholder={isLoadingIcp ? "Loading ICP targets..." : "Select target audience..."}
          searchPlaceholder="Search ICP targets..."
          emptyText="No ICP targets found"
          disabled={isLoadingIcp || isLoading}
        />
        {form.watch("specificICP") && form.watch("specificICP")!.length > 0 && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              {form.watch("specificICP")!.length} selected ICP target{form.watch("specificICP")!.length !== 1 ? "s" : ""}:
            </p>
            <div className="flex flex-wrap gap-2">
              {form.watch("specificICP")!.map((icp) => (
                <Badge
                  key={icp}
                  variant="secondary"
                  className="text-xs pr-1"
                >
                  {icp}
                  <button
                    type="button"
                    onClick={() => {
                      const current = form.watch("specificICP") || []
                      form.setValue("specificICP", current.filter((item) => item !== icp))
                    }}
                    className="ml-1.5 rounded-full hover:bg-secondary-foreground/20 p-0.5"
                    aria-label={`Remove ${icp}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Select the ICP roles that this product line targets. Uses the same options as asset ICP targets.
        </p>
        {form.formState.errors.specificICP && (
          <p className="text-sm text-red-500">
            {form.formState.errors.specificICP.message}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Product Line"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
