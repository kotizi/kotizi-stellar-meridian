// The drand "quicknet" clock the contract's draws follow (`contract/kotizi/src/drand.rs` and
// `types.rs`). `request_draw` fixes a round that doesn't exist yet; `settle_draw` needs its beacon,
// which the contract verifies itself, so nobody knows or steers the winner in advance.

/** quicknet's chain hash: where its beacons are served (`<relay>/<hash>/public/<round>`). */
export const QUICKNET_HASH = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
/** When round 1 was published (unix seconds). */
export const QUICKNET_GENESIS = 1_692_803_367;
/** Seconds between rounds. */
export const QUICKNET_PERIOD = 3;
/** Rounds between a draw's request and the round that decides it (30 s). */
export const DRAW_ROUND_DELAY = 10;
/** Seconds after its round before a pending draw may be requested again (drand down). */
export const DRAW_EXPIRY_SECS = 3_600;

/** When the beacon of `round` (≥ 1) is published, in unix seconds. */
export function roundTime(round: number): number {
  return QUICKNET_GENESIS + (round - 1) * QUICKNET_PERIOD;
}

/** The round `delay` rounds after the one running at `timestamp`: what `request_draw` stores. */
export function roundAfter(timestamp: number, delay: number): number {
  return Math.floor((timestamp - QUICKNET_GENESIS) / QUICKNET_PERIOD) + 1 + delay;
}

/** The public JSON of a round's beacon on drand's own relay (randomness and signature). */
export function beaconUrl(round: number): string {
  return `https://api.drand.sh/${QUICKNET_HASH}/public/${round}`;
}
