import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/**
 * Four variants only (design system): primary (brown), secondary (white + border),
 * ghost and destructive. Heights are shared across variants: sm 32px, default 36px.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-primary/25 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-[0_1px_1px_rgb(92_58_23/0.18)] hover:border-[#a86a31] hover:bg-[#a86a31]",
        secondary:
          "border-border bg-surface text-foreground shadow-[0_1px_1px_rgb(28_38_34/0.04)] hover:bg-background aria-expanded:bg-background",
        outline:
          "border-border bg-surface text-foreground shadow-[0_1px_1px_rgb(28_38_34/0.04)] hover:bg-background aria-expanded:bg-background",
        ghost:
          "border-transparent text-foreground hover:bg-[#efebe0] aria-expanded:bg-[#efebe0]",
        destructive:
          "border-danger bg-danger text-white hover:border-[#a13f32] hover:bg-[#a13f32] focus-visible:ring-danger/25",
        link: "border-transparent px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-4",
        icon: "size-9",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
