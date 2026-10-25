"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createKotiziClient, type KotiziClient } from "./index";

const ChainContext = createContext<KotiziClient | null>(null);

/** Provides the chain client (for now always the mock). */
export function ChainProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createKotiziClient(), []);
  return <ChainContext value={client}>{children}</ChainContext>;
}

export function useKotiziClient(): KotiziClient {
  const client = useContext(ChainContext);
  if (!client) throw new Error("useKotiziClient must be used inside <ChainProvider>");
  return client;
}
