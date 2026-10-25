"use client";

import { useMemo, useState } from "react";

import { isForming } from "@/chain/derive";
import { useChainQuery } from "@/chain/hooks";
import { LoadError } from "@/components/onchain/load-error";
import { SegmentedPills } from "@/components/kz/segmented-pills";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { GroupCard } from "./group-card";

/**
 * Test groups kept out of the list (their pages and the shares already in them still work). Empty:
 * the old ones lived on the Solana/EVM deployments this repo no longer serves.
 */
const HIDDEN_GROUP_IDS = new Set<string>([]);

/** Groups with an open spot, filterable by term (number of installments = number of shares). */
export function OpenGroups({ className }: { className?: string }) {
  // The slowest-changing read on the screen.
  const groups = useChainQuery(["groups"], (c) => c.listGroups(), { pollMs: 20_000 });
  const [term, setTerm] = useState<number | "all">("all");

  const open = useMemo(
    () =>
      (groups.data ?? [])
        .filter((g) => isForming(g) && !HIDDEN_GROUP_IDS.has(g.id))
        .sort((a, b) => a.maxMembers - b.maxMembers || a.name.localeCompare(b.name)),
    [groups.data],
  );
  const terms = [...new Set(open.map((g) => g.maxMembers))];
  // A term that no open group has anymore falls back to all of them.
  const active = term !== "all" && terms.includes(term) ? term : "all";
  const visible = active === "all" ? open : open.filter((g) => g.maxMembers === active);
  const loading = groups.loading && !groups.data;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* The term filter's place is kept while loading, so the cards don't move down when it shows. */}
      {loading ? (
        <Skeleton className="h-[68px] rounded-lg" />
      ) : terms.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="label-mono">Term in installments</p>
          <SegmentedPills
            label="Term in installments"
            value={active}
            onChange={setTerm}
            options={[{ value: "all" as const, label: "All" }, ...terms.map((t) => ({ value: t, label: String(t) }))]}
          />
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.error && !groups.data ? (
          <LoadError what="the groups" error={groups.error} className="lg:col-span-2" />
        ) : loading ? (
          Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-51 rounded-lg" />)
        ) : visible.length === 0 ? (
          <Card render={<p />} className="type-body-sm text-secondary">
            {active === "all" ? "No open group right now." : "No open group with this term right now."}
          </Card>
        ) : (
          visible.map((g) => <GroupCard key={g.id} group={g} />)
        )}
      </div>
    </div>
  );
}
