"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked)
      onChange?.(e)
    }

    return (
      <div className="relative inline-flex items-center justify-center">
        <input
          type="checkbox"
          className={cn(
            "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "appearance-none cursor-pointer",
            checked && "bg-primary border-primary",
            className
          )}
          ref={ref}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          {...props}
        />
        {checked && (
          <Check className="absolute h-3 w-3 text-primary-foreground pointer-events-none" strokeWidth={3} />
        )}
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
