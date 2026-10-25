import { contemplatedInDraw, currentDrawNumber, hasPaid, isUnclaimed, quotasLeft } from "@/chain/derive";
import { installmentsPaid, installmentsTotal } from "@/chain/share";
import type { MyShare } from "@/chain/use-my-shares";
import { Timeline } from "@/components/kz/timeline";
import { formatShare, formatUsdc, plural } from "@/lib/format";

/**
 * The share's path through the consórcio, from the current state: joined, installments paid,
 * contemplation, installments left and the end of the term. No per-installment history yet (it
 * needs the backend to index the program's events).
 */
export function ShareJourney({ share }: { share: MyShare }) {
  const { group, membership } = share;
  const paid = installmentsPaid(share);
  const left = quotasLeft(group, membership.index);
  const draw = contemplatedInDraw(group, membership.index);
  const completed = group.status === "completed";

  return (
    <Timeline
      steps={[
        { title: `Joined ${group.name}`, detail: `Share ${formatShare(membership.index)}`, done: true },
        paid === null || membership.totalPaid === null
          ? {
              // Only the current draw's payment is known on this network.
              title: `Installment for draw ${currentDrawNumber(group)} ${hasPaid(group, membership.index) ? "paid" : "due"}`,
              detail: "Earlier installments aren't listed yet",
              done: hasPaid(group, membership.index),
            }
          : {
              title: `${paid} of ${installmentsTotal(share)} installments paid`,
              detail: `${formatUsdc(membership.totalPaid)} USD paid so far`,
              done: paid > 0,
            },
        draw
          ? {
              title: `Contemplated in draw ${draw}`,
              detail: isUnclaimed(group, membership.index) ? "Credit reserved for the property" : "Credit received",
              done: true,
            }
          : {
              title: "Waiting to be contemplated",
              detail: "Each draw contemplates one share among those that paid the installment",
              done: false,
            },
        left > 0
          ? {
              title: `${plural(left, "installment")} left`,
              detail: `${formatUsdc(group.quotaAmount * BigInt(left))} USD, one before each draw${draw ? ", also after contemplation" : ""}`,
              done: false,
            }
          : { title: "All installments paid", done: true },
        {
          title: `Group ends after draw ${group.maxMembers}`,
          detail: completed
            ? "Every share has been contemplated"
            : `Draw ${currentDrawNumber(group)} of ${group.maxMembers} is next`,
          done: completed,
        },
      ]}
    />
  );
}
