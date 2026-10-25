import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Design system status label (Átomos · Indicadores · Badge): IBM Plex Mono uppercase, six tones.
 * Subtle for lists; Solid for maximum emphasis (one per screen).
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2 font-mono text-[10px] font-medium tracking-wider whitespace-nowrap uppercase [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      tone: {
        neutral: "",
        blue: "",
        info: "",
        success: "",
        warning: "",
        danger: "",
      },
      variant: {
        subtle: "",
        solid: "",
      },
    },
    compoundVariants: [
      { variant: "subtle", tone: "neutral", className: "bg-hover text-secondary" },
      { variant: "subtle", tone: "blue", className: "bg-brand-subtle text-brand" },
      { variant: "subtle", tone: "info", className: "bg-info-subtle text-info" },
      { variant: "subtle", tone: "success", className: "bg-success-subtle text-success" },
      { variant: "subtle", tone: "warning", className: "bg-warning-subtle text-warning" },
      { variant: "subtle", tone: "danger", className: "bg-error-subtle text-error" },
      { variant: "solid", tone: "neutral", className: "bg-inverse text-inverse" },
      { variant: "solid", tone: "blue", className: "bg-brand text-on-brand" },
      { variant: "solid", tone: "info", className: "bg-info text-on-status" },
      { variant: "solid", tone: "success", className: "bg-success text-on-status" },
      { variant: "solid", tone: "warning", className: "bg-warning text-on-status" },
      { variant: "solid", tone: "danger", className: "bg-error text-on-status" },
    ],
    defaultVariants: {
      tone: "neutral",
      variant: "subtle",
    },
  }
)

type BadgeProps = VariantProps<typeof badgeVariants>

function Badge({
  className,
  tone = "neutral",
  variant = "subtle",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ tone, variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      tone,
      variant,
    },
  })
}

export { Badge, badgeVariants, type BadgeProps }
