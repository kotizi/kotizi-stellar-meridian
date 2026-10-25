import { describe, expect, test } from "bun:test";
import type { z } from "zod";

import type { SessionSigner } from "@/session/context";

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

const PAYLOAD = "11".repeat(32);

/** A wallet that signs every hash with 64 bytes of 0xab, recording what it was asked to sign. */
function fakeSigner(address = ME) {
  const signed: Uint8Array[] = [];
  const signer: SessionSigner = {
    address,
    signHash: async (hash) => {
      signed.push(hash);
      return new Uint8Array(64).fill(0xab);
    },
  };
  return { signer, signed };
}

/**
 * A backend answering from `routes` ("METHOD /path"), checking every answer with the client's schema.
 * Its relay applies a join to group 0's member list, like the chain would.
 */
function setup(routes: Record<string, (body: unknown) => unknown> = {}, { signer = null }: { signer?: SessionSigner | null } = {}) {
  const calls: { key: string; body?: unknown; auth: boolean }[] = [];
  const members0 = [member(0, OTHER), member(1, ME)];
  let prepared: { fn: string; wallet: string } | null = null;
  const all: Record<string, (body: unknown) => unknown> = {
    "GET /v1/config": () => config(),
    "GET /v1/groups": () => ({
      groups: [groupView(0), groupView(1, { mint: USDC, decimals: 7, quotaAmount: "1000000000" })],
    }),
    "GET /v1/groups/0": () => groupView(0, { membersJoined: members0.length }),
    "GET /v1/groups/1": () => groupView(1, { mint: USDC, decimals: 7, quotaAmount: "1000000000", winners: [], unclaimedIndexes: [], unclaimedTotal: "0" }),
    "GET /v1/groups/0/members": () => ({ group: "0", members: [...members0] }),
    "POST /v1/tx/prepare": (body) => {
      prepared = body as { fn: string; wallet: string };
      return { transaction: "AAAA", validUntilLedger: 1_000, payloads: [{ address: prepared.wallet, payload: PAYLOAD }] };
    },
    "POST /v1/tx/relay": () => {
      if (prepared?.fn === "join_group") members0.push(member(members0.length, prepared.wallet, "0"));
      return { txHash: `tx-${prepared?.fn}`, kinds: [prepared?.fn ?? ""] };
    },
    "POST /v1/groups/0/draw": () => ({ action: "request", txHash: "draw-tx", reason: null }),
    "POST /v1/faucet": (body) => ({ wallet: (body as { wallet: string }).wallet, amount: "10000000000", txHash: "faucet-tx" }),
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
  return { client: new StellarKotiziClient({ api, signer }), calls };
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

  test("group creation isn't available yet and says so", async () => {
    const { client } = setup();
    expect(await codeOf(client.createGroup())).toBe("TransactionFailed");
  });
});

describe("gasless actions (prepare, sign, relay)", () => {
  test("a payment: the backend builds it, the wallet signs its payload, the relay sends it", async () => {
    const { signer, signed } = fakeSigner();
    const { client, calls } = setup({}, { signer });
    expect(await client.payQuota({ owner: ME, membership: "0-1" })).toEqual({ signature: "tx-pay_quota" });

    expect(calls.find((c) => c.key === "POST /v1/tx/prepare")).toEqual({
      key: "POST /v1/tx/prepare",
      body: { fn: "pay_quota", groupId: 0, index: 1, wallet: ME },
      auth: true,
    });
    expect(signed).toEqual([new Uint8Array(32).fill(0x11)]);
    expect(calls.find((c) => c.key === "POST /v1/tx/relay")?.body).toEqual({
      transaction: "AAAA",
      validUntilLedger: 1_000,
      signatures: ["ab".repeat(64)],
    });
  });

  test("a join with its first installment: two relayed calls, the new share found by its owner", async () => {
    const { signer } = fakeSigner();
    const { client, calls } = setup({}, { signer });
    const result = await client.joinGroup({ owner: ME, group: "0", payFirstQuota: true });
    expect(result).toEqual({ signature: "tx-pay_quota", membership: "0-2" });
    expect(calls.filter((c) => c.key === "POST /v1/tx/prepare").map((c) => c.body)).toEqual([
      { fn: "join_group", groupId: 0, index: undefined, wallet: ME },
      { fn: "pay_quota", groupId: 0, index: 2, wallet: ME },
    ]);
  });

  test("a join alone answers the join's transaction", async () => {
    const { signer } = fakeSigner();
    const { client } = setup({}, { signer });
    expect(await client.joinGroup({ owner: ME, group: "0" })).toEqual({ signature: "tx-join_group", membership: "0-2" });
  });

  test("claiming relays claim_prize for the share", async () => {
    const { signer } = fakeSigner();
    const { client, calls } = setup({}, { signer });
    await client.claimPrize({ owner: ME, membership: "0-1" });
    expect(calls.find((c) => c.key === "POST /v1/tx/prepare")?.body).toMatchObject({ fn: "claim_prize", groupId: 0, index: 1 });
  });

  test("a payload for any other address is refused before anything is signed", async () => {
    const { signer, signed } = fakeSigner();
    const { client, calls } = setup(
      { "POST /v1/tx/prepare": () => ({ transaction: "AAAA", validUntilLedger: 1_000, payloads: [{ address: OTHER, payload: PAYLOAD }] }) },
      { signer },
    );
    expect(await codeOf(client.payQuota({ owner: ME, membership: "0-1" }))).toBe("NotAssetOwner");
    expect(signed).toHaveLength(0);
    expect(calls.some((c) => c.key === "POST /v1/tx/relay")).toBe(false);
  });

  test("nothing is sent without the session's wallet, for another owner, or for an id the contract can't have", async () => {
    const { client: signedOut, calls: none } = setup();
    expect(await codeOf(signedOut.payQuota({ owner: ME, membership: "0-1" }))).toBe("SessionExpired");
    const { signer } = fakeSigner();
    const { client, calls } = setup({}, { signer });
    expect(await codeOf(client.payQuota({ owner: OTHER, membership: "0-0" }))).toBe("NotAssetOwner");
    expect(await codeOf(client.payQuota({ owner: ME, membership: "zero" }))).toBe("AccountNotFound");
    expect([...none, ...calls].some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  test("the contract's refusal comes back as the app's code", async () => {
    const { signer } = fakeSigner();
    const { client } = setup(
      {
        "POST /v1/tx/prepare": () => {
          throw new BackendError(422, "contract_error", "AlreadyPaid");
        },
      },
      { signer },
    );
    expect(await codeOf(client.payQuota({ owner: ME, membership: "0-1" }))).toBe("AlreadyPaid");
  });

  test("a wallet that declines to sign cancels the action", async () => {
    const signer: SessionSigner = { address: ME, signHash: () => Promise.reject(new Error("User rejected the request")) };
    const { client, calls } = setup({}, { signer });
    expect(await codeOf(client.payQuota({ owner: ME, membership: "0-1" }))).toBe("UserRejected");
    expect(calls.some((c) => c.key === "POST /v1/tx/relay")).toBe(false);
  });

  test("one relayed call at a time: the second prepares after the first is sent", async () => {
    const { signer } = fakeSigner();
    const { client, calls } = setup({}, { signer });
    await Promise.all([
      client.payQuota({ owner: ME, membership: "0-1" }),
      client.claimPrize({ owner: ME, membership: "0-1" }),
    ]);
    expect(calls.filter((c) => c.key.startsWith("POST")).map((c) => c.key)).toEqual([
      "POST /v1/tx/prepare",
      "POST /v1/tx/relay",
      "POST /v1/tx/prepare",
      "POST /v1/tx/relay",
    ]);
  });
});

describe("draws and the test faucet", () => {
  test("draw now runs the keeper's next step", async () => {
    const { client, calls } = setup();
    expect(await client.drawNow({ group: "0" })).toEqual({ action: "request", signature: "draw-tx" });
    expect(calls.at(-1)).toMatchObject({ key: "POST /v1/groups/0/draw", auth: true });
  });

  test("or says why there is none, in the app's words", async () => {
    const { client } = setup({ "POST /v1/groups/0/draw": () => ({ action: null, txHash: null, reason: "not_due" }) });
    expect(await client.drawNow({ group: "0" })).toEqual({ action: null, reason: "notDue" });
  });

  test("a beacon the contract rejects comes back as its own code", async () => {
    const { client } = setup({
      "POST /v1/groups/0/draw": () => {
        throw new BackendError(422, "draw_failed", "InvalidBeacon");
      },
    });
    expect(await codeOf(client.drawNow({ group: "0" }))).toBe("InvalidBeacon");
  });

  test("the faucet mints to the wallet, and a second deposit the same day is limited", async () => {
    const { client, calls } = setup();
    expect(await client.testing.fundUsdc(ME)).toEqual({ signature: "faucet-tx" });
    expect(calls.at(-1)).toEqual({ key: "POST /v1/faucet", body: { wallet: ME }, auth: true });
    const { client: limited } = setup({
      "POST /v1/faucet": () => {
        throw new BackendError(429, "faucet_limit", "One faucet claim per wallet per day");
      },
    });
    expect(await codeOf(limited.testing.fundUsdc(ME))).toBe("FaucetLimit");
  });

  test("the checkout deposits only when the wallet can't cover the payment", async () => {
    const { client, calls } = setup();
    // The wallet holds 250 USD of the demo token.
    expect(await client.testing.depositShortfall({ owner: ME, amount: 100_000_000n })).toBeNull();
    expect(calls.some((c) => c.key === "POST /v1/faucet")).toBe(false);
    expect(await client.testing.depositShortfall({ owner: ME, amount: 500_000_000n })).toEqual({ signature: "faucet-tx" });
  });
});
