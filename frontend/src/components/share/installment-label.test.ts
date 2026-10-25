import { describe, expect, test } from "bun:test";

import type { Group, Membership } from "@/chain/types";
import { usdc } from "@/lib/format";

import { installmentName, installmentOfTotal } from "./installment-label";

// Draw 3 of 5 is next (round 2); share 0 hasn't paid it yet.
const group = { round: 2, maxMembers: 5, quotaAmount: usdc(100), paidBitmap: 0n, wonBitmap: 0n, status: "open" } as Group;
const share = (totalPaid: bigint | null) => ({ group, membership: { index: 0, totalPaid } as Membership });

describe("installment labels", () => {
  test("number the share's own installments", () => {
    expect(installmentName(share(usdc(100)))).toBe("Installment 2");
    expect(installmentOfTotal(share(usdc(100)))).toBe("Installment 2 of 4");
  });

  test("name the draw where the network doesn't keep the total (EVM)", () => {
    expect(installmentName(share(null))).toBe("Installment for draw 3");
    expect(installmentOfTotal(share(null))).toBe("Installment for draw 3");
  });
});
