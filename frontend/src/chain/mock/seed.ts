import { GROUP_CONTENT, type GroupSlug } from "@/content/groups";

import { usdc } from "@/lib/format";

import { bitmapOf, MAX_SHARES } from "../derive";
import { groupIdOf, membershipIdOf, nftTokenId } from "../ids";
import { groupMetadataJson, parseGroupMetadata } from "../metadata";
import type { Address, Group, Membership } from "../types";
import type { MockState } from "./client";

interface SeedGroup {
  /** Entry in `GROUP_CONTENT`: name and metadata, served at `/metadata/<slug>.json`. */
  slug: GroupSlug;
  maxMembers: number;
  joined: number;
  quota: number;
  periodSecs: number;
  adminFeeBps: number;
  round: number;
  won: number[];
  paid: number[];
  /** Seconds from now until the next draw (negative = already due). */
  nextDrawIn: number;
}

// Demo groups with short periods so the draw can be shown live.
const GROUPS: SeedGroup[] = [
  {
    slug: "studio-pinheiros",
    maxMembers: 48,
    joined: 9,
    quota: 1_500,
    periodSecs: 120,
    adminFeeBps: 200,
    round: 3,
    won: [1, 4, 6],
    paid: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    nextDrawIn: -15,
  },
  {
    slug: "brisa-mar",
    maxMembers: 42,
    joined: 5,
    quota: 2_000,
    periodSecs: 60,
    adminFeeBps: 100,
    round: 1,
    won: [2],
    paid: [0, 1, 3],
    nextDrawIn: 45,
  },
  {
    slug: "porto-novo",
    maxMembers: 20,
    joined: 4,
    quota: 3_000,
    periodSecs: 300,
    adminFeeBps: 150,
    round: 0,
    won: [],
    paid: [0, 1, 2],
    nextDrawIn: 280,
  },
  {
    slug: "residencial-aurora",
    maxMembers: 8,
    joined: 8,
    quota: 12_000,
    periodSecs: 60,
    adminFeeBps: 100,
    round: 8,
    won: [0, 1, 2, 3, 4, 5, 6, 7],
    paid: [],
    nextDrawIn: 3_600,
  },
];

/**
 * The mock's starting state: the demo groups in one simulated contract, numbered from 0 like
 * `create_group` does, each filled with simulated members ("bots").
 */
export function seedState({
  now,
  randomAddress,
  randomContractAddress,
}: {
  now: number;
  randomAddress: () => Address;
  randomContractAddress: () => Address;
}): MockState {
  const contract = randomContractAddress();
  const organizer = randomAddress();
  // The demo token: one for every group (the app's amounts don't depend on a token's decimals).
  const mint = randomContractAddress();
  const state: MockState = {
    contract,
    groups: {},
    metadata: {},
    memberships: {},
    kyc: {},
    balances: {},
    vaults: {},
    bots: [],
  };

  GROUPS.forEach((seed, groupId) => {
    const id = groupIdOf(groupId);
    const completed = seed.round >= seed.maxMembers;
    const group: Group = {
      id,
      address: contract,
      organizer,
      groupId,
      mint,
      name: GROUP_CONTENT[seed.slug].name,
      quotaAmount: usdc(seed.quota),
      maxMembers: seed.maxMembers,
      membersJoined: seed.joined,
      periodSecs: seed.periodSecs,
      adminFeeBps: seed.adminFeeBps,
      uri: `/metadata/${seed.slug}.json`,
      round: seed.round,
      nextDrawTs: now + seed.nextDrawIn,
      paidBitmap: bitmapOf(seed.paid),
      wonBitmap: bitmapOf(seed.won),
      status: completed ? "completed" : "open",
      drawSource: "mock",
      drawRound: 0n,
      lastWinnerIndex: seed.won.at(-1) ?? 0,
      // Past winners have claimed already: the ledger keeps their prize (every share paid then).
      prizes: Array.from({ length: MAX_SHARES }, (_, j) => (seed.won.includes(j) ? usdc(seed.quota) * BigInt(seed.joined) : 0n)),
      wonRound: Array.from({ length: MAX_SHARES }, (_, j) => Math.max(0, seed.won.indexOf(j))),
      unclaimedBitmap: 0n,
      unclaimedTotal: 0n,
    };
    state.groups[id] = group;
    // Same JSON the metadata route serves, read back through the same parser as the real client.
    const metadata = parseGroupMetadata(groupMetadataJson(GROUP_CONTENT[seed.slug], { image: "/brand/symbol-white.svg" }));
    if (metadata) state.metadata[id] = metadata;
    state.vaults[id] = group.quotaAmount * BigInt(seed.paid.length);

    for (let index = 0; index < seed.joined; index++) {
      const owner = randomAddress();
      const membershipId = membershipIdOf(groupId, index);
      const roundsPaid = seed.round + (seed.paid.includes(index) ? 1 : 0);
      const membership: Membership = {
        id: membershipId,
        address: contract,
        group: id,
        asset: String(nftTokenId(groupId, index)),
        index,
        totalPaid: group.quotaAmount * BigInt(roundsPaid),
        owner,
      };
      state.memberships[membershipId] = membership;
      state.bots.push(owner);
    }
  });

  return state;
}
