import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Design system card (Efectos y gradientes · Elevation 1, cards at rest): the surface every panel
 * sits on. `surface` is the graphite card, `plano` the blue card with the light (one per screen at
 * most, it carries the highlighted number). Use `render` for another element, e.g. a Link with
 * `interactive`. Radius, padding and elevation are variants because `cn` can't merge custom tokens
 * passed through `className`.
 */
const cardVariants = cva("", {
  variants: {
    variant: {
      surface: "bg-surface",
      plano: "card-plano relative isolate overflow-hidden",
    },
    radius: {
      lg: "rounded-lg",
      xl: "rounded-xl",
    },
    padding: {
      none: "",
      md: "p-4",
      lg: "p-5",
    },
    elevation: {
      flat: "",
      raised: "shadow-elevation-1",
    },
    interactive: {
      true: "focus-ring transition-colors",
      false: "",
    },
  },
  compoundVariants: [{ variant: "surface", interactive: true, className: "hover:bg-surface-raised" }],
  defaultVariants: {
    variant: "surface",
    radius: "lg",
    padding: "lg",
    elevation: "raised",
    interactive: false,
  },
})

type CardProps = VariantProps<typeof cardVariants>

function Card({
  className,
  variant,
  radius,
  padding,
  elevation,
  interactive,
  render,
  ...props
}: useRender.ComponentProps<"div"> & CardProps) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(cardVariants({ variant, radius, padding, elevation, interactive }), className),
      },
      props
    ),
    render,
    state: {
      slot: "card",
    },
  })
}

export { Card, cardVariants, type CardProps }
