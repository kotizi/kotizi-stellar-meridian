"use client";

import { useSyncExternalStore } from "react";

// The wallet (Freighter) the operator signed in with, kept in localStorage so a reload stays signed
// in while Freighter still shares that address with the site. Cleared on sign out.

const STORAGE_KEY = "kotizi:wallet-session";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Records (or with null, forgets) the wallet the operator signed in with. */
export function setWalletSession(address: string | null) {
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

/** The wallet the operator signed in with: undefined on the server, null when none. */
export function useWalletSession(): string | null | undefined {
  return useSyncExternalStore<string | null | undefined>(subscribe, read, () => undefined);
}
