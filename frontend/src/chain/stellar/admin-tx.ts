import {
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  type Account,
  type Transaction,
} from "@stellar/stellar-sdk";

import { sleep } from "@/lib/sleep";

import { KotiziError } from "../errors";
import { contractErrorFromHost } from "./errors";

// The admin's own transaction (`create_group`): signed and paid by the admin's Freighter wallet and
// sent straight to the Soroban RPC, since the relay doesn't accept it. The only place the app builds
// a transaction itself, so the only module that loads `@stellar/stellar-sdk` (imported on demand).

const TX_TIMEOUT_SECS = 180;
const POLL_MS = 1_500;
const POLL_TRIES = 40;

/** The RPC calls this needs (a seam for tests; `createAdminRpc` is the real one). */
export interface AdminRpc {
  getAccount(address: string): Promise<Account>;
  prepareTransaction(tx: Transaction): Promise<Transaction>;
  sendTransaction(tx: Transaction): Promise<{ status: string; hash: string; errorResult?: { toXDR(format: "base64"): string } }>;
  getTransaction(hash: string): Promise<{ status: string; returnValue?: ReturnType<typeof nativeToScVal> }>;
}

export function createAdminRpc(rpcUrl: string): AdminRpc {
  return new rpc.Server(rpcUrl) as unknown as AdminRpc;
}

/** `create_group`'s arguments, in the contract's units (the quota in the token's base units). */
export interface CreateGroupCall {
  name: string;
  uri: string;
  token: string;
  quota: bigint;
  maxMembers: number;
  periodSecs: number;
  adminFeeBps: number;
}

/**
 * Builds `create_group`, simulates it on the RPC (fees, footprint, the admin's authorization), has the
 * wallet sign the envelope, sends it and waits until it lands. Resolves with its hash and the new
 * group's number (the call's return value).
 */
export async function submitCreateGroup({
  server,
  networkPassphrase,
  contractId,
  admin,
  call,
  sign,
}: {
  server: AdminRpc;
  networkPassphrase: string;
  contractId: string;
  admin: string;
  call: CreateGroupCall;
  /** Signs the base64 envelope and answers it signed (the admin's wallet). */
  sign: (transactionXdr: string) => Promise<string>;
}): Promise<{ hash: string; groupId: number }> {
  let account: Account;
  try {
    account = await server.getAccount(admin);
  } catch (error) {
    // An admin account that was never funded has no ledger entry: it can't pay the fee.
    throw new KotiziError("NotEnoughXlm", { cause: error });
  }
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(
      new Contract(contractId).call(
        "create_group",
        nativeToScVal(call.name, { type: "string" }),
        nativeToScVal(call.uri, { type: "string" }),
        new Address(call.token).toScVal(),
        nativeToScVal(call.quota, { type: "i128" }),
        nativeToScVal(call.maxMembers, { type: "u32" }),
        nativeToScVal(BigInt(call.periodSecs), { type: "u64" }),
        nativeToScVal(call.adminFeeBps, { type: "u32" }),
      ),
    )
    .setTimeout(TX_TIMEOUT_SECS)
    .build();

  let prepared: Transaction;
  try {
    prepared = await server.prepareTransaction(tx);
  } catch (error) {
    throw hostError(error);
  }
  const signed = TransactionBuilder.fromXDR(await sign(prepared.toXDR()), networkPassphrase) as Transaction;

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    const result = sent.errorResult?.toXDR("base64") ?? "";
    throw new KotiziError(/insufficient/i.test(result) ? "NotEnoughXlm" : "TransactionFailed", { cause: new Error(result) });
  }
  for (let i = 0; i < POLL_TRIES; i++) {
    const got = await server.getTransaction(sent.hash);
    if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { hash: sent.hash, groupId: Number(got.returnValue ? scValToNative(got.returnValue) : NaN) };
    }
    if (got.status === rpc.Api.GetTransactionStatus.FAILED) throw new KotiziError("TransactionFailed", { cause: got });
    await sleep(POLL_MS);
  }
  throw new KotiziError("TransactionExpired");
}

/** A failed simulation: the contract's own refusal when it names one, else a plain failure. */
function hostError(error: unknown): KotiziError {
  const message = error instanceof Error ? error.message : String(error);
  const code = contractErrorFromHost(message);
  if (code) return new KotiziError(code, { cause: error });
  // The admin can't cover the fee or the rent of the new entries.
  if (/insufficient|balance/i.test(message)) return new KotiziError("NotEnoughXlm", { cause: error });
  return new KotiziError("TransactionFailed", { cause: error });
}
