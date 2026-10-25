// Testnet end-to-end journey against a running API (AUTH_MODE=dev): onboarding, gasless join + pay for
// every cota, draw (commit then reveal by the keeper) and claim. Members are throwaway keys that live
// only in this process. Usage: GROUP_ID=1 MEMBERS=2 tsx scripts/journey.ts  (API_URL default :3001)
import { Keypair } from '@stellar/stellar-sdk';

const API = process.env.API_URL ?? 'http://localhost:3001';
const groupId = Number(process.env.GROUP_ID ?? 0);
const members = Array.from({ length: Number(process.env.MEMBERS ?? 2) }, () => Keypair.random());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(who: Keypair, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer dev:${who.publicKey()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json as any;
}

async function gasless(who: Keypair, fn: string, index?: number) {
  const prep = await call(who, '/v1/tx/prepare', { fn, groupId, index });
  const signatures = prep.payloads.map((p: { payload: string }) =>
    Buffer.from(who.sign(Buffer.from(p.payload, 'hex'))).toString('hex'),
  );
  const out = await call(who, '/v1/tx/relay', { transaction: prep.transaction, validUntilLedger: prep.validUntilLedger, signatures });
  console.log(fn, index ?? '', 'ok', out.txHash);
}

for (const m of members) {
  console.log('member', m.publicKey());
  console.log(' kyc', (await call(m, '/v1/kyc', {})).status, '| faucet', (await call(m, '/v1/faucet', {})).amount);
}
for (const m of members) await gasless(m, 'join_group');
for (const [i, m] of members.entries()) await gasless(m, 'pay_quota', i);

const g = await call(members[0]!, `/v1/groups/${groupId}`);
const wait = Number(g.nextDrawTs) * 1000 - Date.now();
if (wait > 0) await sleep(wait + 2000);
for (let i = 0; i < 20; i++) {
  const r = await call(members[0]!, `/v1/groups/${groupId}/draw`, {});
  console.log('draw', JSON.stringify(r));
  if (r.action === 'settle') break;
  await sleep(8000);
}
const after = await call(members[0]!, `/v1/groups/${groupId}`);
console.log('winners', JSON.stringify(after.winners), 'status', after.status);
const idx = after.winners[0].index as number;
await gasless(members[idx]!, 'claim_prize', idx);
const fin = await call(members[0]!, `/v1/groups/${groupId}`);
console.log('final vault', fin.vault, 'unclaimed', fin.unclaimedTotal, 'round', fin.round);
