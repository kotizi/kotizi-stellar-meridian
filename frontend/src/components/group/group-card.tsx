import Link from "next/link";

import type { Group } from "@/chain";
import { creditValue, isForming } from "@/chain/derive";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatPeriod, formatUsdc, plural } from "@/lib/format";

import { DrawPhaseBadge } from "./draw-phase";

/** Open-group card: credit value, installment, occupancy and open spots. */
export function GroupCard({ group }: { group: Group }) {
  const spots = group.maxMembers - group.membersJoined;

  return (
    <Card interactive render={<Link href={`/groups/${group.id}`} />} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="label-mono">
          {group.name} · {group.maxMembers} installments
        </p>
        <DrawPhaseBadge group={group} />
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="type-body-sm text-tertiary">Credit value</p>
          <p className="type-data-md">
            {formatUsdc(creditValue(group), { decimals: 0 })}
            <span className="ml-1.5 type-mono-caption text-tertiary">USD</span>
          </p>
          {isForming(group) && <p className="label-mono">once the group is full</p>}
        </div>
        <div className="text-right">
          <p className="type-body-sm text-tertiary">Installment</p>
          <p className="type-data-sm">{formatUsdc(group.quotaAmount, { decimals: 0 })} USD</p>
          <p className="label-mono">{formatPeriod(group.periodSecs)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Progress value={(group.membersJoined / group.maxMembers) * 100} aria-label="Members joined" />
        <div className="flex items-center justify-between">
          <span className="label-mono">
            {group.membersJoined}/{group.maxMembers} members
          </span>
          <Badge tone={spots > 0 ? "blue" : "neutral"}>{spots > 0 ? plural(spots, "open spot") : "Full"}</Badge>
        </div>
      </div>
    </Card>
  );
}
