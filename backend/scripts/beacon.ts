// Prints the drand quicknet signature of a round in the 96-byte uncompressed form `settle_draw` takes,
// after verifying it locally against the pinned quicknet key.
// Usage: tsx scripts/beacon.ts <round>      e.g.  --signature "$(tsx scripts/beacon.ts 1000000)"
import { DrandBeacons } from '../src/drand.js';

const round = process.argv[2];
if (!round || !/^\d+$/.test(round)) {
  console.error('usage: tsx scripts/beacon.ts <round>');
  process.exit(2);
}
const signature = await new DrandBeacons(process.env.DRAND_URL).signature(BigInt(round));
if (!signature) {
  console.error(`round ${round} is not published yet`);
  process.exit(1);
}
console.log(Buffer.from(signature).toString('hex'));
