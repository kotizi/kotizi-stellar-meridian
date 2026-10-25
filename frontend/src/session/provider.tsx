"use client";

import type { ReactNode } from "react";

import { usePrivyAuth } from "@/config/env";
import { MockSession } from "@/session/mock-session";
import { PrivySession } from "@/session/privy-session";

// Composition root for the session: the only place that picks Privy or the mock.
export function SessionProvider({ children }: { children: ReactNode }) {
  const Session = usePrivyAuth ? PrivySession : MockSession;
  return <Session>{children}</Session>;
}
