import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type StepState = "done" | "current" | "future";

/**
 * Design system step marker (Átomos · Indicadores · StepMarker): done = Kotizi blue with a check,
 * current = lavender ring, future = grey ring.
 */
export function StepMarker({ n, state, className }: { n: number; state: StepState; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full type-mono-overline",
        state === "done" && "bg-brand text-on-brand",
        state === "current" && "border border-brand text-brand",
        state === "future" && "border border-default text-tertiary",
        className,
      )}
    >
      {state === "done" ? <Check className="size-4" aria-label="Done" /> : n}
    </span>
  );
}
