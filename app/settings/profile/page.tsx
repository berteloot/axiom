"use client"

import { useEffect, useState } from "react"
import { useAccount } from "@/lib/account-context"
import { BrandIdentityForm, BrandIdentityFormData } from "@/components/settings/BrandIdentityForm"
import { ProductLinesManager } from "@/components/settings/ProductLinesManager"
import { ProductLineFormData } from "@/components/settings/ProductLineForm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { AlertCircle, Building2, Loader2, Sparkles, Package } from "lucide-react"
import Link from "next/link"

export default function CompanyProfilePage() {
  const { currentAccount, isLoading: isAccountLoading } = useAccount()
  const [brandContext, setBrandContext] = useState<any>(null)
  const [productLines, setProductLines] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch data when account changes
  useEffect(() => {
    if (currentAccount) {
      // Check cache first
      const cacheKey = `settings-profile-${currentAccount.id}`
      const cachedData = sessionStorage.getItem(cacheKey)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData)
          setBrandContext(parsed.brandContext)
          setProductLines(parsed.productLines || [])
          setIsLoading(false)
          // Still fetch in background to update data
          fetchData(false)
        } catch (error) {
          // If cache is invalid, fetch with loading state
          fetchData(true)
        }
      } else {
        // No cache, fetch with loading state
        fetchData(true)
      }
    } else {
      setBrandContext(null)
      setProductLines([])
      setIsLoading(false)
    }
  }, [currentAccount?.id])

  const fetchData = async (showLoader = true) => {
    if (showLoader) setIsLoading(true)
    setError(null)
    try {
      // Fetch brand context
      const brandResponse = await fetch("/api/brand-context")
      let brandContextData = null
      if (brandResponse.ok) {
        const brandData = await brandResponse.json()
        brandContextData = brandData.brandContext
        setBrandContext(brandContextData)
      } else if (brandResponse.status !== 400) {
        // Only show error if it's not a "No account selected" error (400)
        // 400 errors are expected when no account is selected
        const errorData = await brandResponse.json().catch(() => ({}))
        console.error("Error fetching brand context:", errorData.error || "Unknown error")
      }

      // Fetch product lines
      const productResponse = await fetch("/api/product-lines")
      let productLinesData = []
      if (productResponse.ok) {
        const productData = await productResponse.json()
        productLinesData = productData.productLines || []
        setProductLines(productLinesData)
      } else if (productResponse.status !== 400) {
        // Only show error if it's not a "No account selected" error (400)
        const errorData = await productResponse.json().catch(() => ({}))
        console.error("Error fetching product lines:", errorData.error || "Unknown error")
      }

      // Cache the data
      if (currentAccount) {
        const cacheKey = `settings-profile-${currentAccount.id}`
        sessionStorage.setItem(cacheKey, JSON.stringify({
          brandContext: brandContextData,
          productLines: productLinesData
        }))
      }
    } catch (error) {
      console.error("Error fetching data:", error)
      setError("Failed to load data. Please try again.")
    } finally {
      if (showLoader) setIsLoading(false)
    }
  }

  const handleBrandIdentitySubmit = async (data: BrandIdentityFormData) => {
    if (!currentAccount) {
      setError("Please select an account first")
      return
    }
    
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      // Use PATCH if brand context exists, POST if it doesn't
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
        throw new Error(errorData.error || "Failed to save brand identity")
      }

      const result = await response.json()
      setBrandContext(result.brandContext)
      // Clear cache to ensure fresh data on next load
      if (currentAccount) {
        sessionStorage.removeItem(`settings-profile-${currentAccount.id}`)
      }
      setSuccessMessage("Brand identity saved successfully!")
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      console.error("Error saving brand identity:", error)
      setError(error instanceof Error ? error.message : "Failed to save brand identity. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleProductLineAdd = async (data: ProductLineFormData) => {
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch("/api/product-lines", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || "Failed to create product line"
        setError(errorMessage)
        throw new Error(errorMessage)
      }

      const result = await response.json()
      setProductLines([...productLines, result.productLine])
      // Clear cache to ensure fresh data on next load
      if (currentAccount) {
        sessionStorage.removeItem(`settings-profile-${currentAccount.id}`)
      }
      setSuccessMessage("Product line added successfully!")
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      console.error("Error creating product line:", error)
      // Error is already set in setError above, but we still throw to let ProductLinesManager handle it
      throw error
    }
  }

  const handleProductLineUpdate = async (id: string, data: ProductLineFormData) => {
    setError(null)
    setSuccessMessage(null)
    try {
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
      // Clear cache to ensure fresh data on next load
      if (currentAccount) {
        sessionStorage.removeItem(`settings-profile-${currentAccount.id}`)
      }
      setSuccessMessage("Product line updated successfully!")
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      console.error("Error updating product line:", error)
      throw error
    }
  }

  const handleProductLineDelete = async (id: string) => {
    setError(null)
    setSuccessMessage(null)
    try {
      const response = await fetch(`/api/product-lines/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete product line")
      }

      setProductLines(productLines.filter(line => line.id !== id))
      // Clear cache to ensure fresh data on next load
      if (currentAccount) {
        sessionStorage.removeItem(`settings-profile-${currentAccount.id}`)
      }
      setSuccessMessage("Product line deleted successfully!")
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      console.error("Error deleting product line:", error)
      throw error
    }
  }

  // Loading state for account context
  if (isAccountLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // No account selected state
  if (!currentAccount) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
          <CardDescription>
            Configure your company context to improve AI analysis quality.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Account Selected</h3>
            <p className="text-muted-foreground mb-6">
              Please create or select an account to configure its company profile.
            </p>
            <Button asChild>
              <Link href="/settings/accounts">
                <Building2 className="h-4 w-4 mr-2" />
                Manage Accounts
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Context</CardTitle>
          <CardDescription>
            Loading context for <strong>{currentAccount.name}</strong>...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Company Context</CardTitle>
            <CardDescription>
              Configure the brand identity and product portfolio for <strong>{currentAccount.name}</strong> to improve AI analysis quality.
            </CardDescription>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{currentAccount.name}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Success message */}
        {successMessage && (
          <div
            role="status"
            className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 text-sm"
          >
            <Sparkles className="h-4 w-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-sm"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tabs for Brand Identity and Product Lines */}
        <Tabs defaultValue="brand" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="brand" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Brand Identity
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Product Lines
            </TabsTrigger>
          </TabsList>

          <TabsContent value="brand" className="space-y-4 mt-6">
            <div className="p-4 rounded-lg bg-muted/50 border border-border mb-4">
              <h4 className="font-medium mb-2">What is Brand Identity?</h4>
              <p className="text-sm text-muted-foreground">
                This is your company&apos;s &quot;umbrella&quot; context—things that stay consistent across all products:
                brand voice, main competitors, and target industries.
              </p>
            </div>

            <BrandIdentityForm
              initialData={brandContext || undefined}
              onSubmit={handleBrandIdentitySubmit}
              isLoading={isSaving}
            />
          </TabsContent>

          <TabsContent value="products" className="space-y-4 mt-6">
            <div className="p-4 rounded-lg bg-muted/50 border border-border mb-4">
              <h4 className="font-medium mb-2">Why Product Lines?</h4>
              <p className="text-sm text-muted-foreground">
                If your company has multiple products or categories (e.g., &quot;Cloud Services&quot; vs. &quot;Consumer Electronics&quot;),
                define them here. The AI will identify which product line each asset belongs to and analyze it accordingly.
              </p>
            </div>

            <ProductLinesManager
              productLines={productLines}
              onAdd={handleProductLineAdd}
              onUpdate={handleProductLineUpdate}
              onDelete={handleProductLineDelete}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
