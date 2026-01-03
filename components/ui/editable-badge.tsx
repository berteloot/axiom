"use client"

import * as React from "react"
import { Pencil, Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface EditableBadgeProps {
  value: string
  onSave: (newValue: string) => Promise<void>
  onRemove?: () => void
  onCancel?: () => void
  variant?: "default" | "secondary" | "destructive" | "outline"
  className?: string
  showEditButton?: boolean
  isCustom?: boolean
}

export function EditableBadge({
  value,
  onSave,
  onRemove,
  onCancel,
  variant = "outline",
  className,
  showEditButton = true,
  isCustom = false,
}: EditableBadgeProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [editValue, setEditValue] = React.useState(value)
  const [isSaving, setIsSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = () => {
    if (!isCustom) return // Only allow editing custom targets
    setEditValue(value)
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (!editValue.trim() || editValue.trim() === value) {
      setIsEditing(false)
      if (onCancel) onCancel()
      return
    }

    setIsSaving(true)
    try {
      await onSave(editValue.trim())
      setIsEditing(false)
    } catch (error) {
      console.error("Error saving:", error)
      // Reset on error
      setEditValue(value)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setEditValue(value)
    setIsEditing(false)
    if (onCancel) onCancel()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      handleCancel()
    }
  }

  if (isEditing) {
    return (
      <div className={cn("inline-flex items-center gap-1", className)}>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="h-6 px-2 text-xs"
          onBlur={handleSave}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="p-0.5 hover:bg-muted rounded"
          title="Save"
        >
          <Check className="h-3 w-3 text-green-600" />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="p-0.5 hover:bg-muted rounded"
          title="Cancel"
        >
          <X className="h-3 w-3 text-red-600" />
        </button>
      </div>
    )
  }

  return (
    <Badge variant={variant} className={cn("text-xs flex items-center gap-1", className)}>
      {value}
      {isCustom && showEditButton && (
        <button
          type="button"
          onClick={handleStartEdit}
          className="ml-1 hover:bg-muted rounded-full p-0.5"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 hover:bg-muted rounded-full p-0.5"
          title="Remove"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  )
}
