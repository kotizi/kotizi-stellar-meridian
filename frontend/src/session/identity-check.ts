"use client";

import { useSyncExternalStore } from "react";

// Identity verification: the app stays behind /verify (until it's done or the user signs out) when
// the account is new or its wallet has no identity record yet. Whether the account is new is only
// known at login (Privy's `isNewUser`), so it's kept in sessionStorage: a reload in the middle of
// the form still asks.

const STORAGE_KEY = "kotizi:identity-check";
const listeners = new Set<() => void>();

interface IdentityCheckState {
  /** A new account that hasn't gone through the form yet. */
  pending: boolean;
  /** Whether the account didn't exist before this login (Privy's `isNewUser`); null when unknown. */
  isNewAccount: boolean | null;
  /** Account whose login was recorded in this tab; a repeated report for it is ignored. */
  accountId: string | null;
  /** Verification finished in this tab (the backend confirmed `approve_kyc`). */
  verified: boolean;
}

const NONE: IdentityCheckState = { pending: false, isNewAccount: null, accountId: null, verified: false };

/**
 * Whether the app must wait behind /verify (user decision, 2026-10-11): a new account always goes
 * through the form once; any account whose wallet has no identity record (`KycRecord`) does too,
 * e.g. one that left the form halfway. `kycApproved` is undefined while unknown (loading, failed
 * read): then only a new account waits, and `join_group` still requires the record on chain.
 * `verifiedHere`: the form was just completed in this tab, so a read that still misses the record
 * (an RPC node a moment behind) doesn't send the user back to /verify.
 */
export function requiresIdentityCheck({
  newAccountPending,
  verifiedHere = false,
  kycApproved,
}: {
  newAccountPending: boolean;
  verifiedHere?: boolean;
  kycApproved: boolean | undefined;
}): boolean | undefined {
  if (verifiedHere) return false;
  if (newAccountPending || kycApproved === false) return true;
  return kycApproved === true ? false : undefined;
}

let raw: string | null | undefined;
let snapshot: IdentityCheckState = NONE;

function read(): IdentityCheckState {
  let value: string | null = null;
  try {
    value = sessionStorage.getItem(STORAGE_KEY);
  } catch {}
  // Same object while the stored value doesn't change (useSyncExternalStore compares snapshots).
  if (value !== raw) {
    raw = value;
    try {
      snapshot = value ? { ...NONE, ...(JSON.parse(value) as Partial<IdentityCheckState>) } : NONE;
    } catch {
      snapshot = NONE;
    }
  }
  return snapshot;
}

function write(state: IdentityCheckState | null) {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Called by the session after a login (not when an existing session is restored). Once per account
 * per tab: Privy reports the same login again whenever one of its modals closes afterwards (e.g. a
 * wallet reconnection), which would otherwise send a verified account back to /verify. Signing out
 * clears it, so the next login counts again.
 */
export function markLogin({ accountId, isNewAccount }: { accountId: string; isNewAccount: boolean | null }) {
  if (read().accountId === accountId) return;
  write({ pending: isNewAccount === true, isNewAccount, accountId, verified: false });
}

/** Called after the backend confirmed the approval. */
export function completeIdentityCheck() {
  write({ ...read(), pending: false, verified: true });
}

export function clearIdentityCheck() {
  write(null);
}

export function useIdentityCheck(): IdentityCheckState {
  return useSyncExternalStore(subscribe, read, () => NONE);
}
