"use client";

import { errorMessage, invalidateChain } from "@/chain/hooks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A read that failed and has nothing cached to show. Retry refetches every query. */
export function LoadError({ what, error, className }: { what: string; error: unknown; className?: string }) {
  return (
    <Card role="alert" className={cn("flex flex-col items-start gap-4", className)}>
      <div className="flex flex-col gap-1">
        <p className="type-body-md text-primary">Couldn&apos;t load {what}.</p>
        <p className="type-body-sm text-secondary">{errorMessage(error)}</p>
      </div>
      <Button variant="primary" size="lg" onClick={invalidateChain}>
        Try again
      </Button>
    </Card>
  );
}
