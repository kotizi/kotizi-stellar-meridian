"use client";

import { useSession } from "@/session/context";

import { useChainQuery } from "@/chain/hooks";

/**
 * The address that creates groups, when the signed-in account has one: the session's own wallet when
 * it is the contract's admin (the mock: every account), else the admin's Freighter wallet once it is
 * connected and is the admin. Null when neither is; undefined while unknown.
 */
export function useAdminAddress(): string | null | undefined {
  const { status, address, adminWallet } = useSession();
  const freighter = adminWallet?.address ?? null;
  const session = useChainQuery(["isAdmin", address], address ? (c) => c.isAdmin(address) : null, { pollMs: 0 });
  const wallet = useChainQuery(["isAdmin", freighter], freighter ? (c) => c.isAdmin(freighter) : null, { pollMs: 0 });
  if (status !== "signedIn") return status === "loading" ? undefined : null;
  if (address && session.data) return address;
  if (freighter && wallet.data) return freighter;
  const pending = (address && session.data === undefined) || (freighter && wallet.data === undefined);
  return pending ? undefined : null;
}

/** Whether the signed-in account can create groups (the contract's admin); undefined while unknown. */
export function useIsAdmin(): boolean | undefined {
  const admin = useAdminAddress();
  return admin === undefined ? undefined : admin !== null;
}
