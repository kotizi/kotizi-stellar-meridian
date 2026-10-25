"use client";

import type { ReactNode } from "react";

import { ChainProvider } from "@/chain/provider";
import { ActionStatusDialog } from "@/components/shell/action-status-dialog";
import { SessionProvider } from "@/session/provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ChainProvider>
        {children}
        {/* Every action's progress, outcome and failure, in one dialog (`chain/action-status.ts`). */}
        <ActionStatusDialog />
      </ChainProvider>
    </SessionProvider>
  );
}
