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
import { INDUSTRIES } from "@/lib/constants/industries"

const companyProfileSchema = z.object({
  productName: z.string().min(1, "Product name is required"),
  productDescription: z.string().min(1, "Product description is required"),
  valueProposition: z.string().min(1, "Value proposition is required"),
  targetIndustries: z.array(z.string()).min(1, "Select at least one industry"),
  idealCustomerProfile: z.string().min(1, "Ideal customer profile is required"),
  competitors: z.array(z.string()),
  brandVoice: z.string().min(1, "Brand voice is required"),
})

export type CompanyProfileFormData = z.infer<typeof companyProfileSchema>

interface CompanyProfileFormProps {
  initialData?: {
    productName?: string
    productDescription?: string
    valueProposition?: string
    targetIndustries?: string[]
    idealCustomerProfile?: string
    competitors?: string[]
    brandVoice?: string
  }
  onSubmit: (data: CompanyProfileFormData) => Promise<void>
  isLoading?: boolean
}

export function CompanyProfileForm({
  initialData,
  onSubmit,
  isLoading = false,
}: CompanyProfileFormProps) {
  const form = useForm<CompanyProfileFormData>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      productName: initialData?.productName || "",
      productDescription: initialData?.productDescription || "",
      valueProposition: initialData?.valueProposition || "",
      targetIndustries: initialData?.targetIndustries || [],
      idealCustomerProfile: initialData?.idealCustomerProfile || "",
      competitors: initialData?.competitors || [],
      brandVoice: initialData?.brandVoice || "",
    },
  })

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data)
  })

  // For competitors, we'll use a simple tag input approach
  // Users can type and press enter to add competitors
  const [competitorInput, setCompetitorInput] = React.useState("")

  const handleAddCompetitor = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && competitorInput.trim()) {
      e.preventDefault()
      const currentCompetitors = form.getValues("competitors")
      if (!currentCompetitors.includes(competitorInput.trim())) {
        form.setValue("competitors", [...currentCompetitors, competitorInput.trim()])
        setCompetitorInput("")
      }
    }
  }

  const handleRemoveCompetitor = (competitor: string) => {
    const currentCompetitors = form.getValues("competitors")
    form.setValue(
      "competitors",
      currentCompetitors.filter((c) => c !== competitor)
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="productName">Product Name</Label>
        <Input
          id="productName"
          {...form.register("productName")}
          placeholder="e.g., AI-powered CRM for Dentists"
        />
        {form.formState.errors.productName && (
          <p className="text-sm text-red-500">
            {form.formState.errors.productName.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="productDescription">Product Description</Label>
        <Textarea
          id="productDescription"
          {...form.register("productDescription")}
          placeholder="Describe what your product or service does..."
          rows={4}
        />
        {form.formState.errors.productDescription && (
          <p className="text-sm text-red-500">
            {form.formState.errors.productDescription.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="valueProposition">Value Proposition</Label>
        <Textarea
          id="valueProposition"
          {...form.register("valueProposition")}
          placeholder="What is your core value prop? Why do customers choose you?"
          rows={3}
        />
        {form.formState.errors.valueProposition && (
          <p className="text-sm text-red-500">
            {form.formState.errors.valueProposition.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="targetIndustries">Target Industries</Label>
        <MultiSelectCombobox
          options={[...INDUSTRIES]}
          value={form.watch("targetIndustries")}
          onChange={(value) => form.setValue("targetIndustries", value)}
          placeholder="Select industries..."
          searchPlaceholder="Search industries..."
        />
        {form.formState.errors.targetIndustries && (
          <p className="text-sm text-red-500">
            {form.formState.errors.targetIndustries.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="idealCustomerProfile">Ideal Customer Profile (ICP)</Label>
        <Textarea
          id="idealCustomerProfile"
          {...form.register("idealCustomerProfile")}
          placeholder="Describe your perfect buyer (role, company size, pain points)..."
          rows={3}
        />
        {form.formState.errors.idealCustomerProfile && (
          <p className="text-sm text-red-500">
            {form.formState.errors.idealCustomerProfile.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="competitors">Competitors</Label>
        <Input
          id="competitors"
          value={competitorInput}
          onChange={(e) => setCompetitorInput(e.target.value)}
          onKeyDown={handleAddCompetitor}
          placeholder="Type competitor name and press Enter to add"
        />
        {form.watch("competitors").length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {form.watch("competitors").map((competitor) => (
              <span
                key={competitor}
                className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-secondary rounded-md"
              >
                {competitor}
                <button
                  type="button"
                  onClick={() => handleRemoveCompetitor(competitor)}
                  className="hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="brandVoice">Brand Voice</Label>
        <Input
          id="brandVoice"
          {...form.register("brandVoice")}
          placeholder="e.g., Professional & Authoritative, Playful & Disruptive"
        />
        {form.formState.errors.brandVoice && (
          <p className="text-sm text-red-500">
            {form.formState.errors.brandVoice.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Company Profile"}
      </Button>
    </form>
  )
}
