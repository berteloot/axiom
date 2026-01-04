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
import { ProductLineForm, ProductLineFormData } from "./ProductLineForm"
import { Plus, Trash2, Package, AlertCircle, Pencil } from "lucide-react"
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
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const handleAdd = async (data: ProductLineFormData) => {
    setIsAdding(true)
    try {
      if (editingProductLine) {
        await onUpdate(editingProductLine.id, data)
      } else {
        await onAdd(data)
      }
      setIsDialogOpen(false)
      setEditingProductLine(null)
    } finally {
      setIsAdding(false)
    }
  }

  const handleEdit = (productLine: ProductLine) => {
    setEditingProductLine(productLine)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingProductLine(null)
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
            Define the different product categories or lines your company offers.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
          <DialogTrigger asChild>
            <Button>
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
                  : "Create a new product line or category. Only the name is required—you can add descriptions and details later to help the AI better understand your products."
                }
              </DialogDescription>
            </DialogHeader>
            <ProductLineForm
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
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product Line
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Value Proposition</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.name}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {line.description}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {line.valueProposition}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
