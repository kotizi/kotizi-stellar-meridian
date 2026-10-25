import { describe, expect, test } from "bun:test";
import type { z } from "zod";

import { BackendError, type BackendApi } from "../api";
import { KotiziError } from "../errors";
import { StellarKotiziClient } from "./client";
import type { GroupView } from "./views";

const CONTRACT = "CKOTIZI";
const DEMO_TOKEN = "CDEMO6";
const USDC = "CUSDC7";
const ADMIN = "GADMIN";
const ME = "GME";
const OTHER = "GOTHER";

const config = (overrides: Record<string, unknown> = {}) => ({
  contractId: CONTRACT,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  admin: ADMIN,
  kycAuthority: "GKYC",
  tokens: [
    { token: DEMO_TOKEN, decimals: 6 },
    { token: USDC, decimals: 7 },
  ],
  sponsor: "GSPONSOR",
  kycMode: "auto",
  faucet: true,
  faucetToken: DEMO_TOKEN,
  faucetAmountUsdc: 10_000,
  ...overrides,
});

const groupView = (groupId: number, overrides: Partial<GroupView> = {}): GroupView => ({
  id: String(groupId),
  address: CONTRACT,
  organizer: ADMIN,
  groupId,
  mint: DEMO_TOKEN,
  decimals: 6,
  name: `Group ${groupId}`,
  uri: "",
  quotaAmount: "100000000",
  maxMembers: 5,
  membersJoined: 2,
  periodSecs: "300",
  adminFeeBps: 200,
  round: 1,
  nextDrawTs: "0",
  status: "Open",
  drawSource: "drand",
  drawRound: "0",
  lastWinnerIndex: 0,
  winners: [{ index: 0, round: 0, prize: "200000000", claimed: false }],
  unclaimedIndexes: [0],
  unclaimedTotal: "200000000",
  paidIndexes: [1],
  wonIndexes: [0],
  vault: "300000000",
  ...overrides,
});

const member = (index: number, owner: string, totalPaid = "100000000") => ({
  index,
  owner,
  totalPaid,
  paidThisRound: false,
  won: false,
  prize: "0",
  claimable: false,
});

/** A backend answering from `routes` ("METHOD /path"), checking every answer with the client's schema. */
function setup(routes: Record<string, (body: unknown) => unknown> = {}) {
  const calls: { key: string; body?: unknown; auth: boolean }[] = [];
  const all: Record<string, (body: unknown) => unknown> = {
    "GET /v1/config": () => config(),
    "GET /v1/groups": () => ({
      groups: [groupView(0), groupView(1, { mint: USDC, decimals: 7, quotaAmount: "1000000000" })],
    }),
    "GET /v1/groups/0": () => groupView(0),
    "GET /v1/groups/1": () => groupView(1, { mint: USDC, decimals: 7, quotaAmount: "1000000000", winners: [], unclaimedIndexes: [], unclaimedTotal: "0" }),
    "GET /v1/groups/0/members": () => ({ group: "0", members: [member(0, OTHER), member(1, ME)] }),
    "GET /v1/groups/1/members": () => ({ group: "1", members: [member(0, ME, "1000000000")] }),
    "GET /v1/me": () => ({
      userId: "did:privy:me",
      wallets: [{ address: ME, active: true, kyc: true, balances: { [DEMO_TOKEN]: "250000000", [USDC]: "0" } }],
      cotas: [
        { group: "0", groupName: "Group 0", index: 1, owner: ME, paidThisRound: true, alreadyWon: false, canClaim: false, prize: "0" },
        { group: "1", groupName: "Group 1", index: 0, owner: ME, paidThisRound: false, alreadyWon: false, canClaim: false, prize: "0" },
      ],
    }),
    "POST /v1/kyc": (body) => ({ wallet: (body as { wallet: string }).wallet, status: "approved", txHash: "kyc-tx", activationTx: "activation-tx" }),
    ...routes,
  };
  const api: BackendApi = {
    async request<T>(path: string, schema: z.ZodType<T>, options: { method?: string; body?: unknown; auth?: boolean } = {}) {
      const key = `${options.method ?? "GET"} ${path}`;
      calls.push({ key, body: options.body, auth: options.auth ?? false });
      const route = all[key];
      if (!route) throw new BackendError(404, "not_found", `No route ${key}`);
      return schema.parse(route(options.body));
    },
  };
  return { client: new StellarKotiziClient({ api, signer: null }), calls };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (e: unknown) => (e instanceof KotiziError ? e.code : e),
  );

describe("groups", () => {
  test("the open list keeps only the groups in the faucet's token, in the app's unit", async () => {
    const { client } = setup();
    const groups = await client.listGroups();
    expect(groups.map((g) => g.id)).toEqual(["0"]);
    expect(groups[0]).toMatchObject({ id: "0", groupId: 0, address: CONTRACT, mint: DEMO_TOKEN, quotaAmount: 100_000_000n, drawSource: "drand", drawRound: 0n });
    expect(groups[0].prizes[0]).toBe(200_000_000n);
    expect(groups[0].unclaimedTotal).toBe(200_000_000n);
  });

  test("without a faucet every group is listed", async () => {
    const { client } = setup({ "GET /v1/config": () => config({ faucet: false, faucetToken: undefined }) });
    expect((await client.listGroups()).map((g) => g.id)).toEqual(["0", "1"]);
  });

  test("a group in another token still opens by id, its amounts converted (7 decimals)", async () => {
    const { client } = setup();
    expect((await client.getGroup("1"))?.quotaAmount).toBe(100_000_000n);
  });

  test("an id the contract can't have never reaches the backend, and an unknown one is null", async () => {
    const { client, calls } = setup();
    expect(await client.getGroup("not-a-group")).toBeNull();
    expect(await client.getGroup("3-1")).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await client.getGroup("42")).toBeNull();
    expect(await client.listGroupMemberships("42")).toEqual([]);
  });

  test("shares are named by group and index, with their NFT token id", async () => {
    const { client } = setup();
    const members = await client.listGroupMemberships("0");
    expect(members.map((m) => [m.id, m.asset, m.owner])).toEqual([
      ["0-0", "0", OTHER],
      ["0-1", "1", ME],
    ]);
    expect(members[1]).toMatchObject({ group: "0", address: CONTRACT, totalPaid: 100_000_000n });
  });

  test("reads of one group made together share one request", async () => {
    const { client, calls } = setup();
    await Promise.all([client.getGroup("0"), client.getGroup("0"), client.listGroupMemberships("0")]);
    expect(calls.filter((c) => c.key === "GET /v1/groups/0")).toHaveLength(1);
  });
});

describe("the account", () => {
  test("the owner's shares come with their groups, from /v1/me", async () => {
    const { client } = setup();
    const shares = await client.listSharesByOwner(ME);
    expect(shares.map((s) => [s.membership.id, s.group.id, s.membership.totalPaid])).toEqual([
      ["0-1", "0", 100_000_000n],
      ["1-0", "1", 100_000_000n],
    ]);
    expect(await client.listSharesByOwner(OTHER)).toEqual([]);
  });

  test("identity and balance of the account's wallet", async () => {
    const { client, calls } = setup();
    expect(await client.getKyc(ME)).toEqual({ wallet: ME, approvedAt: 0 });
    expect(await client.getKyc(OTHER)).toBeNull();
    // The faucet's token, in the app's unit.
    expect(await client.getUsdcBalance(ME)).toBe(250_000_000n);
    expect(await client.getUsdcBalance(OTHER)).toBe(0n);
    expect(calls.filter((c) => c.key === "GET /v1/me").every((c) => c.auth)).toBe(true);
  });

  test("testnet, and the admin from /v1/config (read once)", async () => {
    const { client, calls } = setup();
    expect(await client.isTestNetwork()).toBe(true);
    expect(await client.isAdmin(ADMIN)).toBe(true);
    expect(await client.isAdmin(ME)).toBe(false);
    expect(calls.filter((c) => c.key === "GET /v1/config")).toHaveLength(1);
  });

  test("the public network is never a test network", async () => {
    const { client } = setup({
      "GET /v1/config": () => config({ networkPassphrase: "Public Global Stellar Network ; September 2015" }),
    });
    expect(await client.isTestNetwork()).toBe(false);
  });

  test("identity verification asks the backend for the wallet, signed in", async () => {
    const { client, calls } = setup();
    expect(await client.verifyIdentity(ME)).toEqual({ signature: "kyc-tx" });
    expect(calls.at(-1)).toEqual({ key: "POST /v1/kyc", body: { wallet: ME }, auth: true });
  });

  test("an identity approved earlier needs no transaction", async () => {
    const { client } = setup({ "POST /v1/kyc": () => ({ wallet: ME, status: "approved", alreadyApproved: true, activationTx: null }) });
    expect(await client.verifyIdentity(ME)).toEqual({ signature: "" });
  });

  test("the demo KYC turned off reads as unavailable", async () => {
    const { client } = setup({
      "POST /v1/kyc": () => {
        throw new BackendError(501, "kyc_unavailable", "Automatic KYC is disabled");
      },
    });
    expect(await codeOf(client.verifyIdentity(ME))).toBe("IdentityVerificationUnavailable");
  });
});

describe("failures", () => {
  test("an answer that doesn't match the schema is a service problem, not a crash", async () => {
    const { client } = setup({ "GET /v1/groups/0": () => ({ ...groupView(0), quotaAmount: 5 }) });
    await expect(client.getGroup("0")).rejects.toThrow();
  });

  test("writes aren't available yet and say so", async () => {
    const { client } = setup();
    expect(await codeOf(client.payQuota())).toBe("TransactionFailed");
    expect(await codeOf(client.drawNow())).toBe("TransactionFailed");
  });
});
