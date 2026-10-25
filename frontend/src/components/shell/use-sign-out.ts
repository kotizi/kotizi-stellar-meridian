"use client";

import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

import { resetChainCache } from "@/chain/hooks";
import { clearSelectedShare } from "@/components/share/share-switcher";
import { useSession } from "@/session/context";

// Signing out: set on "Sign out" and cleared by the landing page once the session is signed out.
// Meanwhile the app's screens show placeholders instead of their signed-out state, and the landing
// page doesn't send the still signed-in session back to /home. Ordered by state, not by timing:
// Privy's logout can finish before the navigation does, or after it.
let signingOut = false;
const listeners = new Set<() => void>();

function setSigningOut(value: boolean) {
  signingOut = value;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useSigningOut() {
  return useSyncExternalStore(subscribe, () => signingOut, () => false);
}

/** Called by the landing page once the session is signed out. */
export function endSignOut() {
  if (signingOut) setSigningOut(false);
}

/**
 * Signs out and leaves nothing of the account behind: the selected share, cached chain reads and the
 * identity check (the session clears it), and goes to the landing page.
 */
export function useSignOut() {
  const { logout } = useSession();
  const router = useRouter();
  return useCallback(async () => {
    setSigningOut(true);
    router.replace("/");
    try {
      await logout();
    } catch (error) {
      setSigningOut(false); // still signed in: the landing page sends the session back
      throw error;
    }
    clearSelectedShare();
    resetChainCache();
  }, [logout, router]);
}
