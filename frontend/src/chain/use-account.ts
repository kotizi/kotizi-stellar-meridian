"use client";

import { useSession } from "@/session/context";

import { useChainQuery } from "./hooks";
import type { Address } from "./types";

// Every reader of the identity record goes through these hooks, so they share one query key and
// fetcher (and one request per poll). The app shows no balance: the checkout deposits what a
// payment needs (`CheckoutDialog`).

/** Identity record of `address`. Polled only while missing: a record is never removed. */
export function useKyc(address: Address | null) {
  return useChainQuery(["kyc", address], address ? (c) => c.getKyc(address) : null, {
    pollWhile: (record) => record === null,
  });
}

/**
 * The signed-in account's address and identity status (undefined while unknown). The operator's
 * wallet account (`walletOnly`) has no identity record to read: it stays unknown.
 */
export function useWalletState() {
  const { address, walletOnly } = useSession();
  const kyc = useKyc(walletOnly ? null : address);
  return { address, kycApproved: kyc.data ? true : kyc.data === null ? false : undefined };
}
