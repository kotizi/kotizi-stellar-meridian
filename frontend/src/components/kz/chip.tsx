"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const sizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-4 text-[15px] font-medium",
};

/**
 * Selectable pill from the design system (Átomos · Selección · Chip). Meant to sit inside a
 * `role="radiogroup"`: off = outlined, on = filled Kotizi blue, disabled = dimmed.
 */
export function Chip({
  selected,
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"button">, "type" | "role"> & { selected: boolean; size?: keyof typeof sizes }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(
        "focus-ring shrink-0 rounded-full border whitespace-nowrap text-primary transition-colors",
        "disabled:border-transparent disabled:bg-disabled disabled:text-disabled",
        selected ? "border-transparent bg-brand text-on-brand" : "border-default hover:bg-hover",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
