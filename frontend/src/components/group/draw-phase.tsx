"use client";

import type { Group } from "@/chain";
import { drawPhase, waitsForNewMembers, type DrawPhase } from "@/chain/derive";
import { useNow } from "@/chain/hooks";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const LABELS: Record<DrawPhase, string> = {
  waiting: "Next draw",
  due: "Draw due",
  noEligible: "Waiting for payments",
  belowThreshold: "Waiting for payments",
  pending: "Drawing",
  completed: "Completed",
};

const TONES: Record<DrawPhase, Pick<BadgeProps, "tone" | "variant">> = {
  waiting: { tone: "neutral" },
  due: { tone: "blue", variant: "solid" },
  noEligible: { tone: "warning" },
  belowThreshold: { tone: "warning" },
  pending: { tone: "blue", variant: "solid" },
  completed: { tone: "neutral" },
};

/** Draw phase with a live countdown; it ticks on its own so the screen around it doesn't re-render. */
export function DrawPhaseBadge({ group, className }: { group: Group; className?: string }) {
  const now = useNow();
  const phase = drawPhase(group, now);
  const label =
    phase === "waiting"
      ? `${LABELS.waiting} in ${formatDuration(group.nextDrawTs - now)}`
      : waitsForNewMembers(group, now)
        ? "Waiting for members"
        : LABELS[phase];

  return (
    <Badge {...TONES[phase]} className={cn("shrink-0", className)}>
      {label}
    </Badge>
  );
}
