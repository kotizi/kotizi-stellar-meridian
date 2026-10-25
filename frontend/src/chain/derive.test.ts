import { describe, expect, test } from "bun:test";

import { usdc } from "@/lib/format";

import {
  adminFee,
  awaitingInstallment,
  bitmapOf,
  contemplatedInDraw,
  creditValue,
  creditValueFee,
  currentPool,
  chainDrawPhase,
  drawPhase,
  paidNeeded,
  eligibleBitmap,
  formingRoundPrize,
  fullRoundPrize,
  hasPaid,
  hasWon,
  isForming,
  isUnclaimed,
  netPrize,
  popcount,
  prizeOf,
  quotasLeft,
  waitsForNewMembers,
} from "./derive";
import type { Group } from "./types";

const bitmap = (...indexes: number[]) => bitmapOf(indexes);

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "1",
    address: "contract",
    organizer: "organizer",
    groupId: 1,
    mint: "mint",
    name: "Test",
    quotaAmount: usdc(100),
    maxMembers: 10,
    membersJoined: 10,
    periodSecs: 60,
    adminFeeBps: 200,
    uri: "",
    round: 0,
    nextDrawTs: 1_000,
    paidBitmap: 0n,
    wonBitmap: 0n,
    status: "open",
    drawSource: "drand",
    drawRound: 0n,
    lastWinnerIndex: 0,
    prizes: Array<bigint>(64).fill(0n),
    wonRound: Array<number>(64).fill(0),
    unclaimedBitmap: 0n,
    unclaimedTotal: 0n,
    ...overrides,
  };
}

describe("bitmaps", () => {
  test("popcount counts set bits up to share 63", () => {
    expect(popcount(0n)).toBe(0);
    expect(popcount(bitmap(0, 5, 63))).toBe(3);
  });

  test("eligible shares paid this round and have not won", () => {
    const group = makeGroup({ paidBitmap: bitmap(0, 1, 2, 3), wonBitmap: bitmap(1, 7) });
    expect(eligibleBitmap(group)).toBe(bitmap(0, 2, 3));
    expect(hasPaid(group, 2)).toBe(true);
    expect(hasPaid(group, 7)).toBe(false);
    expect(hasWon(group, 7)).toBe(true);
  });
});

describe("money", () => {
  test("pool is the quota times the shares that paid", () => {
    expect(currentPool(makeGroup({ paidBitmap: bitmap(0, 1, 2) }))).toBe(usdc(300));
  });

  test("admin fee and net prize split the pool like claim_prize", () => {
    expect(adminFee(usdc(1_000), 200)).toBe(usdc(20));
    expect(netPrize(usdc(1_000), 200)).toBe(usdc(980));
    // Integer division rounds the fee down, in the winner's favour.
    expect(adminFee(999n, 150)).toBe(14n);
    expect(netPrize(999n, 150)).toBe(985n);
  });

  test("full-round prize assumes every share paid", () => {
    expect(fullRoundPrize(makeGroup())).toBe(usdc(980));
  });

  test("credit value is quota x shares, with the fee taken at release", () => {
    const group = makeGroup();
    expect(creditValue(group)).toBe(usdc(1_000));
    expect(creditValueFee(group)).toBe(usdc(20));
    expect(creditValue(group) - creditValueFee(group)).toBe(fullRoundPrize(group));
  });

  test("contemplation draw is 1-based and null before winning", () => {
    const wonRound = Array<number>(64).fill(0);
    wonRound[2] = 3;
    const group = makeGroup({ wonRound, wonBitmap: bitmap(2, 5) });
    expect(contemplatedInDraw(group, 2)).toBe(4);
    expect(contemplatedInDraw(group, 5)).toBe(1);
    expect(contemplatedInDraw(group, 1)).toBeNull();
  });

  test("a forming group releases only what its members pay", () => {
    const group = makeGroup({ membersJoined: 4 });
    expect(isForming(group)).toBe(true);
    expect(isForming(makeGroup())).toBe(false);
    expect(formingRoundPrize(group)).toBe(usdc(392));
  });

  test("each share's prize comes from the ledger, net of the fee", () => {
    const prizes = Array<bigint>(64).fill(0n);
    prizes[3] = usdc(1_000);
    const group = makeGroup({ prizes, wonBitmap: bitmap(3), unclaimedBitmap: bitmap(3) });
    expect(prizeOf(group, 3)).toBe(usdc(980));
    expect(prizeOf(group, 4)).toBe(0n);
    expect(isUnclaimed(group, 3)).toBe(true);
    expect(isUnclaimed(group, 4)).toBe(false);
  });
});

describe("quotasLeft", () => {
  test("counts the rounds left, not the quotas paid (late joiners)", () => {
    // 10 rounds (0..9), now in round 4: rounds 4..9 are still due.
    expect(quotasLeft(makeGroup({ maxMembers: 10, round: 4 }), 2)).toBe(6);
    expect(quotasLeft(makeGroup({ maxMembers: 10, round: 4, paidBitmap: bitmap(2) }), 2)).toBe(5);
    expect(quotasLeft(makeGroup({ maxMembers: 10, round: 9, paidBitmap: bitmap(2) }), 2)).toBe(0);
    expect(quotasLeft(makeGroup({ maxMembers: 10, round: 10, status: "completed" }), 2)).toBe(0);
  });
});

describe("chainDrawPhase", () => {
  const paid = bitmap(0, 1);

  test("waiting before the due date", () => {
    expect(chainDrawPhase(makeGroup({ paidBitmap: paid }), 999)).toBe("waiting");
  });

  test("due once the date passes and someone eligible paid", () => {
    expect(chainDrawPhase(makeGroup({ paidBitmap: paid }), 1_000)).toBe("due");
  });

  test("noEligible when nobody who can still win paid", () => {
    expect(chainDrawPhase(makeGroup({ paidBitmap: paid, wonBitmap: paid }), 1_000)).toBe("noEligible");
  });

  test("a due round waits for new members only when every joined share already won", () => {
    // Two members, both drawn: nobody in the group can win until someone new joins.
    const allDrawn = makeGroup({ membersJoined: 2, paidBitmap: bitmap(1), wonBitmap: bitmap(0, 1) });
    expect(waitsForNewMembers(allDrawn, 1_000)).toBe(true);
    expect(waitsForNewMembers(allDrawn, 999)).toBe(false);
    // Share 2 can still win; it just hasn't paid.
    expect(waitsForNewMembers(makeGroup({ membersJoined: 3, wonBitmap: bitmap(0, 1) }), 1_000)).toBe(false);
  });

  test("shares awaiting the installment: joined, not contemplated, not paid", () => {
    const group = makeGroup({ membersJoined: 4, paidBitmap: bitmap(1), wonBitmap: bitmap(0) });
    expect(awaitingInstallment(group)).toEqual([2, 3]);
    expect(awaitingInstallment(makeGroup({ membersJoined: 2, paidBitmap: bitmap(1), wonBitmap: bitmap(0) }))).toEqual([]);
  });

  test("pending after request_draw", () => {
    expect(chainDrawPhase(makeGroup({ status: "drawPending" }), 1_000)).toBe("pending");
  });

  test("an unclaimed prize never blocks the next draw", () => {
    expect(chainDrawPhase(makeGroup({ paidBitmap: paid, wonBitmap: bitmap(5), unclaimedBitmap: bitmap(5) }), 5_000)).toBe("due");
  });

  test("completed after the last draw, claimed or not", () => {
    expect(chainDrawPhase(makeGroup({ status: "completed", unclaimedBitmap: bitmap(2) }), 5_000)).toBe("completed");
    expect(chainDrawPhase(makeGroup({ status: "completed" }), 5_000)).toBe("completed");
  });
});

describe("drawPhase (installment threshold)", () => {
  test("a due draw waits until 80% of the taken shares paid", () => {
    // 10 shares taken: 8 installments needed.
    const seven = makeGroup({ paidBitmap: bitmap(0, 1, 2, 3, 4, 5, 6) });
    expect(drawPhase(seven, 1_000)).toBe("belowThreshold");
    expect(paidNeeded(seven)).toBe(1);
    expect(drawPhase(makeGroup({ paidBitmap: bitmap(0, 1, 2, 3, 4, 5, 6, 7) }), 1_000)).toBe("due");
  });

  test("counts the taken shares, not the group size, and rounds up", () => {
    // 3 of 10 taken: ceil(2.4) = 3 installments.
    const forming = makeGroup({ membersJoined: 3, paidBitmap: bitmap(0, 1) });
    expect(drawPhase(forming, 1_000)).toBe("belowThreshold");
    expect(drawPhase(makeGroup({ membersJoined: 3, paidBitmap: bitmap(0, 1, 2) }), 1_000)).toBe("due");
  });

  test("contemplated shares that keep paying count toward the threshold", () => {
    const group = makeGroup({ membersJoined: 5, paidBitmap: bitmap(0, 1, 2, 3), wonBitmap: bitmap(0) });
    expect(drawPhase(group, 1_000)).toBe("due");
  });

  test("other phases are unchanged", () => {
    const few = { membersJoined: 10, paidBitmap: bitmap(0) };
    expect(drawPhase(makeGroup(few), 999)).toBe("waiting");
    expect(drawPhase(makeGroup({ ...few, status: "drawPending" }), 1_000)).toBe("pending");
    expect(drawPhase(makeGroup({ ...few, wonBitmap: bitmap(0) }), 1_000)).toBe("noEligible");
  });
});
