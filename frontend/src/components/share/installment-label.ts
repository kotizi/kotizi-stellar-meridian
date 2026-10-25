import { currentDrawNumber } from "@/chain/derive";
import { currentInstallment, installmentsTotal, type ShareRef } from "@/chain/share";

// How a share's installment is named on screen. Where the network doesn't keep the share's paid
// total (EVM) its numbering is unknown, so the copy names the draw instead.

/** "Installment 3", or "Installment for draw 4" when the share's numbering is unknown. */
export function installmentName(share: ShareRef) {
  const current = currentInstallment(share);
  return current === null ? `Installment for draw ${currentDrawNumber(share.group)}` : `Installment ${current}`;
}

/** "Installment 3 of 5", or "Installment for draw 4" when the share's numbering is unknown. */
export function installmentOfTotal(share: ShareRef) {
  const current = currentInstallment(share);
  const total = installmentsTotal(share);
  return current === null || total === null ? installmentName(share) : `Installment ${current} of ${total}`;
}
