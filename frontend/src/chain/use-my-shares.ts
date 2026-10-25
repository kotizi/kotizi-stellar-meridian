"use client";

import { useSession } from "@/session/context";

import { useChainQuery } from "./hooks";
import type { ShareRef } from "./share";
import type { GroupMetadata } from "./types";

export interface MyShare extends ShareRef {
  metadata: GroupMetadata | null;
}

/** The signed-in user's shares with their groups, ordered by group name then share index. */
export function useMyShares() {
  const { address, status } = useSession();
  const query = useChainQuery(
    ["myShares", address],
    address
      ? async (c) => {
          const shares = await c.listSharesByOwner(address);
          // Metadata once per group, however many shares the user holds in it.
          const groups = new Map(shares.map(({ group }) => [group.id, group]));
          const metadata = new Map(
            await Promise.all([...groups.values()].map(async (g) => [g.id, await c.getGroupMetadata(g)] as const)),
          );
          return shares
            .map(({ membership, group }): MyShare => ({ membership, group, metadata: metadata.get(group.id) ?? null }))
            .sort((a, b) => a.group.name.localeCompare(b.group.name) || a.membership.index - b.membership.index);
        }
      : null,
    // Every share's group and members on every network (~16 requests a read with five shares), so
    // slower than the default: the account's own actions refetch at once, and a group's page polls
    // that group every 5 s. At 10 s one home tab used the backend's whole limit (120 a minute per IP).
    { pollMs: 30_000 },
  );
  return { ...query, loading: status === "loading" || query.loading, signedIn: status === "signedIn" };
}
