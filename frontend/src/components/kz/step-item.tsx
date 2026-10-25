import type { ReactNode } from "react";

import { StepMarker, type StepState } from "@/components/kz/step-marker";
import { cn } from "@/lib/utils";

export type { StepState };

/** "Next steps" row: marker plus title and mono status. */
export function StepItem({
  n,
  state,
  title,
  status,
}: {
  n: number;
  state: StepState;
  title: ReactNode;
  status: ReactNode;
}) {
  return (
    <li className="flex min-h-[60px] items-center gap-3 py-3">
      <StepMarker n={n} state={state} />
      <div className="flex flex-col gap-0.5">
        <span className="type-label-lg">{title}</span>
        <span className={cn("label-mono", state === "current" && "text-brand")}>{status}</span>
      </div>
    </li>
  );
}
