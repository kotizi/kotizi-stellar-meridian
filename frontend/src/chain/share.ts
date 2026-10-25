import { hasPaid, isUnclaimed, quotasLeft } from "./derive";
import type { Group, Membership } from "./types";

// Rules about one share (a membership in its group), on top of the program's rules in `derive.ts`.

/** A share and its group: what every rule here needs. */
export interface ShareRef {
  group: Group;
  membership: Membership;
}

export type QuotaStatus = "due" | "paid" | "drawPending" | "completed";

/** Payment state of the share for the current round (pay_quota needs the group to be Open). */
export function quotaStatus({ group, membership }: ShareRef): QuotaStatus {
  if (group.status === "completed") return "completed";
  if (group.status === "drawPending") return "drawPending";
  return hasPaid(group, membership.index) ? "paid" : "due";
}

/** True while this share has a prize to receive: it was drawn (in any round) and hasn't claimed. */
export function canClaim({ group, membership }: ShareRef) {
  return isUnclaimed(group, membership.index);
}

// Installments are numbered per share (a late joiner's first one is "Installment 1"), from what the
// share has paid. Where the network doesn't keep that total (`totalPaid: null`, EVM) the numbers are
// unknown (null).

/** Installments this share has paid so far (each payment is one quota); null when unknown. */
export const installmentsPaid = ({ membership, group }: ShareRef) =>
  membership.totalPaid === null ? null : Number(membership.totalPaid / group.quotaAmount);

/** Installments this share pays in all: a share that joined after the first draw owes fewer than the group has draws. */
export function installmentsTotal(share: ShareRef) {
  const paid = installmentsPaid(share);
  return paid === null ? null : paid + quotasLeft(share.group, share.membership.index);
}

/** This share's own number for the current draw's installment (not the draw number), capped at the total. */
export function currentInstallment(share: ShareRef) {
  const paid = installmentsPaid(share);
  const total = installmentsTotal(share);
  if (paid === null || total === null) return null;
  return Math.min(paid + (hasPaid(share.group, share.membership.index) ? 0 : 1), total);
}
