import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { KSeal } from "./vidro-k";

/** Blue card with the Luz Kotizi and the K seal: label, protagonist number, optional progress. */
export function PlanCard({
  label,
  caption,
  value,
  suffix,
  progress,
  progressLabel,
  progressRight,
  className,
  children,
}: {
  label: ReactNode;
  caption?: ReactNode;
  value: ReactNode;
  suffix?: ReactNode;
  /** 0..1 */
  progress?: number;
  progressLabel?: ReactNode;
  progressRight?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card render={<section />} variant="plano" radius="xl" className={className}>
      <KSeal className="absolute top-5 right-5 w-7" />
      <p className="label-mono pr-10 text-on-brand/85">{label}</p>
      {caption && <p className="mt-8 type-body-sm text-on-brand/90">{caption}</p>}
      <p className={cn("type-data-lg", caption ? "mt-1" : "mt-8")}>
        {value}
        {suffix && <span className="ml-2 type-mono-caption text-on-brand/85">{suffix}</span>}
      </p>
      {progress !== undefined && (
        <div className="mt-6 flex flex-col gap-2">
          <Progress
            tone="inverse"
            value={Math.min(1, progress) * 100}
            aria-label={typeof progressLabel === "string" ? progressLabel : "Progress"}
          />
          <div className="flex justify-between">
            <span className="label-mono text-on-brand/90">{progressLabel}</span>
            {progressRight && <span className="label-mono text-on-brand/90">{progressRight}</span>}
          </div>
        </div>
      )}
      {children}
    </Card>
  );
}
