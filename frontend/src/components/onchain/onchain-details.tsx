import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { network } from "@/chain/network";
import { SurfaceRow } from "@/components/kz/surface-list";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Collapsed panel for blockchain details (network, transactions, contract, randomness proof). Keeps the
 * main UI free of crypto jargon while the proof stays one click away.
 */
export function OnchainDetails({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card render={<details />} padding="none" className={cn("group", className)}>
      <summary className="focus-ring flex min-h-11 cursor-pointer list-none rounded-lg items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
        <span className="label-mono">On-chain details</span>
        <ChevronDown aria-hidden className="size-4 text-tertiary transition-transform group-open:rotate-180" />
      </summary>
      <dl className="divide-y divide-subtle border-t border-subtle px-4">
        <SurfaceRow label="Network" value={network.name} />
        {children}
      </dl>
    </Card>
  );
}
