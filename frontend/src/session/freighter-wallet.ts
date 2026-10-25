"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { KotiziError } from "@/chain/errors";

import type { AdminWallet } from "./context";

// The admin's Freighter wallet (user decision, 2026-10-25): the contract's admin is a key the operator
// imports into Freighter, since Privy has no external Stellar wallets. Loaded only in the browser and
// only when the app mounts the Privy session.

type Freighter = typeof import("@stellar/freighter-api");
let api: Promise<Freighter> | null = null;
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
 * The browser's Freighter, as the session's `AdminWallet`. On mount it checks that the extension is
 * there and, if this site was allowed before, reads its address without a prompt. `available` stays
 * undefined until both are known, so a wallet session restored after a reload can wait for them.
 */
export function useFreighterWallet(): AdminWallet {
  const [available, setAvailable] = useState<boolean>();
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let found = false;
      try {
        const f = await freighter();
        found = (await f.isConnected()).isConnected;
        if (found && (await f.isAllowed()).isAllowed) {
          const { address } = await f.getAddress();
          if (!cancelled && address) setAddress(address);
        }
      } catch {
        // No extension, or it didn't answer: as if it weren't there.
      }
      if (!cancelled) setAvailable(found);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    const { address } = unwrap(await (await freighter()).requestAccess());
    setAddress(address);
    return address;
  }, []);

  const signTransaction = useCallback(
    async (transactionXdr: string, networkPassphrase: string) => {
      const f = await freighter();
      if (unwrap(await f.getNetworkDetails()).networkPassphrase !== networkPassphrase) {
        throw new KotiziError("WalletWrongNetwork");
      }
      const { signedTxXdr } = unwrap(await f.signTransaction(transactionXdr, { networkPassphrase, address: address ?? undefined }));
      return signedTxXdr;
    },
    [address],
  );

  return useMemo(() => ({ available, address, connect, signTransaction }), [available, address, connect, signTransaction]);
}
