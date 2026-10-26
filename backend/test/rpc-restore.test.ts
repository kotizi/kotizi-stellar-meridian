import { Keypair, SorobanDataBuilder, StrKey, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { RpcChain } from '../src/stellar/rpc-chain.js';
import { PASSPHRASE } from './fake-chain.js';

const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7));
const sponsor = Keypair.random();

/** A Soroban RPC stand-in: scripted simulation answers, and a record of what was sent. */
function stubServer(sims: object[]) {
  const sent: string[] = [];
  const server = {
    simulateTransaction: async () => sims.shift(),
    getAccount: async () => ({ accountId: () => sponsor.publicKey(), sequenceNumber: () => '1', incrementSequenceNumber() {} }),
    sendTransaction: async (tx: { operations: { type: string }[] }) => (sent.push(tx.operations[0]!.type), { status: 'PENDING', hash: 'h' }),
    getTransaction: async () => ({ status: rpc.Api.GetTransactionStatus.SUCCESS }),
  };
  return { server: server as unknown as rpc.Server, sent };
}

const success = (value: number) => ({
  result: { retval: nativeToScVal(value, { type: 'u32' }), auth: [] },
  transactionData: new SorobanDataBuilder(),
  minResourceFee: '100',
  latestLedger: 1,
  cost: { cpuInsns: '0', memBytes: '0' },
});
// A real restore answer is a normal success whose result is unusable, plus the restore to run first.
const needsRestore = () => ({
  transactionData: new SorobanDataBuilder(),
  minResourceFee: '100',
  latestLedger: 1,
  cost: { cpuInsns: '0', memBytes: '0' },
  restorePreamble: { minResourceFee: '100', transactionData: new SorobanDataBuilder() },
});

describe('RpcChain reads', () => {
  it('restores archived entries a read needs, then answers (instead of returning nothing)', async () => {
    const { server, sent } = stubServer([needsRestore(), success(5)]);
    const chain = new RpcChain(server, CONTRACT, PASSPHRASE, sponsor);
    expect(await chain.groupCount()).toBe(5);
    expect(sent).toEqual(['restoreFootprint']);
  });

  it('does not restore anything when the read just works', async () => {
    const { server, sent } = stubServer([success(3)]);
    expect(await new RpcChain(server, CONTRACT, PASSPHRASE, sponsor).groupCount()).toBe(3);
    expect(sent).toEqual([]);
  });

  it('still reports a failing simulation', async () => {
    const { server } = stubServer([{ error: 'HostError: Error(Contract, #4)', latestLedger: 1 }]);
    await expect(new RpcChain(server, CONTRACT, PASSPHRASE, sponsor).groupCount()).rejects.toThrow('Contract, #4');
  });
});
