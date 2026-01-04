"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Package, Calendar, Users, FileText, Sparkles } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ProductLine {
  id: string
  name: string
  description: string
  valueProposition: string
  specificICP: string[]
  createdAt: string
}

interface ProductLineReviewModalProps {
  productLine: ProductLine | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: () => void
}

export function ProductLineReviewModal({
  productLine,
  open,
  onOpenChange,
  onEdit,
}: ProductLineReviewModalProps) {
  if (!productLine) return null

  const createdDate = new Date(productLine.createdAt)
  const formattedDate = createdDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const relativeDate = formatDistanceToNow(createdDate, { addSuffix: true })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {productLine.name}
          </DialogTitle>
          <DialogDescription>
            Review product line details and configuration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Name Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Product Line Name</h3>
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    onEdit()
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
            <p className="text-lg font-semibold">{productLine.name}</p>
          </div>

          <Separator />

          {/* Created Date */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">Created</h3>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm">{formattedDate}</p>
              <p className="text-xs text-muted-foreground">{relativeDate}</p>
            </div>
          </div>

          <Separator />

          {/* Target Audience */}
          {productLine.specificICP && productLine.specificICP.length > 0 && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-muted-foreground">Target Audience</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {productLine.specificICP.map((icp, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="text-xs"
                    >
                      {icp}
                    </Badge>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Description */}
          {productLine.description && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {productLine.description}
                </p>
              </div>
              <Separator />
            </>
          )}

          {/* Value Proposition */}
          {productLine.valueProposition && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground">Value Proposition</h3>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {productLine.valueProposition}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
