"use client";

import { Chip } from "@/components/kz/chip";
import { cn } from "@/lib/utils";

/** Grid of pills acting as a radio group. See `Chip` for the states. */
export function SegmentedPills<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Chip key={String(o.value)} selected={active} onClick={() => onChange(o.value)}>
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}
