import { describe, expect, test } from "bun:test";

import { groupIdOf, MAX_GROUP_ID, membershipIdOf, nftTokenId, parseGroupId, parseMembershipId } from "./ids";

describe("group and share ids", () => {
  test("round-trip the contract's numbers", () => {
    expect(parseGroupId(groupIdOf(0))).toBe(0);
    expect(parseGroupId(groupIdOf(17))).toBe(17);
    expect(parseMembershipId(membershipIdOf(17, 3))).toEqual({ groupId: 17, index: 3 });
  });

  test("refuse anything the contract can't hold", () => {
    for (const id of ["", "-1", "01", "1.5", "abc", "G2", String(MAX_GROUP_ID + 1)]) expect(parseGroupId(id)).toBeNull();
    for (const id of ["3", "3-", "3-01", "3-256", "3-1-1", "x-1"]) expect(parseMembershipId(id)).toBeNull();
  });

  test("pack the NFT token id like the contract: (group << 8) | index", () => {
    expect(nftTokenId(0, 5)).toBe(5);
    expect(nftTokenId(2, 1)).toBe((2 << 8) | 1);
    expect(nftTokenId(MAX_GROUP_ID, 255)).toBe(2 ** 32 - 1);
  });
});
