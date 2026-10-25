import { describe, expect, test } from "bun:test";

import { usdc } from "@/lib/format";

import { canClaim, currentInstallment, installmentsPaid, installmentsTotal, quotaStatus } from "./share";
import type { Group, Membership } from "./types";

// Draw 3 of 5 is next (round 2); share 0 hasn't paid it yet.
const group = { round: 2, maxMembers: 5, quotaAmount: usdc(100), paidBitmap: 0n, wonBitmap: 0n, unclaimedBitmap: 0n, status: "open" } as Group;
const share = (totalPaid: bigint | null, overrides: Partial<Group> = {}) => ({
  group: { ...group, ...overrides },
  membership: { index: 0, totalPaid } as Membership,
});

describe("installment numbering", () => {
  test("numbers the share's own installments from what it paid", () => {
    // Joined at draw 2: one paid, this one is its second.
    expect(installmentsPaid(share(usdc(100)))).toBe(1);
    expect(currentInstallment(share(usdc(100)))).toBe(2);
    expect(installmentsTotal(share(usdc(100)))).toBe(4);
  });

  test("a paid installment keeps its number until the next draw", () => {
    expect(currentInstallment(share(usdc(200), { paidBitmap: 1n }))).toBe(2);
  });

  test("is unknown where the network doesn't keep the total (EVM)", () => {
    expect(installmentsPaid(share(null))).toBeNull();
    expect(installmentsTotal(share(null))).toBeNull();
    expect(currentInstallment(share(null))).toBeNull();
  });
});

describe("quotaStatus", () => {
  test("follows the group's status, then whether the share paid this round", () => {
    expect(quotaStatus(share(null))).toBe("due");
    expect(quotaStatus(share(null, { paidBitmap: 1n }))).toBe("paid");
    expect(quotaStatus(share(null, { status: "drawPending" }))).toBe("drawPending");
    expect(quotaStatus(share(null, { status: "completed", paidBitmap: 1n }))).toBe("completed");
  });
});

describe("canClaim", () => {
  test("only a drawn share whose prize is still in the vault", () => {
    expect(canClaim(share(null))).toBe(false);
    expect(canClaim(share(null, { unclaimedBitmap: 1n }))).toBe(true);
  });
});
