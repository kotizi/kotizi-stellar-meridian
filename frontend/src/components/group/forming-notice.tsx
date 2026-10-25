import type { Group } from "@/chain";
import { formingRoundPrize, isForming } from "@/chain/derive";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatUsdc } from "@/lib/format";

/**
 * Says why a draw can release less than the credit value: the program draws before the group is
 * full and pays what was collected that round. Renders nothing once every share is taken.
 */
export function FormingNotice({ group, className }: { group: Group; className?: string }) {
  if (!isForming(group)) return null;
  return (
    <Card render={<section />} padding="md" className={className}>
      <div className="flex flex-col gap-2">
        <Badge tone="warning" className="self-start">
          Group forming · {group.membersJoined}/{group.maxMembers} shares
        </Badge>
        <p className="type-body-sm text-secondary">
          Draws run while the group fills, and each one releases what was collected that round. With the shares taken
          today, a draw releases up to{" "}
          <span className="font-mono text-primary">{formatUsdc(formingRoundPrize(group), { decimals: 0 })} USD</span>.
          Shares that miss an installment lower it too.
        </p>
      </div>
    </Card>
  );
}
