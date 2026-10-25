"use client";

import { useSession } from "@/session/context";

import { useChainQuery } from "@/chain/hooks";

/** Whether the signed-in account is the contract's admin (the only one that creates groups); undefined while unknown. */
export function useIsAdmin(): boolean | undefined {
  const { address } = useSession();
  const admin = useChainQuery(["isAdmin", address], address ? (c) => c.isAdmin(address) : null, { pollMs: 0 });
  return address ? admin.data : false;
}
