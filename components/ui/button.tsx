import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95",
        outline:
          "border border-brand-blue bg-background hover:bg-brand-blue/10 hover:text-brand-blue active:bg-brand-blue/20",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-brand-orange/10 hover:text-brand-orange active:bg-brand-orange/20",
        link: "text-brand-orange underline-offset-4 hover:underline hover:text-brand-orange/80",
      },
      size: {
        default: "h-10 sm:h-10 min-h-[44px] sm:min-h-0 px-4 py-2",
        sm: "h-9 sm:h-9 min-h-[44px] sm:min-h-[36px] rounded-md px-3",
        lg: "h-11 sm:h-11 min-h-[44px] sm:min-h-0 rounded-md px-6 sm:px-8",
        icon: "h-10 w-10 sm:h-10 sm:w-10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        suppressHydrationWarning
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
