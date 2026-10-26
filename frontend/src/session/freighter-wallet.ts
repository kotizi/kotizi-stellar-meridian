"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { KotiziError } from "@/chain/errors";

import type { AdminWallet } from "./context";

// The admin's Freighter wallet (user decision, 2026-10-25): the contract's admin is a key the operator
// imports into Freighter, since Privy has no external Stellar wallets. Loaded only in the browser and
// only when the app mounts the Privy session.

/** The Freighter calls the wallet uses (a seam for tests; the extension's own API in the app). */
export type FreighterApi = Pick<
  typeof import("@stellar/freighter-api"),
  "isConnected" | "isAllowed" | "getAddress" | "requestAccess" | "getNetworkDetails" | "signTransaction"
>;

let api: Promise<FreighterApi> | null = null;
const freighter = () => (api ??= import("@stellar/freighter-api"));

/**
 * Freighter answers `{ error }` instead of throwing: throw it, keeping its message, so a declined
 * prompt ("The user rejected this request") reads as a cancelled confirmation (`isUserRejected`).
 */
function unwrap<T extends { error?: { message?: string } }>(result: T): T {
  if (result.error) throw new Error(result.error.message ?? "Freighter didn't answer", { cause: result.error });
  return result;
}

/**
 * Whether the extension is there and, if this site was allowed before, its address, read without a
 * prompt. An extension that fails to answer counts as missing.
 */
export async function readFreighter(f: () => Promise<FreighterApi>): Promise<{ available: boolean; address: string | null }> {
  let available = false;
  try {
    const wallet = await f();
    available = (await wallet.isConnected()).isConnected;
    if (available && (await wallet.isAllowed()).isAllowed) {
      const { address } = await wallet.getAddress();
      return { available, address: address || null };
    }
  } catch {
    // No extension, or it didn't answer: as if it weren't there.
  }
  return { available, address: null };
}

/** Freighter's prompt to share its address with this site; resolves with it. */
export async function connectFreighter(wallet: FreighterApi): Promise<string> {
  return unwrap(await wallet.requestAccess()).address;
}

/**
 * Signs with Freighter's prompt, only once Freighter is on `networkPassphrase` (else
 * `WalletWrongNetwork`, before any prompt), as `address` when one is known.
 */
export async function signWithFreighter(
  wallet: FreighterApi,
  { transactionXdr, networkPassphrase, address }: { transactionXdr: string; networkPassphrase: string; address: string | null },
): Promise<string> {
  if (unwrap(await wallet.getNetworkDetails()).networkPassphrase !== networkPassphrase) {
    throw new KotiziError("WalletWrongNetwork");
  }
  return unwrap(await wallet.signTransaction(transactionXdr, { networkPassphrase, address: address ?? undefined })).signedTxXdr;
}

/**
 * The browser's Freighter, as the session's `AdminWallet`. On mount it checks that the extension is
 * there and, if this site was allowed before, reads its address without a prompt. `available` stays
 * undefined until both are known, so a wallet session restored after a reload can wait for them.
 */
export function useFreighterWallet(): AdminWallet {
  const [available, setAvailable] = useState<boolean>();
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readFreighter(freighter).then((found) => {
      if (cancelled) return;
      if (found.address) setAddress(found.address);
      setAvailable(found.available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    const connected = await connectFreighter(await freighter());
    setAddress(connected);
    return connected;
  }, []);

  const signTransaction = useCallback(
    async (transactionXdr: string, networkPassphrase: string) =>
      signWithFreighter(await freighter(), { transactionXdr, networkPassphrase, address }),
    [address],
  );

  return useMemo(() => ({ available, address, connect, signTransaction }), [available, address, connect, signTransaction]);
}
