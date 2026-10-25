import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Inline text link from the design system (Átomos · Botones y links · Link): underlined on hover,
 * lavender focus ring, dimmed when disabled. Also usable on a `<button>` through `textLinkVariants`.
 */
export const textLinkVariants = cva(
  "focus-ring inline-flex items-center gap-1 rounded-sm font-medium text-brand underline-offset-4 transition-colors hover:text-brand-hover hover:underline disabled:pointer-events-none disabled:text-disabled aria-disabled:pointer-events-none aria-disabled:text-disabled [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "text-[13px]",
        md: "text-[15px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export function TextLink({
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & VariantProps<typeof textLinkVariants>) {
  return <Link className={cn(textLinkVariants({ size }), className)} {...props} />;
}
