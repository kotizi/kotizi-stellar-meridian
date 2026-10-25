import { z } from "zod";

import { groupIdOf, membershipIdOf, nftTokenId } from "../ids";
import type { Group, Membership } from "../types";
import { groupStateViewSchema, numericString, toGroupState } from "../views";
import { toAppUnits } from "./units";

// What the backend's routes answer (backend/src/routes, backend/src/stellar/views.ts), checked with
// Zod, and their conversion to the app's types. Amounts arrive in each token's base units and leave
// in the app's unit (`units.ts`).

/** `GET /v1/config`: the deployment, read once (it doesn't change while the app runs). */
export const configViewSchema = z.object({
  contractId: z.string(),
  rpcUrl: z.string(),
  networkPassphrase: z.string(),
  admin: z.string(),
  kycAuthority: z.string(),
  /** Tokens groups can be created in, with their decimals. */
  tokens: z.array(z.object({ token: z.string(), decimals: z.number().int().min(0).max(18) })),
  sponsor: z.string(),
  kycMode: z.string(),
  faucet: z.boolean(),
  /** The test token the faucet mints; absent when the faucet is off. */
  faucetToken: z.string().optional(),
  faucetAmountUsdc: z.number(),
});
export type ConfigView = z.infer<typeof configViewSchema>;

/** `GET /v1/groups/:id` (and each entry of `GET /v1/groups`). */
export const groupViewSchema = groupStateViewSchema.extend({
  id: z.string(),
  address: z.string(),
  organizer: z.string(),
  groupId: z.number().int().nonnegative(),
  mint: z.string(),
  /** The group's token decimals; null for a token the contract no longer lists (never expected). */
  decimals: z.number().int().min(0).max(18).nullable(),
  drawSource: z.literal("drand"),
  drawRound: numericString,
  vault: numericString,
});
export type GroupView = z.infer<typeof groupViewSchema>;

/** One share of `GET /v1/groups/:id/members`, with the current owner of its NFT. */
export const memberViewSchema = z.object({
  index: z.number().int().nonnegative(),
  owner: z.string(),
  totalPaid: numericString,
  paidThisRound: z.boolean(),
  won: z.boolean(),
  prize: numericString,
  claimable: z.boolean(),
});
export const membersViewSchema = z.object({ group: z.string(), members: z.array(memberViewSchema) });
export type MemberView = z.infer<typeof memberViewSchema>;

/** `GET /v1/me`: the signed-in user's wallets (ledger account, identity, balance per token) and shares. */
export const meViewSchema = z.object({
  userId: z.string(),
  wallets: z.array(
    z.object({
      address: z.string(),
      /** Whether the wallet has a ledger account yet (`POST /v1/kyc` creates it). */
      active: z.boolean(),
      kyc: z.boolean(),
      /** Token contract id → balance in that token's base units. */
      balances: z.record(z.string(), numericString),
    }),
  ),
  cotas: z.array(
    z.object({
      group: z.string(),
      groupName: z.string(),
      index: z.number().int().nonnegative(),
      owner: z.string(),
      paidThisRound: z.boolean(),
      alreadyWon: z.boolean(),
      canClaim: z.boolean(),
      prize: numericString,
    }),
  ),
});
export type MeView = z.infer<typeof meViewSchema>;

/** `POST /v1/kyc`: the wallet's identity approval (and its ledger account, created when missing). */
export const kycViewSchema = z.object({
  wallet: z.string(),
  status: z.literal("approved"),
  alreadyApproved: z.boolean().optional(),
  txHash: z.string().optional(),
  activationTx: z.string().nullable(),
});

/** A 32-byte authorization payload or ed25519 key, as the backend's hex. */
const hex32 = z.string().regex(/^[0-9a-fA-F]{64}$/);

/**
 * `POST /v1/tx/prepare`: the call built and simulated with the sponsor as its source, and what the
 * wallet signs, one 32-byte payload per Soroban authorization entry, in order.
 */
export const prepareViewSchema = z.object({
  /** The assembled, unsigned transaction (base64 XDR): sent back untouched with the signatures. */
  transaction: z.string().min(1),
  /** The ledger the authorization signatures stay valid until. */
  validUntilLedger: z.number().int().positive(),
  payloads: z.array(z.object({ address: z.string(), payload: hex32 })).min(1),
});
export type PrepareView = z.infer<typeof prepareViewSchema>;

/** `POST /v1/tx/relay`: answered once the transaction is confirmed. */
export const relayViewSchema = z.object({ txHash: z.string().min(1), kinds: z.array(z.string()) });

/** `POST /v1/groups/:id/draw`: the step the keeper ran, or why there was none. */
export const drawViewSchema = z.object({
  action: z.enum(["request", "settle"]).nullable(),
  txHash: z.string().nullable(),
  reason: z.string().nullable(),
});

/** `POST /v1/faucet`: the demo token minted to the wallet (a fixed amount, once a day). */
export const faucetViewSchema = z.object({ wallet: z.string(), amount: numericString, txHash: z.string().min(1) });

/** A group view in the app's types, its amounts in the app's unit. */
export function toGroup(view: GroupView, decimals: number): Group {
  const state = toGroupState(view);
  const amount = (value: bigint) => toAppUnits(value, decimals);
  return {
    ...state,
    id: groupIdOf(view.groupId),
    address: view.address,
    organizer: view.organizer,
    groupId: view.groupId,
    mint: view.mint,
    drawSource: view.drawSource,
    drawRound: BigInt(view.drawRound),
    quotaAmount: amount(state.quotaAmount),
    prizes: state.prizes.map(amount),
    unclaimedTotal: amount(state.unclaimedTotal),
  };
}

/** One share of a group, its total paid in the app's unit. */
export function toMembership(group: Group, decimals: number, view: MemberView): Membership {
  return {
    id: membershipIdOf(group.groupId, view.index),
    address: group.address,
    group: group.id,
    asset: String(nftTokenId(group.groupId, view.index)),
    index: view.index,
    totalPaid: toAppUnits(BigInt(view.totalPaid), decimals),
    owner: view.owner,
  };
}
