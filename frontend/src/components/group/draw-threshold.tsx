import type { Group } from "@/chain";
import { DRAW_THRESHOLD_PCT, paidCount, paidNeeded, paidRequired } from "@/chain/derive";
import { Progress } from "@/components/ui/progress";
import { plural } from "@/lib/format";

/** "N more installments to open the draw", or that it's open. */
export const thresholdText = (group: Group) => {
  const needed = paidNeeded(group);
  return needed > 0 ? `${plural(needed, "more installment")} to open the draw` : "Enough installments to draw";
};

/**
 * Installments paid this period against what opens the draw (DRAW_THRESHOLD_PCT of the taken shares).
 */
export function DrawThreshold({ group, className }: { group: Group; className?: string }) {
  const required = paidRequired(group);
  const paid = paidCount(group);
  return (
    <Progress value={required === 0 ? 0 : Math.min(100, (paid / required) * 100)} size="sm" className={className}>
      <div className="flex w-full flex-wrap justify-between gap-x-3 gap-y-1">
        <span className="label-mono">
          {paid} of {group.membersJoined} paid · draw at {DRAW_THRESHOLD_PCT}%
        </span>
        <span className="type-body-sm text-secondary">{thresholdText(group)}</span>
      </div>
    </Progress>
  );
}
