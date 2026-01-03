"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BrandIdentityForm, BrandIdentityFormData } from "@/components/settings/BrandIdentityForm"
import { ProductLinesManager } from "@/components/settings/ProductLinesManager"
import { ProductLineFormData } from "@/components/settings/ProductLineForm"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Building2, Package, AlertCircle, CheckCircle2 } from "lucide-react"
import { Separator } from "@/components/ui/separator"

interface BrandContext {
  id: string
  brandVoice: string[]
  competitors: string[]
  targetIndustries: string[]
  websiteUrl: string | null
  valueProposition: string | null
  painClusters: string[]
  keyDifferentiators: string[]
  primaryICPRoles: string[]
  useCases: string[]
  roiClaims: string[]
}

interface ProductLine {
  id: string
  name: string
  description: string
  valueProposition: string
  specificICP: string
  createdAt: string
}

export default function BrandSettingsPage() {
  const router = useRouter()
  const [brandContext, setBrandContext] = React.useState<BrandContext | null>(null)
  const [productLines, setProductLines] = React.useState<ProductLine[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)

  // Fetch brand context and product lines on mount
  React.useEffect(() => {
    fetchBrandData()
  }, [])

  const fetchBrandData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await fetch("/api/brand-context")
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to fetch brand context")
      }

      const data = await response.json()
      setBrandContext(data.brandContext)
      setProductLines(data.productLines || [])
    } catch (err) {
      console.error("Error fetching brand data:", err)
      setError(err instanceof Error ? err.message : "Failed to load brand data")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBrandContextSubmit = async (data: BrandIdentityFormData) => {
    try {
      setIsSaving(true)
      setError(null)
      setSuccessMessage(null)

      const method = brandContext ? "PATCH" : "POST"
      const response = await fetch("/api/brand-context", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to save brand context")
      }

      const result = await response.json()
      setBrandContext(result.brandContext)
      setSuccessMessage("Brand context saved successfully!")
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error("Error saving brand context:", err)
      setError(err instanceof Error ? err.message : "Failed to save brand context")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddProductLine = async (data: ProductLineFormData) => {
    try {
      setError(null)
      setSuccessMessage(null)

      const response = await fetch("/api/product-lines", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create product line")
      }

      const result = await response.json()
      setProductLines([...productLines, result.productLine])
      setSuccessMessage("Product line created successfully!")
      
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error("Error creating product line:", err)
      setError(err instanceof Error ? err.message : "Failed to create product line")
      throw err // Re-throw to let the form handle it
    }
  }

  const handleUpdateProductLine = async (id: string, data: ProductLineFormData) => {
    try {
      setError(null)
      setSuccessMessage(null)

      const response = await fetch(`/api/product-lines/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update product line")
      }

      const result = await response.json()
      setProductLines(productLines.map(pl => pl.id === id ? result.productLine : pl))
      setSuccessMessage("Product line updated successfully!")
      
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error("Error updating product line:", err)
      setError(err instanceof Error ? err.message : "Failed to update product line")
      throw err
    }
  }

  const handleDeleteProductLine = async (id: string) => {
    try {
      setError(null)
      setSuccessMessage(null)

      const response = await fetch(`/api/product-lines/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete product line")
      }

      setProductLines(productLines.filter(pl => pl.id !== id))
      setSuccessMessage("Product line deleted successfully!")
      
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error("Error deleting product line:", err)
      setError(err instanceof Error ? err.message : "Failed to delete product line")
      throw err
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-6xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Brand Context & Product Lines</h1>
        <p className="text-muted-foreground mt-2">
          Define your brand identity and product lines to help the AI categorize and analyze your assets more accurately.
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Brand Context Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Brand Context</CardTitle>
          </div>
          <CardDescription>
            Global company identity and strategic context. This information applies to your entire organization
            and helps the AI understand your positioning, target market, and key differentiators.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandIdentityForm
            initialData={brandContext || undefined}
            onSubmit={handleBrandContextSubmit}
            isLoading={isSaving}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Product Lines Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <CardTitle>Product Lines</CardTitle>
          </div>
          <CardDescription>
            Define specific products or categories within your company. Each asset can be matched to a product line
            to help with organization and targeted analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!brandContext ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please save your Brand Context above before adding Product Lines.
              </AlertDescription>
            </Alert>
          ) : (
            <ProductLinesManager
              productLines={productLines}
              onAdd={handleAddProductLine}
              onUpdate={handleUpdateProductLine}
              onDelete={handleDeleteProductLine}
              isLoading={isSaving}
            />
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>How this works:</strong> When you upload assets, the AI will use your Brand Context and Product Lines
          to categorize them more accurately. Assets will be automatically matched to the most relevant product line,
          and the AI will use your defined pain clusters and ICP roles for consistent tagging.
        </AlertDescription>
      </Alert>
    </div>
  )
}
