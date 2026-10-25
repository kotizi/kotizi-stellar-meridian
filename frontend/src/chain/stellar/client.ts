import { z } from "zod";

import type { SessionSigner } from "@/session/context";

import { BackendError, type BackendApi } from "../api";
import type { KotiziClient } from "../client";
import { KotiziError } from "../errors";
import { parseGroupId } from "../ids";
import { cachedGroupMetadata } from "../metadata";
import type { Address, DrawStep, Group, GroupId, KycRecord, Membership, MembershipId, TxResult } from "../types";
import { toStellarError } from "./errors";
import { toAppUnits } from "./units";
import {
  configViewSchema,
  groupViewSchema,
  kycViewSchema,
  membersViewSchema,
  meViewSchema,
  toGroup,
  toMembership,
  type ConfigView,
  type MeView,
} from "./views";

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
 * - Writes (join, pay, claim, draw, the checkout's deposit) arrive with the relay; group creation
 *   with the admin's Freighter wallet.
 */
export class StellarKotiziClient implements KotiziClient {
  readonly kind = "stellar" as const;
  private config: Promise<ConfigView> | null = null;
  private readonly groupsInFlight = new Map<number, Promise<{ group: Group; decimals: number } | null>>();
  private meInFlight: Promise<MeView> | null = null;

  constructor(
    private readonly deps: {
      api: BackendApi;
      /** The session's Stellar wallet; null when signed out (reads still work). */
      signer: SessionSigner | null;
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

  joinGroup(): Promise<TxResult & { membership: MembershipId }> {
    return notYet("joinGroup");
  }

  payQuota(): Promise<TxResult> {
    return notYet("payQuota");
  }

  claimPrize(): Promise<TxResult> {
    return notYet("claimPrize");
  }

  drawNow(): Promise<DrawStep> {
    return notYet("drawNow");
  }

  createGroup(): Promise<TxResult & { group: GroupId }> {
    return notYet("createGroup");
  }

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

/** Writes arrive with the relay (part 5 of the Stellar plan, AGENTS.md); until then they fail plainly. */
function notYet(action: string): Promise<never> {
  return Promise.reject(new KotiziError("TransactionFailed", { cause: new Error(`${action} isn't available on Stellar yet`) }));
}
