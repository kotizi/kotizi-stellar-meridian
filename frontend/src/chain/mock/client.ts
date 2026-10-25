import { GROUP_CONTENT, isGroupSlug } from "@/content/groups";
import { sleep } from "@/lib/sleep";

import type { KotiziClient } from "../client";
import {
  adminFee,
  assertCreateGroupInput,
  bit,
  currentPool,
  chainDrawPhase,
  eligibleBitmap,
  hasPaid,
  hasWon,
  isUnclaimed,
  MAX_SHARES,
  netPrize,
  type ChainDrawPhase,
} from "../derive";
import { DRAW_EXPIRY_SECS, roundAfter, roundTime } from "../drand";
import { KotiziError, type TxFailureCode } from "../errors";
import { groupIdOf, membershipIdOf, nftTokenId } from "../ids";
import { groupMetadataJson, parseGroupMetadata } from "../metadata";
import type {
  Address,
  CreateGroupInput,
  DrawIdleReason,
  DrawStep,
  Group,
  GroupId,
  GroupMetadata,
  KycRecord,
  Membership,
  MembershipId,
  TxResult,
} from "../types";
import { seedState } from "./seed";

/**
 * In-memory stand-in for the Kotizi contract, persisted to localStorage. Each action applies the
 * same checks, in the same order, as the matching contract function, and throws the same error
 * codes. Groups are numbered from 0 inside one simulated contract, and shares by group and index,
 * like on chain. Simulated members ("bots") pay every round and claim their prizes so groups keep
 * moving. `drawNow` picks the next draw step the way the backend keeper does, on drand's clock
 * (`drand.ts`), but the winner is a local random pick: no beacon is fetched or verified.
 */

// v6: contract-shaped ids, drand rounds (v5: Stellar-shaped addresses; v4: app ids; v3: per-share prize ledger).
const STORAGE_KEY = "kotizi:mock:v6";
/**
 * Rounds a mock draw waits for. The contract waits 10 (`DRAW_ROUND_DELAY`, 30 s); the mock waits 1
 * (at most 3 s) so "Draw now" resolves while the screen is open in demos and e2e tests.
 */
const MOCK_DRAW_ROUND_DELAY = 1;

export interface MockState {
  /** The simulated Kotizi contract every group lives in. */
  contract: Address;
  groups: Record<GroupId, Group>;
  metadata: Record<GroupId, GroupMetadata>;
  memberships: Record<MembershipId, Membership>;
  kyc: Record<Address, KycRecord>;
  balances: Record<Address, bigint>;
  vaults: Record<GroupId, bigint>;
  bots: Address[];
}

const nowSecs = () => Math.floor(Date.now() / 1000);

function randomBytes(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const randomStrKey = (prefix: "G" | "C") => prefix + Array.from(randomBytes(55), (b) => BASE32[b % 32]).join("");
/** A Stellar-looking account address (G + 55 base32 characters); the mock never checks the checksum. */
export const randomAddress = (): Address => randomStrKey("G");
/** A Stellar-looking contract address (C + 55 base32 characters). */
export const randomContractAddress = (): Address => randomStrKey("C");
const randomSignature = () => Array.from(randomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");

function randomIndex(n: number) {
  const [x] = crypto.getRandomValues(new Uint32Array(1));
  return x % n;
}

function serialize(state: MockState) {
  return JSON.stringify(state, (_, v) => (typeof v === "bigint" ? { $big: v.toString() } : v));
}

function deserialize(raw: string): MockState {
  return JSON.parse(raw, (_, v) =>
    v && typeof v === "object" && typeof v.$big === "string" ? BigInt(v.$big) : v,
  );
}

function load(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return deserialize(raw);
  } catch {
    // storage blocked or corrupt: start fresh
  }
  return seedState({ now: nowSecs(), randomAddress, randomContractAddress });
}

const IDLE_REASONS: Record<Exclude<ChainDrawPhase, "due" | "pending">, DrawIdleReason> = {
  waiting: "notDue",
  noEligible: "noEligibleShares",
  completed: "completed",
};

/** When the pending draw's round is published (unix seconds). */
const drawRoundTime = (g: Group) => roundTime(Number(g.drawRound));

/** The next draw step for a group, or why there is none, as the backend keeper decides it. */
function nextDrawStep(g: Group, now: number): { step: "request" | "settle" } | { reason: DrawIdleReason } {
  const phase = chainDrawPhase(g, now);
  if (phase === "pending") {
    if (now > drawRoundTime(g) + DRAW_EXPIRY_SECS) return { step: "request" };
    return now >= drawRoundTime(g) ? { step: "settle" } : { reason: "waitingForRandomness" };
  }
  return phase === "due" ? { step: "request" } : { reason: IDLE_REASONS[phase] };
}

function credit(s: MockState, wallet: Address, amount: bigint) {
  s.balances[wallet] = (s.balances[wallet] ?? 0n) + amount;
}

export class MockKotiziClient implements KotiziClient {
  readonly kind = "mock" as const;
  private state: MockState | null = null;
  private offline = false;
  private nextFailure: TxFailureCode | null = null;

  /** `latencyMs` fixes the simulated confirmation time (tests use 0); random 0.5–1 s by default. */
  constructor(private readonly options: { latencyMs?: number } = {}) {}

  private get s(): MockState {
    if (!this.state) {
      this.state = load();
      // Persist a fresh seed right away so addresses survive a reload.
      this.save();
    }
    return this.state;
  }

  private save() {
    if (!this.state) return;
    try {
      localStorage.setItem(STORAGE_KEY, serialize(this.state));
    } catch {
      // persistence is best effort
    }
  }

  /** Runs a state change like a transaction: latency, then all-or-nothing. */
  private async tx(apply: (s: MockState) => void): Promise<TxResult> {
    return (await this.txReturning(apply)).result;
  }

  /** `tx` for a change that answers a value, like a contract function's return (a new id). */
  private async txReturning<T>(apply: (s: MockState) => T): Promise<{ result: TxResult; value: T }> {
    await sleep(this.options.latencyMs ?? 500 + randomIndex(500));
    this.assertOnline();
    const failure = this.nextFailure;
    if (failure) {
      this.nextFailure = null;
      throw new KotiziError(failure);
    }
    const draft = structuredClone(this.s);
    const value = apply(draft);
    this.state = draft;
    this.save();
    return { result: { signature: randomSignature() }, value };
  }

  private assertOnline() {
    if (this.offline) throw new KotiziError("NetworkError");
  }

  private group(s: MockState, id: GroupId) {
    const g = s.groups[id];
    if (!g) throw new KotiziError("AccountNotFound");
    return g;
  }

  private membership(s: MockState, id: MembershipId) {
    const m = s.memberships[id];
    if (!m) throw new KotiziError("AccountNotFound");
    return m;
  }

  private transfer(s: MockState, from: Address, amount: bigint) {
    const balance = s.balances[from] ?? 0n;
    if (balance < amount) throw new KotiziError("InsufficientFunds");
    s.balances[from] = balance - amount;
  }

  // --- reads -------------------------------------------------------------------------------

  async listGroups() {
    this.assertOnline();
    return Object.values(structuredClone(this.s.groups));
  }

  async getGroup(id: GroupId) {
    this.assertOnline();
    return structuredClone(this.s.groups[id] ?? null);
  }

  async getGroupMetadata(group: Group) {
    this.assertOnline();
    return structuredClone(this.s.metadata[group.id] ?? null);
  }

  async listGroupMemberships(group: GroupId) {
    this.assertOnline();
    return Object.values(this.s.memberships)
      .filter((m) => m.group === group)
      .map((m) => structuredClone(m))
      .sort((a, b) => a.index - b.index);
  }

  async listSharesByOwner(owner: Address) {
    this.assertOnline();
    return Object.values(this.s.memberships).flatMap((m) => {
      const group = this.s.groups[m.group];
      return m.owner === owner && group ? [{ membership: structuredClone(m), group: structuredClone(group) }] : [];
    });
  }

  async getKyc(wallet: Address) {
    this.assertOnline();
    return structuredClone(this.s.kyc[wallet] ?? null);
  }

  async getUsdcBalance(wallet: Address) {
    this.assertOnline();
    return this.s.balances[wallet] ?? 0n;
  }

  // --- instructions ------------------------------------------------------------------------

  async joinGroup({ owner, group, payFirstQuota }: { owner: Address; group: GroupId; payFirstQuota?: boolean }) {
    const { result, value: membership } = await this.txReturning((s) => {
      if (!s.kyc[owner]) throw new KotiziError("KycRequired");
      const g = this.group(s, group);
      const index = g.membersJoined;
      if (index >= g.maxMembers) throw new KotiziError("GroupFull");
      const id = membershipIdOf(g.groupId, index);
      const m: Membership = {
        id,
        address: s.contract,
        group,
        asset: String(nftTokenId(g.groupId, index)),
        index,
        totalPaid: 0n,
        owner,
      };
      s.memberships[id] = m;
      g.membersJoined = index + 1;
      if (payFirstQuota) this.pay(s, g, m);
      return id;
    });
    return { ...result, membership };
  }

  payQuota({ owner, membership }: { owner: Address; membership: MembershipId }) {
    return this.tx((s) => {
      const m = this.membership(s, membership);
      if (m.owner !== owner) throw new KotiziError("NotAssetOwner");
      this.pay(s, this.group(s, m.group), m);
    });
  }

  async drawNow({ group }: { group: GroupId }): Promise<DrawStep> {
    this.assertOnline();
    const g = this.group(this.s, group);
    const next = nextDrawStep(g, nowSecs());
    if ("reason" in next) {
      await sleep(this.options.latencyMs ?? 300);
      return { action: null, reason: next.reason };
    }
    const { step } = next;
    const result = await this.tx((s) => (step === "request" ? this.requestDraw(s, group) : this.settleDraw(s, group)));
    return { action: step, ...result };
  }

  claimPrize({ owner, membership }: { owner: Address; membership: MembershipId }) {
    return this.tx((s) => {
      const m = this.membership(s, membership);
      const g = this.group(s, m.group);
      if (m.owner !== owner) throw new KotiziError("NotAssetOwner");
      if (!hasWon(g, m.index)) throw new KotiziError("NotWinner");
      this.claim(s, g, m);
    });
  }

  // --- draw steps (request_draw / settle_draw) ---------------------------------------------

  private requestDraw(s: MockState, group: GroupId) {
    const g = this.group(s, group);
    const now = nowSecs();
    if (now < g.nextDrawTs) throw new KotiziError("DrawNotDue");
    if (g.status === "completed") throw new KotiziError("GroupNotOpen");
    if (g.status === "drawPending" && now <= drawRoundTime(g) + DRAW_EXPIRY_SECS) throw new KotiziError("DrawNotExpired");
    if (eligibleBitmap(g) === 0n) throw new KotiziError("NoEligibleMembers");
    g.status = "drawPending";
    g.drawRound = BigInt(roundAfter(now, MOCK_DRAW_ROUND_DELAY));
  }

  private settleDraw(s: MockState, group: GroupId) {
    const g = this.group(s, group);
    if (g.status !== "drawPending") throw new KotiziError("NoDrawPending");
    if (nowSecs() < drawRoundTime(g)) throw new KotiziError("DrawTooEarly");

    const eligible: number[] = [];
    for (let i = 0; i < g.maxMembers; i++) if (eligibleBitmap(g) & bit(i)) eligible.push(i);
    if (eligible.length === 0) throw new KotiziError("NoEligibleMembers");
    const winner = eligible[randomIndex(eligible.length)];
    const pool = currentPool(g);

    g.wonBitmap |= bit(winner);
    g.lastWinnerIndex = winner;
    g.prizes[winner] = pool;
    g.wonRound[winner] = g.round;
    g.unclaimedBitmap |= bit(winner);
    g.unclaimedTotal += pool;
    g.paidBitmap = 0n;
    g.round += 1;
    g.nextDrawTs = nowSecs() + g.periodSecs;
    g.status = g.round >= g.maxMembers ? "completed" : "open";
    g.drawRound = 0n;

    this.runBots(s, g);
  }

  // --- simulation helpers ------------------------------------------------------------------

  private pay(s: MockState, g: Group, m: Membership) {
    if (g.status !== "open") throw new KotiziError("GroupNotOpen");
    if (hasPaid(g, m.index)) throw new KotiziError("AlreadyPaid");
    this.transfer(s, m.owner, g.quotaAmount);
    s.vaults[g.id] = (s.vaults[g.id] ?? 0n) + g.quotaAmount;
    g.paidBitmap |= bit(m.index);
    m.totalPaid = (m.totalPaid ?? 0n) + g.quotaAmount; // like the contract's `Paid(group, index)`
  }

  private claim(s: MockState, g: Group, m: Membership) {
    if (!isUnclaimed(g, m.index)) throw new KotiziError("AlreadyClaimed");
    const pool = g.prizes[m.index];
    g.unclaimedBitmap &= ~bit(m.index);
    g.unclaimedTotal -= pool;
    s.vaults[g.id] = (s.vaults[g.id] ?? 0n) - pool;
    credit(s, m.owner, netPrize(pool, g.adminFeeBps));
    credit(s, g.organizer, adminFee(pool, g.adminFeeBps));
  }

  /** Bots claim a prize they won and pay the new round's quota. */
  private runBots(s: MockState, g: Group) {
    const members = Object.values(s.memberships).filter((m) => m.group === g.id);
    const isBot = (m: Membership) => s.bots.includes(m.owner);
    for (const m of members) if (isBot(m) && isUnclaimed(g, m.index)) this.claim(s, g, m);
    if (g.status !== "open") return;
    for (const m of members) {
      if (!isBot(m) || hasPaid(g, m.index)) continue;
      credit(s, m.owner, g.quotaAmount);
      this.pay(s, g, m);
    }
  }

  async isTestNetwork() {
    return true;
  }

  /** The mock has no config account: every account may create groups, so the flow can be demoed. */
  async isAdmin() {
    this.assertOnline();
    return true;
  }

  async createGroup(input: CreateGroupInput) {
    const { result, value: group } = await this.txReturning((s) => {
      assertCreateGroupInput(input);
      const any = Object.values(s.groups)[0];
      // Numbered in order from 0, like `create_group` (the contract's `GroupCount`).
      const groupId = Object.keys(s.groups).length;
      const id = groupIdOf(groupId);
      s.groups[id] = {
        id,
        address: s.contract,
        organizer: input.organizer,
        groupId,
        mint: any?.mint ?? randomContractAddress(),
        name: input.name,
        quotaAmount: input.quotaAmount,
        maxMembers: input.maxMembers,
        membersJoined: 0,
        periodSecs: input.periodSecs,
        adminFeeBps: input.adminFeeBps,
        uri: input.uri,
        round: 0,
        nextDrawTs: nowSecs() + input.periodSecs,
        paidBitmap: 0n,
        wonBitmap: 0n,
        status: "open",
        drawSource: "mock",
        drawRound: 0n,
        lastWinnerIndex: 0,
        prizes: Array.from({ length: MAX_SHARES }, () => 0n),
        wonRound: Array.from({ length: MAX_SHARES }, () => 0),
        unclaimedBitmap: 0n,
        unclaimedTotal: 0n,
      };
      s.vaults[id] = 0n;
      // The metadata route serves `/metadata/<slug>.json[?value=<usd>]`; read the same content back.
      const [, slug, query] = /\/metadata\/([\w-]+)\.json(?:\?(.*))?$/.exec(input.uri) ?? [];
      if (slug && isGroupSlug(slug)) {
        const value = Number(new URLSearchParams(query).get("value"));
        const content = Number.isFinite(value) && value > 0 ? { ...GROUP_CONTENT[slug], propertyValueUsd: value } : GROUP_CONTENT[slug];
        const metadata = parseGroupMetadata(groupMetadataJson(content, { image: "/brand/symbol-white.svg" }));
        if (metadata) s.metadata[id] = metadata;
      }
      return id;
    });
    return { ...result, group };
  }

  verifyIdentity(wallet: Address) {
    return this.tx((s) => {
      s.kyc[wallet] ??= { wallet, approvedAt: nowSecs() };
    });
  }

  readonly testing = {
    fundUsdc: (wallet: Address, amount: bigint) =>
      this.tx((s) => credit(s, wallet, amount)),
    depositShortfall: async ({ owner, amount }: { owner: Address; amount: bigint }) => {
      const shortfall = amount - (await this.getUsdcBalance(owner));
      return shortfall > 0n ? this.testing.fundUsdc(owner, shortfall) : null;
    },
    reset: async () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      this.state = null;
    },
    failNextTransaction: (code: TxFailureCode) => {
      this.nextFailure = code;
    },
    setOffline: (offline: boolean) => {
      this.offline = offline;
    },
    isOffline: () => this.offline,
  };
}
