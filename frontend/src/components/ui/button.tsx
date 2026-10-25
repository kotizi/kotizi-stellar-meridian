import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Design system buttons (Átomos · Botones y links): pills in four styles and four heights
 * (32/40/48/56 px), with Default, Hover, Pressed, Focus and Disabled states. Disabled uses the
 * disabled tokens instead of opacity.
 */
const buttonVariants = cva(
  "focus-ring group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled disabled:ring-0 aria-invalid:ring-1 aria-invalid:ring-error [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Main action of a screen.
        primary: "bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-pressed",
        // Alternative action next to a primary one.
        secondary: "text-primary ring-1 ring-default ring-inset hover:bg-hover active:bg-pressed",
        // Low-emphasis action (back, cancel).
        ghost: "text-primary hover:bg-hover active:bg-pressed",
        // On blue surfaces or over the light (card-plano, luz).
        inverse: "bg-inverse text-inverse hover:bg-mist active:bg-lavender",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-[15px]",
        xl: "h-14 px-6 text-base",
        // Round icon-only buttons (IconButton · Medium / Large).
        "icon-md": "size-10 [&_svg:not([class*='size-'])]:size-5",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "lg",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "lg",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/** Icon-only button: an accessible name is required since there is no visible text. */
function IconButton({
  size = "icon-md",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "aria-label"> & {
  size?: "icon-md" | "icon-lg"
  "aria-label": string
}) {
  return <Button size={size} {...props} />
}

export { Button, IconButton, buttonVariants }
