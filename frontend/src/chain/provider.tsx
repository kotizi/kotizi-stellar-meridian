"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useSession } from "@/session/context";

import { createKotiziClient, type KotiziClient } from "./index";

const ChainContext = createContext<KotiziClient | null>(null);

/** Provides the chain client, rebuilt with the session's signer and token source. Must sit inside the session. */
export function ChainProvider({ children }: { children: ReactNode }) {
  const { signer, getAccessToken } = useSession();
  const client = useMemo(() => createKotiziClient({ signer, getAccessToken }), [signer, getAccessToken]);
  return <ChainContext value={client}>{children}</ChainContext>;
}

export function useKotiziClient(): KotiziClient {
  const client = useContext(ChainContext);
  if (!client) throw new Error("useKotiziClient must be used inside <ChainProvider>");
  return client;
}
