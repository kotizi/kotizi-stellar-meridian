import type { ReactNode } from "react";

import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Card with rows separated by `border-subtle`. `plain` drops the card surface (e.g. inside a glass sheet). */
export function SurfaceList({
  children,
  plain = false,
  className,
}: {
  children: ReactNode;
  plain?: boolean;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-subtle", !plain && cardVariants({ padding: "none" }), !plain && "px-4", className)}>
      {children}
    </dl>
  );
}

export function SurfaceRow({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[46px] items-center justify-between gap-4 py-3", className)}>
      <dt className="type-body-sm text-secondary">{label}</dt>
      <dd className="type-mono-caption text-right">{value}</dd>
    </div>
  );
}
