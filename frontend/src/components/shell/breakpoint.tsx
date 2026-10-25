"use client";

import type { ReactNode } from "react";

import { useMediaQuery } from "@/lib/use-media-query";

/**
 * Mounts `children` only on desktop (>= 1024px, Tailwind's `lg`) or only below it, so a part the
 * other layout hides doesn't keep reading the chain. Until the width is known (prerender,
 * hydration) both render and their own `lg:` classes hide one, so nothing flashes.
 */
export function Breakpoint({ show, children }: { show: "desktop" | "mobile"; children: ReactNode }) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  return desktop === null || desktop === (show === "desktop") ? children : null;
}
