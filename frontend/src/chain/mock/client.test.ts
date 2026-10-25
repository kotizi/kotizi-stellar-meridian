import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";

import { usdc } from "@/lib/format";

import { bit, netPrize } from "../derive";
import { DRAW_EXPIRY_SECS, roundTime } from "../drand";
import { KotiziError, type KotiziErrorCode } from "../errors";
import type { Group } from "../types";
import { MockKotiziClient, randomAddress } from "./client";

// The mock stands in for the contract, so it has to enforce the same rules.
// These tests walk one round of a seeded group: join, pay, draw, claim.

const START = Date.UTC(2026, 9, 10, 12);

async function expectError(promise: Promise<unknown>, code: KotiziErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(KotiziError);
  expect((error as KotiziError).code).toBe(code);
}

const advance = (secs: number) => setSystemTime(new Date(Date.now() + secs * 1_000));

let client: MockKotiziClient;
let user: string;
/** "Porto Novo Lofts" in the seed: 20 shares, 4 joined (bots), shares 0–2 paid, draw due in 280 s. */
let group: Group;

const reload = async () => (group = (await client.getGroup(group.id))!);

beforeEach(async () => {
  setSystemTime(new Date(START));
  // No localStorage under bun test: each client starts from a fresh seed.
  client = new MockKotiziClient({ latencyMs: 0 });
  user = randomAddress();
  group = (await client.listGroups()).find((g) => g.name === "Porto Novo Lofts")!;
});

afterEach(() => {
  setSystemTime();
});

async function joinAndPay() {
  await client.verifyIdentity(user);
  await client.testing.fundUsdc(user, usdc(10_000));
  const { membership } = await client.joinGroup({ owner: user, group: group.id, payFirstQuota: true });
  return membership;
}

describe("ids", () => {
  test("number groups from 0 in one contract, and shares by group and index", async () => {
    const groups = await client.listGroups();
    expect(groups.map((g) => g.id).sort()).toEqual(["0", "1", "2", "3"]);
    for (const g of groups) {
      expect(g.id).toBe(String(g.groupId));
      expect(g.address).toBe(groups[0].address);
      expect(g.address).toMatch(/^C[A-Z2-7]{55}$/);
    }
    const [share] = await client.listGroupMemberships(group.id);
    expect(share.id).toBe(`${group.groupId}-0`);
    expect(share.asset).toBe(String(group.groupId * 256));
  });

  test("a join names the new share by its group and index", async () => {
    const membership = await joinAndPay();
    expect(membership).toBe(`${group.groupId}-4`);
  });
});

describe("join_group + pay_quota", () => {
  test("requires an approved identity", async () => {
    await expectError(client.joinGroup({ owner: user, group: group.id }), "KycRequired");
  });

  test("takes the next share and pays the first quota", async () => {
    const membership = await joinAndPay();
    const [{ membership: mine }] = await client.listSharesByOwner(user);
    await reload();

    expect(mine.id).toBe(membership);
    expect(mine.index).toBe(4);
    expect(mine.totalPaid).toBe(group.quotaAmount);
    expect(group.membersJoined).toBe(5);
    expect(group.paidBitmap & bit(4)).toBe(bit(4));
    expect(await client.getUsdcBalance(user)).toBe(usdc(10_000) - group.quotaAmount);
  });

  test("a failed transaction changes nothing", async () => {
    await client.verifyIdentity(user);
    // No balance: join succeeds but the bundled first payment fails, so the join is rolled back.
    await expectError(
      client.joinGroup({ owner: user, group: group.id, payFirstQuota: true }),
      "InsufficientFunds",
    );
    await reload();
    expect(group.membersJoined).toBe(4);
    expect(await client.listSharesByOwner(user)).toEqual([]);
  });

  test("pays once per round, only by the share's owner", async () => {
    const membership = await joinAndPay();
    await expectError(client.payQuota({ owner: user, membership }), "AlreadyPaid");
    await expectError(client.payQuota({ owner: randomAddress(), membership }), "NotAssetOwner");
  });
});

describe("drawNow (request_draw + settle_draw) + claim_prize", () => {
  /** Runs one draw where the user's share 4 wins: eligible shares are [0, 1, 2, 4], so pick the 4th. */
  async function drawUserShare() {
    advance(300);
    expect(await client.drawNow({ group: group.id })).toMatchObject({ action: "request" });
    advance(3);
    const random = spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T) => {
      if (array instanceof Uint32Array) array[0] = 3;
      else if (array instanceof Uint8Array) array.fill(7);
      return array;
    });
    try {
      expect(await client.drawNow({ group: group.id })).toMatchObject({ action: "settle" });
    } finally {
      random.mockRestore();
    }
    return reload();
  }

  test("does nothing before the due date and says why", async () => {
    expect(await client.drawNow({ group: group.id })).toEqual({ action: null, reason: "notDue" });
  });

  test("requests a future drand round, then waits for it before settling", async () => {
    await joinAndPay();
    advance(300);
    expect(await client.drawNow({ group: group.id })).toMatchObject({ action: "request" });
    await reload();
    expect(group.status).toBe("drawPending");
    expect(group.drawSource).toBe("mock");
    expect(roundTime(Number(group.drawRound))).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(await client.drawNow({ group: group.id })).toEqual({ action: null, reason: "waitingForRandomness" });

    // Once the round is out the draw settles, and the pending round is cleared.
    advance(3);
    expect(await client.drawNow({ group: group.id })).toMatchObject({ action: "settle" });
    expect((await reload()).drawRound).toBe(0n);
  });

  test("a pending draw nobody settled is requested again once its round is an hour old", async () => {
    await joinAndPay();
    advance(300);
    await client.drawNow({ group: group.id });
    const first = (await reload()).drawRound;
    // An hour past the round without a settlement (drand down): the next step is a new request.
    setSystemTime(new Date((roundTime(Number(first)) + DRAW_EXPIRY_SECS + 1) * 1_000));
    expect(await client.drawNow({ group: group.id })).toMatchObject({ action: "request" });
    expect((await reload()).drawRound).toBeGreaterThan(first);
  });

  test("full round: the drawn share claims its prize minus the admin fee", async () => {
    const membership = await joinAndPay();
    const balanceBefore = await client.getUsdcBalance(user);
    const organizerBefore = await client.getUsdcBalance(group.organizer);

    await drawUserShare();
    const pool = group.quotaAmount * 4n;
    expect(group.lastWinnerIndex).toBe(4);
    expect(group.round).toBe(1);
    expect(group.status).toBe("open");
    expect(group.prizes[4]).toBe(pool);
    expect(group.wonRound[4]).toBe(0);
    expect(group.unclaimedBitmap).toBe(bit(4));
    expect(group.unclaimedTotal).toBe(pool);
    // Bots pay the new round right away; the user hasn't paid it yet.
    expect(group.paidBitmap).toBe(bit(0) | bit(1) | bit(2) | bit(3));

    // Only a drawn share can claim, and only once.
    const [botShare] = await client.listGroupMemberships(group.id);
    await expectError(client.claimPrize({ owner: botShare.owner, membership: botShare.id }), "NotWinner");
    await expectError(client.claimPrize({ owner: botShare.owner, membership }), "NotAssetOwner");
    await client.claimPrize({ owner: user, membership });
    await expectError(client.claimPrize({ owner: user, membership }), "AlreadyClaimed");

    const prize = netPrize(pool, group.adminFeeBps);
    expect(await client.getUsdcBalance(user)).toBe(balanceBefore + prize);
    expect(await client.getUsdcBalance(group.organizer)).toBe(organizerBefore + pool - prize);
    await reload();
    expect(group.unclaimedBitmap).toBe(0n);
    expect(group.unclaimedTotal).toBe(0n);
    // The ledger keeps the prize after the claim.
    expect(group.prizes[4]).toBe(pool);
  });

  test("an unclaimed prize doesn't block the next draw and can be claimed later", async () => {
    const membership = await joinAndPay();
    await drawUserShare();
    const firstPrize = group.prizes[4];

    // Round 2: the bots paid; the next draw runs while share 4 still hasn't claimed.
    advance(300);
    expect(await client.drawNow({ group: group.id })).toMatchObject({ action: "request" });
    advance(3);
    expect(await client.drawNow({ group: group.id })).toMatchObject({ action: "settle" });
    await reload();
    expect(group.round).toBe(2);
    expect(group.unclaimedBitmap & bit(4)).toBe(bit(4));

    const before = await client.getUsdcBalance(user);
    await client.claimPrize({ owner: user, membership });
    expect(await client.getUsdcBalance(user)).toBe(before + netPrize(firstPrize, group.adminFeeBps));
  });

  test("a share that won is no longer eligible", async () => {
    await joinAndPay();
    advance(300);
    await client.drawNow({ group: group.id });
    advance(3);
    await client.drawNow({ group: group.id });
    await reload();
    const winner = group.lastWinnerIndex;
    expect([0, 1, 2, 4]).toContain(winner);
    expect(group.wonBitmap & bit(winner)).toBe(bit(winner));
  });
});

describe("simulated wallet and network failures", () => {
  test("the next transaction fails once with the chosen code, changing nothing", async () => {
    await client.verifyIdentity(user);
    await client.testing.fundUsdc(user, usdc(10_000));
    client.testing.failNextTransaction("UserRejected");
    await expectError(client.joinGroup({ owner: user, group: group.id }), "UserRejected");
    expect(await client.listSharesByOwner(user)).toEqual([]);
    await client.joinGroup({ owner: user, group: group.id });
    expect(await client.listSharesByOwner(user)).toHaveLength(1);
  });

  test("an outage fails reads and transactions until it ends", async () => {
    client.testing.setOffline(true);
    expect(client.testing.isOffline()).toBe(true);
    await expectError(client.listGroups(), "NetworkError");
    await expectError(client.verifyIdentity(user), "NetworkError");
    client.testing.setOffline(false);
    expect(await client.listGroups()).toHaveLength(4);
  });
});

describe("testing.reset", () => {
  test("reseeds the mock", async () => {
    await joinAndPay();
    await client.testing.reset?.();
    expect(await client.listSharesByOwner(user)).toEqual([]);
    expect((await client.listGroups()).find((g) => g.address === group.address)).toBeUndefined();
  });
});

describe("create_group", () => {
  const input = () => ({
    organizer: user,
    name: "Casa Nova",
    quotaAmount: usdc(100),
    maxMembers: 5,
    periodSecs: 120,
    adminFeeBps: 200,
    uri: "http://localhost:3000/metadata/casa-ipe.json",
  });

  test("numbers new groups after the existing ones, like create_group", async () => {
    expect((await client.createGroup(input())).group).toBe("4");
    expect((await client.createGroup(input())).group).toBe("5");
  });

  test("opens an empty group with its metadata", async () => {
    const { group: address } = await client.createGroup(input());
    const created = (await client.getGroup(address))!;
    expect(created).toMatchObject({ name: "Casa Nova", organizer: user, membersJoined: 0, maxMembers: 5, round: 0, status: "open" });
    expect(created.nextDrawTs).toBe(Math.floor(START / 1000) + 120);
    expect((await client.getGroupMetadata(created))?.location).toBe("Curitiba, PR");
  });

  test("reads the property value the admin form puts in the uri", async () => {
    const { group: address } = await client.createGroup({ ...input(), uri: `${input().uri}?value=500` });
    const created = (await client.getGroup(address))!;
    expect(await client.getGroupMetadata(created)).toMatchObject({ location: "Curitiba, PR", propertyValue: usdc(500) });
  });

  test("applies the program's limits", async () => {
    await expectError(client.createGroup({ ...input(), name: "x".repeat(33) }), "NameTooLong");
    await expectError(client.createGroup({ ...input(), quotaAmount: 0n }), "InvalidQuota");
    await expectError(client.createGroup({ ...input(), maxMembers: 1 }), "InvalidMaxMembers");
    await expectError(client.createGroup({ ...input(), maxMembers: 65 }), "InvalidMaxMembers");
    await expectError(client.createGroup({ ...input(), periodSecs: 0 }), "InvalidPeriod");
    await expectError(client.createGroup({ ...input(), adminFeeBps: 1_001 }), "FeeTooHigh");
  });
});
