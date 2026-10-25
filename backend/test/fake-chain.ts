import {
  Account,
  Address,
  Keypair,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import { GroupStatus, type Chain, type ContractConfig, type Prepared, type RawGroup, type RawWinner } from '../src/stellar/chain.js';
import { StellarTxError } from '../src/stellar/errors.js';

export const PASSPHRASE = Networks.TESTNET;
export const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7));
export const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 9));
export const newKey = () => Keypair.random();

export function group(over: Partial<RawGroup> = {}): RawGroup {
  return {
    id: 0,
    name: 'Casa Demo',
    uri: 'https://example.com/m.json',
    quota: 100_000_000n,
    period: 60n,
    nextDrawTs: 1_000n,
    adminFeeBps: 200,
    maxMembers: 3,
    membersJoined: 3,
    round: 0,
    status: GroupStatus.Open,
    paidBitmap: 0n,
    wonBitmap: 0n,
    unclaimedBitmap: 0n,
    unclaimedTotal: 0n,
    vault: 0n,
    lastWinnerIndex: 0,
    commitment: '00'.repeat(32),
    commitLedger: 0,
    committer: null,
    ...over,
  };
}

export type Sent = { tx: Transaction; hash: string };

/**
 * An in-memory `Chain`. Reads come from plain fields; `invokeTx` builds a real (offline) transaction the
 * way a simulation would assemble it, with an unsigned address authorization entry for the acting wallet
 * (plus the token transfer for pay_quota), so the relay's validation and signing run on real XDR.
 */
export class FakeChain implements Chain {
  readonly contractId = CONTRACT;
  admin = newKey().publicKey();
  kycAuthority = newKey().publicKey();
  ledgerSeq = 1_000;
  groupList: RawGroup[] = [];
  winnerList = new Map<number, RawWinner[]>();
  owners = new Map<number, string[]>();
  kyc = new Set<string>();
  accounts = new Set<string>();
  usdc = new Map<string, bigint>();
  xlm = new Map<string, bigint>();
  sent: Sent[] = [];
  failSimulationWith: string | undefined;
  fee = '100000';
  private nonce = 1n;

  async config(): Promise<ContractConfig> {
    return { admin: this.admin, kycAuthority: this.kycAuthority, token: TOKEN };
  }
  async ledger() {
    return this.ledgerSeq;
  }
  async groupCount() {
    return this.groupList.length;
  }
  async group(id: number) {
    return this.groupList.find((g) => g.id === id) ?? null;
  }
  async groups() {
    return this.groupList;
  }
  async winners(id: number) {
    return this.winnerList.get(id) ?? [];
  }
  async cotaOwners(id: number) {
    return this.owners.get(id) ?? [];
  }
  async totalPaid() {
    return 0n;
  }
  async isKyc(w: string) {
    return this.kyc.has(w);
  }
  async tokenBalance(w: string) {
    return this.usdc.get(w) ?? 0n;
  }
  async accountExists(w: string) {
    return this.accounts.has(w);
  }
  async xlmBalance(w: string) {
    return this.xlm.get(w) ?? 10_000_000_000n;
  }
  async accountSequence() {
    return '1';
  }

  async invokeTx(source: string, func: xdr.HostFunction, auth: xdr.SorobanAuthorizationEntry[] = []): Promise<Prepared> {
    if (this.failSimulationWith) throw new StellarTxError(this.failSimulationWith);
    const call = func.type === 'hostFunctionTypeInvokeContract' ? func.invokeContract : undefined;
    let entries = auth;
    if (call && auth.length === 0) {
      const fn = String(call.functionName);
      const groupId = call.args[0]!.type === 'scvU32' ? call.args[0]!.u32 : 0;
      const wallet =
        fn === 'join_group'
          ? Address.fromScAddress((call.args[1] as xdr.ScVal & { type: 'scvAddress' }).address).toString()
          : this.owners.get(groupId)?.[Number((call.args[1] as { u32: number }).u32)];
      if (wallet && StrKey.isValidEd25519PublicKey(wallet)) {
        const subs =
          fn === 'pay_quota'
            ? [
                new xdr.SorobanAuthorizedInvocation({
                  function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
                    new xdr.InvokeContractArgs({
                      contractAddress: new Address(TOKEN).toScAddress(),
                      functionName: 'transfer',
                      args: [new Address(wallet).toScVal(), new Address(CONTRACT).toScVal(), nativeToScVal(100_000_000n, { type: 'i128' })],
                    }),
                  ),
                  subInvocations: [],
                }),
              ]
            : [];
        entries = [
          new xdr.SorobanAuthorizationEntry({
            credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
              new xdr.SorobanAddressCredentials({
                address: new Address(wallet).toScAddress(),
                nonce: this.nonce++,
                signatureExpirationLedger: 0,
                signature: xdr.ScVal.scvVoid(),
              }),
            ),
            rootInvocation: new xdr.SorobanAuthorizedInvocation({
              function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
              subInvocations: subs,
            }),
          }),
        ];
      }
    }
    const tx = new TransactionBuilder(new Account(source, '1'), { fee: this.fee, networkPassphrase: PASSPHRASE })
      .addOperation(Operation.invokeHostFunction({ func, auth: entries }))
      .setTimeout(60)
      .build();
    return { transaction: tx, estFeeStroops: Number(this.fee) };
  }

  async simulate() {}

  async send(tx: Transaction) {
    const hash = Buffer.from(tx.hash()).toString('hex');
    this.sent.push({ tx, hash });
    return hash;
  }

  createdAccounts: string[] = [];
  async createAccount(_funder: Keypair, destination: string) {
    this.accounts.add(destination);
    this.createdAccounts.push(destination);
    return 'create-' + destination.slice(0, 6);
  }
}
