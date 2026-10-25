import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface TimelineStep {
  title: ReactNode;
  detail?: ReactNode;
  time?: ReactNode;
  done: boolean;
}

/** "Path of the credit": blue dots with a lavender ring joined by a 2px line. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden className="absolute top-4 left-[7px] h-full w-0.5 bg-control" />}
          <span
            aria-hidden
            className={cn(
              "relative mt-1 size-4 shrink-0 rounded-full",
              step.done ? "bg-brand ring-2 ring-lavender/70" : "border border-default bg-graphite",
            )}
          />
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn("type-label-lg", !step.done && "text-tertiary")}>{step.title}</span>
              {step.time && <span className="label-mono">{step.time}</span>}
            </div>
            {step.detail && <span className="type-body-sm text-tertiary">{step.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
