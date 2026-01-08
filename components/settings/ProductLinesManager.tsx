"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ProductLineForm, ProductLineFormData } from "./ProductLineForm"
import { ProductLineReviewModal } from "./ProductLineReviewModal"
import { Plus, Trash2, Package, AlertCircle, Pencil, Eye } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatDistanceToNow } from "date-fns"

interface ProductLine {
  id: string
  name: string
  description: string
  valueProposition: string
  specificICP: string[]
  createdAt: string
}

interface ProductLinesManagerProps {
  productLines: ProductLine[]
  onAdd: (data: ProductLineFormData) => Promise<void>
  onUpdate: (id: string, data: ProductLineFormData) => Promise<void>
  onDelete: (id: string) => Promise<void>
  isLoading?: boolean
}

export function ProductLinesManager({
  productLines,
  onAdd,
  onUpdate,
  onDelete,
  isLoading = false,
}: ProductLinesManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [isAdding, setIsAdding] = React.useState(false)
  const [editingProductLine, setEditingProductLine] = React.useState<ProductLine | null>(null)
  const [reviewingProductLine, setReviewingProductLine] = React.useState<ProductLine | null>(null)
  const [isReviewModalOpen, setIsReviewModalOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [viewingICPs, setViewingICPs] = React.useState<ProductLine | null>(null)

  const handleAdd = async (data: ProductLineFormData) => {
    setIsAdding(true)
    setError(null)
    try {
      if (editingProductLine) {
        await onUpdate(editingProductLine.id, data)
      } else {
        await onAdd(data)
      }
      setIsDialogOpen(false)
      setEditingProductLine(null)
      setError(null)
    } catch (err) {
      console.error("Error saving product line:", err)
      const errorMessage = err instanceof Error ? err.message : "Failed to save product line"
      setError(errorMessage)
      // Don't close dialog on error so user can see the error and retry
    } finally {
      setIsAdding(false)
    }
  }

  const handleEdit = (productLine: ProductLine) => {
    setEditingProductLine(productLine)
    setIsDialogOpen(true)
  }

  const handleReview = (productLine: ProductLine) => {
    setReviewingProductLine(productLine)
    setIsReviewModalOpen(true)
  }

  const handleEditFromReview = () => {
    if (reviewingProductLine) {
      setIsReviewModalOpen(false)
      setEditingProductLine(reviewingProductLine)
      setIsDialogOpen(true)
    }
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingProductLine(null)
    setError(null)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    
    setIsDeleting(true)
    try {
      await onDelete(deleteId)
      setDeleteId(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Product Lines</h3>
          <p className="text-sm text-muted-foreground">
            Define the different product categories, business units, services, or other dimensions your company offers.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) {
            // Reset when closing
            setEditingProductLine(null)
            setError(null)
          } else {
            // When opening via DialogTrigger, ensure we're in "add" mode
            setEditingProductLine(null)
            setError(null)
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingProductLine(null)
              setError(null)
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product Line
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProductLine ? "Edit Product Line" : "Add Product Line"}</DialogTitle>
              <DialogDescription>
                {editingProductLine 
                  ? "Update the details of this product line. Only the name is required."
                  : "Create a new product line, business unit, service offering, or other dimension. Only the name is required—you can add descriptions and details later to help the AI better understand your products."
                }
              </DialogDescription>
            </DialogHeader>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <ProductLineForm
              key={editingProductLine?.id || "new"}
              initialData={editingProductLine ? {
                name: editingProductLine.name,
                description: editingProductLine.description,
                valueProposition: editingProductLine.valueProposition,
                specificICP: editingProductLine.specificICP,
              } : undefined}
              onSubmit={handleAdd}
              onCancel={handleCloseDialog}
              isLoading={isAdding}
            />
          </DialogContent>
        </Dialog>
      </div>

      {productLines.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Product Lines Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first product line to help the AI categorize and analyze your assets more accurately.
          </p>
          <Button onClick={() => {
            setEditingProductLine(null)
            setError(null)
            setIsDialogOpen(true)
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product Line
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Name</TableHead>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead className="min-w-[200px]">Value Proposition</TableHead>
                  <TableHead className="min-w-[180px]">Target Audience</TableHead>
                  <TableHead className="min-w-[120px]">Created</TableHead>
                  <TableHead className="text-right min-w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productLines.map((line) => {
                  const createdDate = new Date(line.createdAt)
                  const relativeDate = formatDistanceToNow(createdDate, { addSuffix: true })
                  
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">{line.name}</TableCell>
                      <TableCell className="max-w-xs">
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {line.description || <span className="text-muted-foreground italic">No description</span>}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {line.valueProposition || <span className="text-muted-foreground italic">No value proposition</span>}
                        </p>
                      </TableCell>
                      <TableCell>
                        {line.specificICP && line.specificICP.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {line.specificICP.slice(0, 2).map((icp, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {icp}
                              </Badge>
                            ))}
                            {line.specificICP.length > 2 && (
                              <Badge 
                                variant="secondary" 
                                className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setViewingICPs(line)
                                }}
                              >
                                +{line.specificICP.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{relativeDate}</span>
                          <span className="text-xs text-muted-foreground">
                            {createdDate.toLocaleDateString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReview(line)}
                            disabled={isLoading}
                            title="Review product line"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(line)}
                            disabled={isLoading}
                            title="Edit product line"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(line.id)}
                            disabled={isLoading}
                            title="Delete product line"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Review Modal */}
      <ProductLineReviewModal
        productLine={reviewingProductLine}
        open={isReviewModalOpen}
        onOpenChange={setIsReviewModalOpen}
        onEdit={handleEditFromReview}
      />

      {/* ICP Targets View Dialog */}
      <Dialog 
        open={!!viewingICPs} 
        onOpenChange={(open) => {
          if (!open) {
            setViewingICPs(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Target Audience - {viewingICPs?.name}</DialogTitle>
            <DialogDescription>
              All ICP targets for this product line
            </DialogDescription>
          </DialogHeader>
          {viewingICPs && viewingICPs.specificICP && viewingICPs.specificICP.length > 0 && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {viewingICPs.specificICP.map((icp, index) => (
                  <Badge key={index} variant="secondary" className="text-sm">
                    {icp}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete Product Line?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the product line. Assets linked to this product line will not be deleted,
              but they will lose their product line association.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
