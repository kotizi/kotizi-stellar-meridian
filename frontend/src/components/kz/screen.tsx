import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Standard screen header: mono eyebrow, 30px title, optional caption. */
export function ScreenTitle({
  eyebrow,
  title,
  caption,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-2", className)}>
      {eyebrow && <p className="label-mono">{eyebrow}</p>}
      <h1 className="type-h3">{title}</h1>
      {caption && <p className="type-body-md text-secondary">{caption}</p>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="type-h5">{children}</h2>
      {action}
    </div>
  );
}

/** Legal footer wherever amounts are shown. */
export function ReferenceNote({ className }: { className?: string }) {
  return <p className={cn("label-mono text-center", className)}>Reference values · subject to approval</p>;
}

/** Placeholder for a screen's content while what it shows isn't known yet. */
export function ScreenLoading() {
  return <Skeleton aria-busy className="h-52 rounded-xl" />;
}
