import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Bottom glass panel used for login and signing. */
export function GlassSheet({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("vidro flex flex-col gap-3 rounded-xl p-5", className)}>{children}</section>;
}
