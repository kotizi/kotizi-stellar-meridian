"use client";

import { useSession } from "@/session/context";

import { useChainQuery } from "./hooks";
import type { GroupId } from "./types";

/** A group with its metadata, all its shares and the ones owned by the signed-in user. */
export function useGroup(id: GroupId) {
  const { address } = useSession();
  const query = useChainQuery(
    ["group", id],
    async (c) => {
      const group = await c.getGroup(id);
      if (!group) return null;
      const [metadata, members] = await Promise.all([c.getGroupMetadata(group), c.listGroupMemberships(id)]);
      return { group, metadata, members };
    },
    // A missing group won't appear on its own: stop asking.
    { pollMs: 5_000, pollWhile: (data) => data !== null },
  );
  const mine = query.data && address ? query.data.members.filter((m) => m.owner === address) : [];
  return { ...query, mine };
}
