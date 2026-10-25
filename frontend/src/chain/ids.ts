import type { GroupId, MembershipId } from "./types";

// App ids for groups and shares, built like the contract numbers them: groups in order from 0, and
// each share by its group and its index in that group (the NFT token id packs both). Routes, links,
// caches and the selected share use these ids.

/** The largest group id the NFT token id has room for (`MAX_GROUP_ID` in the contract). */
export const MAX_GROUP_ID = 2 ** 24 - 1;
const MAX_INDEX = 255;

/** "3" for group 3. */
export function groupIdOf(groupId: number): GroupId {
  return String(groupId);
}

/** "3-0" for share 0 of group 3. */
export function membershipIdOf(groupId: number, index: number): MembershipId {
  return `${groupId}-${index}`;
}

/** The contract's group number an id names, or null for anything else (no request is worth sending). */
export function parseGroupId(id: string): number | null {
  if (!/^(0|[1-9]\d{0,7})$/.test(id)) return null;
  const n = Number(id);
  return n <= MAX_GROUP_ID ? n : null;
}

/** The group number and share index a share id names, or null. */
export function parseMembershipId(id: string): { groupId: number; index: number } | null {
  const [group, index, ...rest] = id.split("-");
  if (rest.length > 0 || group === undefined || index === undefined) return null;
  const groupId = parseGroupId(group);
  if (groupId === null || !/^(0|[1-9]\d{0,2})$/.test(index) || Number(index) > MAX_INDEX) return null;
  return { groupId, index: Number(index) };
}

/** The membership NFT's token id in the Kotizi contract: `(group_id << 8) | index`. */
export function nftTokenId(groupId: number, index: number): number {
  return groupId * 256 + index;
}
