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
import { KotiziError, type TxFailureCode } from "../errors";
import { groupMetadataJson, parseGroupMetadata } from "../metadata";
import type { Address, CreateGroupInput, DrawIdleReason, DrawStep, Group, GroupMetadata, KycRecord, Membership, TxResult } from "../types";
import { seedState } from "./seed";

/**
 * In-memory stand-in for the Kotizi contract, persisted to localStorage. Each action applies the
 * same checks, in the same order, as the matching instruction handler, and throws the same error
 * codes. Simulated members ("bots") pay every round and claim their prizes so groups keep moving.
 * `drawNow` picks the next draw step the way the backend keeper does (ledger-hash source only).
 */

// v5: Stellar-shaped addresses, no per-group network (v4: app ids; v3: per-share prize ledger).
const STORAGE_KEY = "kotizi:mock:v5";
const SLOT_MS = 400;
const SLOT_HASH_DELAY = 3n;
const SLOT_HASH_EXPIRY_SLOTS = 400n;

export interface MockState {
  groups: Record<Address, Group>;
  metadata: Record<Address, GroupMetadata>;
  memberships: Record<Address, Membership>;
  kyc: Record<Address, KycRecord>;
  balances: Record<Address, bigint>;
  vaults: Record<Address, bigint>;
  bots: Address[];
}

const nowSecs = () => Math.floor(Date.now() / 1000);
const currentSlot = () => BigInt(Math.floor(Date.now() / SLOT_MS));

function randomBytes(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** A Stellar-looking account address (G + 55 base32 characters); the mock never checks the checksum. */
export const randomAddress = (): Address =>
  "G" + Array.from(randomBytes(55), (b) => BASE32[b % 32]).join("");
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
  return seedState({ now: nowSecs(), randomAddress });
}

const IDLE_REASONS: Record<Exclude<ChainDrawPhase, "due" | "pending">, DrawIdleReason> = {
  waiting: "notDue",
  noEligible: "noEligibleShares",
  completed: "completed",
};

/** The next draw step for a group, or why there is none, as the backend keeper decides it (slot-hash source). */
function nextDrawStep(g: Group, slot: bigint, now: number): { step: "request" | "settle" } | { reason: DrawIdleReason } {
  const phase = chainDrawPhase(g, now);
  if (phase === "pending") {
    if (slot > g.commitLedger + SLOT_HASH_EXPIRY_SLOTS) return { step: "request" };
    return slot > g.commitLedger ? { step: "settle" } : { reason: "waitingForRandomness" };
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
    await sleep(this.options.latencyMs ?? 500 + randomIndex(500));
    this.assertOnline();
    const failure = this.nextFailure;
    if (failure) {
      this.nextFailure = null;
      throw new KotiziError(failure);
    }
    const draft = structuredClone(this.s);
    apply(draft);
    this.state = draft;
    this.save();
    return { signature: randomSignature() };
  }

  private assertOnline() {
    if (this.offline) throw new KotiziError("NetworkError");
  }

  private group(s: MockState, address: Address) {
    const g = s.groups[address];
    if (!g) throw new KotiziError("AccountNotFound");
    return g;
  }

  private membership(s: MockState, address: Address) {
    const m = s.memberships[address];
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

  async getGroup(address: Address) {
    this.assertOnline();
    return structuredClone(this.s.groups[address] ?? null);
  }

  async getGroupMetadata(group: Group) {
    this.assertOnline();
    return structuredClone(this.s.metadata[group.address] ?? null);
  }

  async listGroupMemberships(group: Address) {
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

  async joinGroup({ owner, group, payFirstQuota }: { owner: Address; group: Address; payFirstQuota?: boolean }) {
    const address = randomAddress();
    const result = await this.tx((s) => {
      if (!s.kyc[owner]) throw new KotiziError("KycRequired");
      const g = this.group(s, group);
      const index = g.membersJoined;
      if (index >= g.maxMembers) throw new KotiziError("GroupFull");
      const m: Membership = { id: address, address, group, asset: randomAddress(), index, totalPaid: 0n, owner };
      s.memberships[address] = m;
      g.membersJoined = index + 1;
      if (payFirstQuota) this.pay(s, g, m);
    });
    return { ...result, membership: address };
  }

  payQuota({ owner, membership }: { owner: Address; membership: Address }) {
    return this.tx((s) => {
      const m = this.membership(s, membership);
      if (m.owner !== owner) throw new KotiziError("NotAssetOwner");
      this.pay(s, this.group(s, m.group), m);
    });
  }

  async drawNow({ group }: { group: Address }): Promise<DrawStep> {
    this.assertOnline();
    const g = this.group(this.s, group);
    const next = nextDrawStep(g, currentSlot(), nowSecs());
    if ("reason" in next) {
      await sleep(this.options.latencyMs ?? 300);
      return { action: null, reason: next.reason };
    }
    const { step } = next;
    const result = await this.tx((s) => (step === "request" ? this.requestDraw(s, group) : this.settleDraw(s, group)));
    return { action: step, ...result };
  }

  claimPrize({ owner, membership }: { owner: Address; membership: Address }) {
    return this.tx((s) => {
      const m = this.membership(s, membership);
      const g = this.group(s, m.group);
      if (m.owner !== owner) throw new KotiziError("NotAssetOwner");
      if (!hasWon(g, m.index)) throw new KotiziError("NotWinner");
      this.claim(s, g, m);
    });
  }

  // --- draw steps (request_draw / settle_draw) ---------------------------------------------

  private requestDraw(s: MockState, group: Address) {
    const g = this.group(s, group);
    if (nowSecs() < g.nextDrawTs) throw new KotiziError("DrawNotDue");
    const slot = currentSlot();
    if (g.status === "drawPending" && slot <= g.commitLedger + SLOT_HASH_EXPIRY_SLOTS)
      throw new KotiziError("DrawNotExpired");
    if (g.status === "completed") throw new KotiziError("GroupNotOpen");
    if (eligibleBitmap(g) === 0n) throw new KotiziError("NoEligibleMembers");
    g.commitLedger = slot + SLOT_HASH_DELAY;
    g.drawSource = "ledgerHash";
    g.status = "drawPending";
  }

  private settleDraw(s: MockState, group: Address) {
    const g = this.group(s, group);
    if (g.status !== "drawPending") throw new KotiziError("NoDrawPending");
    if (currentSlot() <= g.commitLedger) throw new KotiziError("DrawTooEarly");

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

    this.runBots(s, g);
  }

  // --- simulation helpers ------------------------------------------------------------------

  private pay(s: MockState, g: Group, m: Membership) {
    if (g.status !== "open") throw new KotiziError("GroupNotOpen");
    if (hasPaid(g, m.index)) throw new KotiziError("AlreadyPaid");
    this.transfer(s, m.owner, g.quotaAmount);
    s.vaults[g.address] = (s.vaults[g.address] ?? 0n) + g.quotaAmount;
    g.paidBitmap |= bit(m.index);
    m.totalPaid = (m.totalPaid ?? 0n) + g.quotaAmount; // the mock, like Solana, keeps the total
  }

  private claim(s: MockState, g: Group, m: Membership) {
    if (!isUnclaimed(g, m.index)) throw new KotiziError("AlreadyClaimed");
    const pool = g.prizes[m.index];
    g.unclaimedBitmap &= ~bit(m.index);
    g.unclaimedTotal -= pool;
    s.vaults[g.address] = (s.vaults[g.address] ?? 0n) - pool;
    credit(s, m.owner, netPrize(pool, g.adminFeeBps));
    credit(s, g.organizer, adminFee(pool, g.adminFeeBps));
  }

  /** Bots claim a prize they won and pay the new round's quota. */
  private runBots(s: MockState, g: Group) {
    const members = Object.values(s.memberships).filter((m) => m.group === g.address);
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
    const address = randomAddress();
    const result = await this.tx((s) => {
      assertCreateGroupInput(input);
      const any = Object.values(s.groups)[0];
      s.groups[address] = {
        id: address,
        address,
        organizer: input.organizer,
        groupId: BigInt(Date.now()),
        mint: any?.mint ?? randomAddress(),
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
        drawSource: "ledgerHash",
        commitLedger: 0n,
        lastWinnerIndex: 0,
        prizes: Array.from({ length: MAX_SHARES }, () => 0n),
        wonRound: Array.from({ length: MAX_SHARES }, () => 0),
        unclaimedBitmap: 0n,
        unclaimedTotal: 0n,
      };
      s.vaults[address] = 0n;
      // The metadata route serves `/metadata/<slug>.json[?value=<usd>]`; read the same content back.
      const [, slug, query] = /\/metadata\/([\w-]+)\.json(?:\?(.*))?$/.exec(input.uri) ?? [];
      if (slug && isGroupSlug(slug)) {
        const value = Number(new URLSearchParams(query).get("value"));
        const content = Number.isFinite(value) && value > 0 ? { ...GROUP_CONTENT[slug], propertyValueUsd: value } : GROUP_CONTENT[slug];
        const metadata = parseGroupMetadata(groupMetadataJson(content, { image: "/brand/symbol-white.svg" }));
        if (metadata) s.metadata[address] = metadata;
      }
    });
    return { ...result, group: address };
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
