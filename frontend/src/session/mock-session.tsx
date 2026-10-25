"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";

import { randomAddress } from "@/chain/mock/client";

import { SessionContext, type Session } from "./context";
import { clearIdentityCheck, completeIdentityCheck, markLogin, useIdentityCheck } from "./identity-check";

const STORAGE_KEY = "kotizi:mock-session";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(address: string | null) {
  try {
    if (address) localStorage.setItem(STORAGE_KEY, address);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Stand-in for Privy while there is no app id: "login" gives the browser a stable fake wallet.
export function MockSession({ children }: { children: ReactNode }) {
  // undefined on the server (still loading), string | null in the browser.
  const address = useSyncExternalStore<string | null | undefined>(subscribe, read, () => undefined);
  const identityCheck = useIdentityCheck();

  const session = useMemo<Session>(
    () => ({
      mode: "mock",
      status: address === undefined ? "loading" : address ? "signedIn" : "signedOut",
      address: address ?? null,
      label: address ? "demo@kotizi.app" : null,
      // The mock chain client doesn't sign anything.
      signer: null,
      getAccessToken: async () => null,
      isNewAccount: identityCheck.isNewAccount,
      newAccountPending: Boolean(address) && identityCheck.pending,
      identityVerified: Boolean(address) && identityCheck.verified,
      completeIdentityCheck,
      login: () => {
        // There is no account store behind the mock: whether it's new is unknown, so only the
        // missing identity record of the fresh wallet sends it to /verify.
        const address = randomAddress();
        markLogin({ accountId: address, isNewAccount: null });
        write(address);
      },
      logout: async () => {
        clearIdentityCheck();
        write(null);
      },
    }),
    [address, identityCheck],
  );

  return <SessionContext value={session}>{children}</SessionContext>;
}
