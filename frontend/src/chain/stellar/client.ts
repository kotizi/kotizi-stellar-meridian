import { z } from "zod";

import { createSerialQueue } from "@/lib/serial";
import type { AdminWallet, SessionSigner } from "@/session/context";

import { BackendError, type BackendApi } from "../api";
import type { KotiziClient } from "../client";
import { assertCreateGroupInput } from "../derive";
import { KotiziError } from "../errors";
import { groupIdOf, membershipIdOf, parseGroupId, parseMembershipId } from "../ids";
import { cachedGroupMetadata } from "../metadata";
import type {
  Address,
  CreateGroupInput,
  DrawStep,
  Group,
  GroupId,
  KycRecord,
  Membership,
  MembershipId,
  TxResult,
} from "../types";
import { toDrawStep } from "../views";
import type { AdminRpc } from "./admin-tx";
import { toStellarError } from "./errors";
import { toAppUnits, toTokenUnits } from "./units";
import {
  configViewSchema,
  drawViewSchema,
  faucetViewSchema,
  groupViewSchema,
  kycViewSchema,
  membersViewSchema,
  meViewSchema,
  prepareViewSchema,
  relayViewSchema,
  toGroup,
  toMembership,
  type ConfigView,
  type MeView,
} from "./views";

/** The calls the backend relays (`RELAY_FUNCTIONS` in backend/src/relay/validate.ts). */
type RelayFunction = "join_group" | "pay_quota" | "claim_prize";

/** The public network's passphrase: the app never sends anything there. */
const PUBLIC_NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

/**
 * The Kotizi contract on Stellar testnet, behind the same interface as the mock.
 *
 * - Everything goes through the backend (`backend/README.md`): reads come from its views of the
 *   contract; the contract id, RPC, admin and enabled tokens from `/v1/config`.
 * - Amounts arrive in each group's token decimals and leave in the app's unit (`units.ts`).
 * - The open groups list keeps only the groups in the faucet's token (user decision, 2026-10-25):
 *   on testnet that's the token our users can be funded in (Circle's USDC needs a trustline the app
 *   doesn't create, and the 7-decimal test token has no faucet). Any group still opens by id.
 * - Every user action is gasless: the backend builds the call with its sponsor as the source and
 *   answers the authorization payloads; the session's wallet signs each one (`signHash`, no prompt:
 *   our screens are the confirmation) and the relay sends it, paying the fee and the rent. One call
 *   at a time.
 * - Draws, identity approval and the test faucet are run by the backend with its own keys. Group
 *   creation arrives with the admin's Freighter wallet.
 */
export class StellarKotiziClient implements KotiziClient {
  readonly kind = "stellar" as const;
  private config: Promise<ConfigView> | null = null;
  private readonly groupsInFlight = new Map<number, Promise<{ group: Group; decimals: number } | null>>();
  private meInFlight: Promise<MeView> | null = null;
  private readonly serial = createSerialQueue();

  constructor(
    private readonly deps: {
      api: BackendApi;
      /** The session's Stellar wallet; null when signed out (reads still work). */
      signer: SessionSigner | null;
      /** The admin's Freighter wallet, for group creation; null in sessions without one. */
      adminWallet?: AdminWallet | null;
      /** The RPC the admin's transaction goes to; tests pass a fake one. Default: the backend's `rpcUrl`. */
      adminRpc?: (rpcUrl: string) => AdminRpc;
    },
  ) {}

  // --- reads ---------------------------------------------------------------------------------

  listGroups() {
    return this.wrap(async () => {
      const [{ groups }, config] = await Promise.all([
        this.deps.api.request("/v1/groups", z.object({ groups: z.array(groupViewSchema) })),
        this.getConfig(),
      ]);
      return groups.flatMap((view) =>
        view.decimals === null || (config.faucetToken !== undefined && view.mint !== config.faucetToken)
          ? []
          : [toGroup(view, view.decimals)],
      );
    });
  }

  getGroup(id: GroupId) {
    return this.wrap(async () => {
      const groupId = parseGroupId(id);
      return groupId === null ? null : ((await this.group(groupId))?.group ?? null);
    });
  }

  getGroupMetadata(group: Group) {
    return cachedGroupMetadata(group.uri);
  }

  listGroupMemberships(id: GroupId) {
    return this.wrap(async () => {
      const groupId = parseGroupId(id);
      return groupId === null ? [] : this.members(groupId);
    });
  }

  listSharesByOwner(owner: Address) {
    return this.wrap(async () => {
      const owned = (await this.me()).cotas.filter((c) => c.owner === owner);
      const groupIds = [...new Set(owned.map((c) => c.group))].flatMap((id) => {
        const groupId = parseGroupId(id);
        return groupId === null ? [] : [groupId];
      });
      const shares = await Promise.all(
        groupIds.map(async (groupId) => {
          const [found, members] = await Promise.all([this.group(groupId), this.members(groupId)]);
          if (!found) return [];
          const mine = new Set(owned.filter((c) => c.group === found.group.id).map((c) => c.index));
          return members.filter((m) => mine.has(m.index)).map((membership) => ({ membership, group: found.group }));
        }),
      );
      return shares.flat();
    });
  }

  getKyc(wallet: Address) {
    return this.wrap(async (): Promise<KycRecord | null> => {
      const found = (await this.me()).wallets.find((w) => w.address === wallet);
      // `/v1/me` answers a flag; the approval date stays on chain.
      return found?.kyc ? { wallet, approvedAt: 0 } : null;
    });
  }

  /** The wallet's balance in the faucet's token (the demo USD the open groups use), in the app's unit. */
  getUsdcBalance(wallet: Address) {
    return this.wrap(async () => {
      const [me, config] = await Promise.all([this.me(), this.getConfig()]);
      const token = config.tokens.find((t) => t.token === config.faucetToken);
      const raw = me.wallets.find((w) => w.address === wallet)?.balances[token?.token ?? ""];
      return token && raw ? toAppUnits(BigInt(raw), token.decimals) : 0n;
    });
  }

  isTestNetwork() {
    return this.wrap(async () => (await this.getConfig()).networkPassphrase !== PUBLIC_NETWORK_PASSPHRASE);
  }

  isAdmin(wallet: Address) {
    return this.wrap(async () => (await this.getConfig()).admin === wallet);
  }

  // --- actions ---------------------------------------------------------------------------------

  /**
   * Demo identity approval through the backend (`POST /v1/kyc`, `KYC_MODE=auto`), which also creates
   * the wallet's ledger account when it has none. Approved earlier: no transaction (empty signature).
   */
  verifyIdentity(wallet: Address) {
    return this.wrap(async () => {
      const result = await this.deps.api.request("/v1/kyc", kycViewSchema, { method: "POST", body: { wallet }, auth: true });
      // A `/v1/me` read already in flight predates the approval: the next one asks again.
      this.meInFlight = null;
      return { signature: result.txHash ?? "" };
    });
  }

  /**
   * `join_group`, then (when asked) `pay_quota` for the new share: two relayed calls, since the relay
   * takes one function per transaction. The relay answers once the join is confirmed but not with the
   * new index, so the new share is the one this wallet didn't hold before.
   */
  joinGroup({ owner, group, payFirstQuota }: { owner: Address; group: GroupId; payFirstQuota?: boolean }) {
    return this.wrap(async () => {
      const groupId = requireGroupId(group);
      const before = await this.ownedIndexes(groupId, owner);
      const joined = await this.relay(owner, "join_group", groupId);
      const index = [...(await this.ownedIndexes(groupId, owner))].find((i) => !before.has(i));
      if (index === undefined) throw new KotiziError("TransactionFailed", { cause: new Error("The joined share wasn't found") });
      const result = payFirstQuota ? await this.relay(owner, "pay_quota", groupId, index) : joined;
      return { ...result, membership: membershipIdOf(groupId, index) };
    });
  }

  payQuota({ owner, membership }: { owner: Address; membership: MembershipId }) {
    return this.wrap(async () => {
      const { groupId, index } = requireShare(membership);
      return this.relay(owner, "pay_quota", groupId, index);
    });
  }

  claimPrize({ owner, membership }: { owner: Address; membership: MembershipId }) {
    return this.wrap(async () => {
      const { groupId, index } = requireShare(membership);
      return this.relay(owner, "claim_prize", groupId, index);
    });
  }

  /** The backend's keeper runs the step (`request_draw` or `settle_draw` with the drand beacon) and pays it. */
  drawNow({ group }: { group: GroupId }) {
    return this.wrap(async (): Promise<DrawStep> => {
      const groupId = requireGroupId(group);
      const view = await this.deps.api.request(`/v1/groups/${groupId}/draw`, drawViewSchema, { method: "POST", auth: true });
      return toDrawStep(view.action, view.txHash, view.reason);
    });
  }

  /**
   * The admin's own transaction (not relayed): the contract's checks first, then `create_group` is
   * built and simulated on the RPC, signed by the admin's Freighter wallet (its own prompt) and sent;
   * resolves once it lands, with the new group's id. The group's token is the faucet's, the one
   * testnet users can be funded in (see `listGroups`); its quota is converted to that token's units.
   */
  createGroup(input: CreateGroupInput) {
    return this.wrap(async (): Promise<TxResult & { group: GroupId }> => {
      const wallet = this.deps.adminWallet;
      const config = await this.getConfig();
      if (!wallet?.address || wallet.address !== input.organizer || config.admin !== input.organizer) {
        throw new KotiziError("Unauthorized");
      }
      // Never the public network, whatever the backend says.
      if (config.networkPassphrase === PUBLIC_NETWORK_PASSPHRASE) throw new KotiziError("WalletWrongNetwork");
      // Same checks, in the same order, as `create_group`.
      assertCreateGroupInput(input);
      const token = config.tokens.find((t) => t.token === config.faucetToken) ?? (config.tokens.length === 1 ? config.tokens[0] : undefined);
      if (!token) throw new KotiziError("TokenNotSupported");

      const { createAdminRpc, submitCreateGroup } = await import("./admin-tx");
      const { hash, groupId } = await submitCreateGroup({
        server: this.deps.adminRpc?.(config.rpcUrl) ?? createAdminRpc(config.rpcUrl),
        networkPassphrase: config.networkPassphrase,
        contractId: config.contractId,
        admin: config.admin,
        call: {
          name: input.name,
          uri: input.uri,
          token: token.token,
          quota: toTokenUnits(input.quotaAmount, token.decimals),
          maxMembers: input.maxMembers,
          periodSecs: input.periodSecs,
          adminFeeBps: input.adminFeeBps,
        },
        sign: (transactionXdr) => wallet.signTransaction(transactionXdr, config.networkPassphrase),
      });
      return { signature: hash, group: groupIdOf(groupId) };
    });
  }

  readonly testing = {
    /**
     * The backend's faucet: mints its own fixed amount of the demo token (`FAUCET_AMOUNT_USDC`),
     * once per wallet per day (`FaucetLimit` after that), whatever `amount` says.
     */
    fundUsdc: (wallet: Address) =>
      this.wrap(async () => {
        const result = await this.deps.api.request("/v1/faucet", faucetViewSchema, { method: "POST", body: { wallet }, auth: true });
        this.meInFlight = null;
        return { signature: result.txHash };
      }),
    /** The checkout's deposit: the faucet, only when the wallet can't cover `amount` already. */
    depositShortfall: ({ owner, amount }: { owner: Address; amount: bigint }) =>
      this.wrap(async () => ((await this.getUsdcBalance(owner)) >= amount ? null : this.testing.fundUsdc(owner))),
  };

  // --- helpers -------------------------------------------------------------------------------

  /** The deployment, read once: it doesn't change while the app runs. */
  private getConfig() {
    this.config ??= this.deps.api.request("/v1/config", configViewSchema).catch((error: unknown) => {
      this.config = null; // ask again next time
      throw error;
    });
    return this.config;
  }

  /** Reads of the same group that run together share one request; a group the backend doesn't know is null. */
  private group(groupId: number) {
    let pending = this.groupsInFlight.get(groupId);
    if (!pending) {
      pending = this.deps.api
        .request(`/v1/groups/${groupId}`, groupViewSchema)
        .then((view) => (view.decimals === null ? null : { group: toGroup(view, view.decimals), decimals: view.decimals }))
        .catch(nullIfMissing)
        .finally(() => this.groupsInFlight.delete(groupId));
      this.groupsInFlight.set(groupId, pending);
    }
    return pending;
  }

  private async members(groupId: number): Promise<Membership[]> {
    const [found, list] = await Promise.all([
      this.group(groupId),
      this.deps.api.request(`/v1/groups/${groupId}/members`, membersViewSchema).catch(nullIfMissing),
    ]);
    if (!found || !list) return [];
    return list.members.map((m) => toMembership(found.group, found.decimals, m));
  }

  private async ownedIndexes(groupId: number, owner: Address) {
    return new Set((await this.members(groupId)).filter((m) => m.owner === owner).map((m) => m.index));
  }

  /**
   * The gasless path: the backend builds and simulates the call with its sponsor as the source and
   * answers the authorization payloads; the session's wallet signs each one and the relay sends the
   * transaction, answering once it is confirmed. A payload for any other address is refused before
   * anything is signed. One call at a time, so a join and its first payment never cross.
   */
  private relay(owner: Address, fn: RelayFunction, groupId: number, index?: number): Promise<TxResult> {
    return this.serial(async () => {
      const signer = this.deps.signer;
      if (!signer) throw new KotiziError("SessionExpired");
      if (signer.address !== owner) throw new KotiziError("NotAssetOwner");
      const prep = await this.deps.api.request("/v1/tx/prepare", prepareViewSchema, {
        method: "POST",
        auth: true,
        body: { fn, groupId, index, wallet: signer.address },
      });
      if (prep.payloads.some((p) => p.address !== signer.address)) throw new KotiziError("NotAssetOwner");
      const signatures: string[] = [];
      for (const { payload } of prep.payloads) signatures.push(hexOf(await signer.signHash(bytesOf(payload))));
      const { txHash } = await this.deps.api.request("/v1/tx/relay", relayViewSchema, {
        method: "POST",
        auth: true,
        body: { transaction: prep.transaction, validUntilLedger: prep.validUntilLedger, signatures },
      });
      // Balances and shares changed: the next `/v1/me` read asks again.
      this.meInFlight = null;
      return { signature: txHash };
    });
  }

  /** The account's wallets and shares: reads that poll together share one request. */
  private me() {
    this.meInFlight ??= this.deps.api.request("/v1/me", meViewSchema, { auth: true }).finally(() => {
      this.meInFlight = null;
    });
    return this.meInFlight;
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toStellarError(error);
    }
  }
}

/** A route the backend answers 404 for (no such group) reads as null. */
function nullIfMissing(error: unknown): null {
  if (error instanceof BackendError && error.status === 404) return null;
  throw error;
}

/** A group id the contract can have, or `AccountNotFound` (nothing is sent). */
function requireGroupId(id: GroupId): number {
  const groupId = parseGroupId(id);
  if (groupId === null) throw new KotiziError("AccountNotFound");
  return groupId;
}

/** A share id's group and index, or `AccountNotFound` (nothing is sent). */
function requireShare(id: MembershipId): { groupId: number; index: number } {
  const share = parseMembershipId(id);
  if (!share) throw new KotiziError("AccountNotFound");
  return share;
}

/** The backend's hex (no `0x`) as bytes. */
function bytesOf(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** Bytes as the backend's hex (no `0x`). */
function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

