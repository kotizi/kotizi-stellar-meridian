import type { Group, Membership } from "@/chain";
import { hasPaid, hasWon } from "@/chain/derive";
import { formatShare } from "@/lib/format";
import { cn } from "@/lib/utils";

type ShareState = "won" | "paid" | "unpaid" | "free";

const STYLES: Record<ShareState, string> = {
  won: "bg-lavender text-inverse",
  paid: "bg-brand text-on-brand",
  // Taken but not paid: filled, so it never reads as the open spot next to it.
  unpaid: "border border-default bg-control text-secondary",
  free: "border border-dashed border-strong text-tertiary",
};

const LEGEND: { state: ShareState; label: string }[] = [
  { state: "paid", label: "Paid this installment" },
  { state: "unpaid", label: "Not paid yet" },
  { state: "won", label: "Contemplated" },
  { state: "free", label: "Available" },
];

function shareState(group: Group, index: number): ShareState {
  if (index >= group.membersJoined) return "free";
  if (hasWon(group, index)) return "won";
  return hasPaid(group, index) ? "paid" : "unpaid";
}

export function ShareGrid({ group, mine }: { group: Group; mine: Membership[] }) {
  const mineIndexes = new Set(mine.map((m) => m.index));

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {Array.from({ length: group.maxMembers }, (_, index) => {
          const state = shareState(group, index);
          const isMine = mineIndexes.has(index);
          return (
            <li
              key={index}
              title={`Share ${formatShare(index)}${isMine ? " (yours)" : ""}`}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md type-mono-overline",
                STYLES[state],
                isMine && "ring-2 ring-inverse ring-offset-2 ring-offset-(--bg-surface)",
              )}
            >
              {formatShare(index)}
            </li>
          );
        })}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 type-label-sm text-tertiary">
        {LEGEND.map(({ state, label }) => (
          <li key={state} className="flex items-center gap-1.5">
            <span className={cn("size-4 rounded-sm", STYLES[state])} />
            {label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-4 rounded-sm ring-2 ring-inverse" />
          Yours
        </li>
      </ul>
    </div>
  );
}
