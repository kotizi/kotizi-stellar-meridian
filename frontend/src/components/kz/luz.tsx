import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * "Luz Kotizi" background (design system Átomos · Marca): blurred light with grain.
 * `page` is a large diagonal light to position with `className` inside a `relative isolate`
 * container; `card` fills its (relative, rounded) parent.
 */
export function Luz({
  variant = "page",
  className,
  style,
}: {
  variant?: "page" | "card";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden className={cn(variant === "page" ? "luz" : "luz-card", className)} style={style}>
      <div className={cn("luz-light", variant === "card" && "-bottom-1/3 -left-1/4 w-3/4 -rotate-12")} />
      <div className="luz-grain" />
    </div>
  );
}
