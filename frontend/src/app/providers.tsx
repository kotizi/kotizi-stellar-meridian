"use client";

import type { ReactNode } from "react";

import { ChainProvider } from "@/chain/provider";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/session/provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ChainProvider>
        {children}
      </ChainProvider>
      {/* Clear of screen titles; below lg, above the tab bar (84 px) with a gap (see globals.css). */}
      <Toaster position="bottom-right" mobileOffset={{ bottom: 100 }} />
    </SessionProvider>
  );
}
