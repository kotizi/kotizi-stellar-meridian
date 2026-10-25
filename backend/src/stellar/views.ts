import { GroupStatus, type RawGroup, type RawWinner } from './chain.js';

const STATUS = { [GroupStatus.Open]: 'Open', [GroupStatus.DrawPending]: 'DrawPending', [GroupStatus.Completed]: 'Completed' } as const;

/** Indexes of the set bits, ascending. */
export function indexesOf(bitmap: bigint): number[] {
  const out: number[] = [];
  for (let i = 0; i < 64; i++) if ((bitmap >> BigInt(i)) & 1n) out.push(i);
  return out;
}

/**
 * A group as the API answers it. Bigints travel as decimal strings, bitmaps as lists of cota indexes
 * (the frontend's `groupStateViewSchema`).
 */
export function toGroupView(
  g: RawGroup,
  winners: RawWinner[],
  ctx: { contractId: string; admin: string; token: string },
) {
  return {
    id: String(g.id),
    address: ctx.contractId,
    organizer: ctx.admin,
    groupId: g.id,
    mint: ctx.token,
    name: g.name,
    uri: g.uri,
    quotaAmount: g.quota.toString(),
    maxMembers: g.maxMembers,
    membersJoined: g.membersJoined,
    periodSecs: g.period.toString(),
    adminFeeBps: g.adminFeeBps,
    round: g.round,
    nextDrawTs: g.nextDrawTs.toString(),
    status: STATUS[g.status as keyof typeof STATUS] ?? 'Open',
    drawSource: 'ledgerHash' as const,
    commitLedger: String(g.commitLedger),
    lastWinnerIndex: g.lastWinnerIndex,
    winners: winners.map((w) => ({
      index: w.index,
      round: w.wonRound,
      prize: w.gross.toString(),
      claimed: (g.unclaimedBitmap >> BigInt(w.index)) % 2n === 0n,
    })),
    unclaimedIndexes: indexesOf(g.unclaimedBitmap),
    unclaimedTotal: g.unclaimedTotal.toString(),
    paidIndexes: indexesOf(g.paidBitmap),
    wonIndexes: indexesOf(g.wonBitmap),
    vault: g.vault.toString(),
  };
}
