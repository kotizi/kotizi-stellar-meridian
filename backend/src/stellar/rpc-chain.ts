import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk';
import { sleep } from '../util.js';
import { u32 } from './invoke.js';
import type { Chain, ContractConfig, Prepared, RawGroup, RawWinner, TokenInfo } from './chain.js';
import { StellarTxError, zeroIfNoTrustline } from './errors.js';

const TX_TIMEOUT_SECS = 120;
const POLL_MS = 1_000;
const POLL_TRIES = 40;

type Native = Record<string, unknown>;

/**
 * `Chain` over a Soroban RPC node. `sponsor` pays for restores it has to submit and is the account
 * whose sequence number the read-only simulations borrow. UNTESTED against a live network so far:
 * the unit tests use a fake `Chain` (see test/fake-chain.ts).
 */
export class RpcChain implements Chain {
  private cachedConfig: ContractConfig | undefined;

  constructor(
    readonly server: rpc.Server,
    readonly contractId: string,
    private readonly networkPassphrase: string,
    private readonly sponsor: Keypair,
  ) {}

  // ------------------------------------------------------------------ reads

  private async view(fn: string, args: xdr.ScVal[] = [], contractId = this.contractId): Promise<unknown> {
    const tx = new TransactionBuilder(new Account(this.sponsor.publicKey(), '0'), {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(fn, ...args))
      .setTimeout(TX_TIMEOUT_SECS)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new StellarTxError(sim.error);
    return sim.result ? scValToNative(sim.result.retval) : undefined;
  }

  async config(): Promise<ContractConfig> {
    if (this.cachedConfig) return this.cachedConfig;
    const c = (await this.view('config')) as Native;
    this.cachedConfig = { admin: String(c.admin), kycAuthority: String(c.kyc_authority) };
    return this.cachedConfig;
  }

  async tokens(): Promise<TokenInfo[]> {
    const list = (await this.view('tokens')) as Native[];
    return list.map((t) => ({ token: String(t.token), decimals: Number(t.decimals) }));
  }

  async ledger(): Promise<number> {
    return (await this.server.getLatestLedger()).sequence;
  }

  async groupCount(): Promise<number> {
    return Number(await this.view('group_count'));
  }

  async group(id: number): Promise<RawGroup | null> {
    try {
      return toRawGroup(id, (await this.view('get_group', [u32(id)])) as Native);
    } catch (e) {
      if (e instanceof StellarTxError && e.contractError === 'GroupNotFound') return null;
      throw e;
    }
  }

  async groups(): Promise<RawGroup[]> {
    const n = await this.groupCount();
    const all = await Promise.all(Array.from({ length: n }, (_, i) => this.group(i)));
    return all.filter((g): g is RawGroup => g !== null);
  }

  async winners(id: number): Promise<RawWinner[]> {
    const rows = (await this.view('winners', [u32(id)])) as Native[];
    return rows.map((w) => ({ index: Number(w.index), gross: BigInt(w.gross as bigint), wonRound: Number(w.won_round) }));
  }

  async cotaOwners(id: number): Promise<string[]> {
    return ((await this.view('cota_owners', [u32(id)])) as unknown[]).map(String);
  }

  async totalPaid(id: number, index: number): Promise<bigint> {
    return BigInt((await this.view('total_paid', [u32(id), u32(index)])) as bigint);
  }

  async isKyc(wallet: string): Promise<boolean> {
    return (await this.view('is_kyc', [new Address(wallet).toScVal()])) === true;
  }

  async tokenBalance(wallet: string, token: string): Promise<bigint> {
    return zeroIfNoTrustline(async () => BigInt((await this.view('balance', [new Address(wallet).toScVal()], token)) as bigint));
  }

  async accountExists(wallet: string): Promise<boolean> {
    try {
      await this.server.getAccount(wallet);
      return true;
    } catch (e) {
      if (/not found/i.test(String((e as Error).message))) return false;
      throw e;
    }
  }

  /** Through the native-asset contract, so no ledger-entry XDR is touched. */
  async xlmBalance(wallet: string): Promise<bigint> {
    if (!(await this.accountExists(wallet))) return 0n;
    const native = Asset.native().contractId(this.networkPassphrase);
    return BigInt((await this.view('balance', [new Address(wallet).toScVal()], native)) as bigint);
  }

  async accountSequence(wallet: string): Promise<string> {
    return (await this.server.getAccount(wallet)).sequenceNumber();
  }

  // ------------------------------------------------------------------ writes

  async invokeTx(source: string, func: xdr.HostFunction, auth: xdr.SorobanAuthorizationEntry[] = []): Promise<Prepared> {
    const build = async () =>
      new TransactionBuilder(await this.server.getAccount(source), { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
        .addOperation(Operation.invokeHostFunction({ func, auth }))
        .setTimeout(TX_TIMEOUT_SECS)
        .build();

    let tx = await build();
    let sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationRestore(sim)) {
      // Archived entries the call needs: restore them (paid by the sponsor), then simulate again.
      await this.restore(sim.restorePreamble);
      tx = await build();
      sim = await this.server.simulateTransaction(tx);
    }
    if (rpc.Api.isSimulationError(sim)) throw new StellarTxError(sim.error);
    const assembled = rpc.assembleTransaction(tx, sim).build();
    return { transaction: assembled, estFeeStroops: Number(assembled.fee) };
  }

  private async restore(preamble: rpc.Api.SimulateTransactionRestoreResponse["restorePreamble"]) {
    const tx = new TransactionBuilder(await this.server.getAccount(this.sponsor.publicKey()), {
      fee: String(Number(BASE_FEE) + Number(preamble.minResourceFee)),
      networkPassphrase: this.networkPassphrase,
      sorobanData: preamble.transactionData.build(),
    })
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(TX_TIMEOUT_SECS)
      .build();
    tx.sign(this.sponsor);
    await this.send(tx);
  }

  async simulate(tx: Transaction): Promise<void> {
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new StellarTxError(sim.error);
  }

  async send(tx: Transaction): Promise<string> {
    const res = await this.server.sendTransaction(tx);
    if (res.status === 'ERROR') throw new StellarTxError('transaction rejected', [res.errorResult?.toXDR('base64') ?? 'unknown']);
    if (res.status === 'TRY_AGAIN_LATER' || res.status === 'DUPLICATE') throw new StellarTxError(`transaction ${res.status.toLowerCase()}`);
    for (let i = 0; i < POLL_TRIES; i++) {
      const got = await this.server.getTransaction(res.hash);
      if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) return res.hash;
      if (got.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new StellarTxError('transaction failed', [got.resultXdr?.toXDR('base64') ?? 'unknown']);
      }
      await sleep(POLL_MS);
    }
    throw new StellarTxError('transaction not confirmed in time');
  }

  async createAccount(funder: Keypair, destination: string, startingBalanceXlm: string): Promise<string> {
    const tx = new TransactionBuilder(await this.server.getAccount(funder.publicKey()), {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.createAccount({ destination, startingBalance: startingBalanceXlm }))
      .setTimeout(TX_TIMEOUT_SECS)
      .build();
    tx.sign(funder);
    return this.send(tx);
  }
}



function toRawGroup(id: number, g: Native): RawGroup {
  return {
    id,
    name: String(g.name),
    uri: String(g.uri),
    token: String(g.token),
    quota: BigInt(g.quota as bigint),
    period: BigInt(g.period as bigint),
    nextDrawTs: BigInt(g.next_draw_ts as bigint),
    adminFeeBps: Number(g.admin_fee_bps),
    maxMembers: Number(g.max_members),
    membersJoined: Number(g.members_joined),
    round: Number(g.round),
    status: Number(g.status),
    paidBitmap: BigInt(g.paid_bitmap as bigint),
    wonBitmap: BigInt(g.won_bitmap as bigint),
    unclaimedBitmap: BigInt(g.unclaimed_bitmap as bigint),
    unclaimedTotal: BigInt(g.unclaimed_total as bigint),
    vault: BigInt(g.vault as bigint),
    lastWinnerIndex: Number(g.last_winner_index),
    drawRound: BigInt(g.draw_round as bigint),
  };
}
