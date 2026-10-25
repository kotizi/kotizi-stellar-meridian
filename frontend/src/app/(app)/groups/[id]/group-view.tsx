"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { creditValue, creditValueFee, currentDrawNumber, fullRoundPrize } from "@/chain/derive";
import { useGroup } from "@/chain/use-group";
import { selectShare } from "@/components/share/share-switcher";
import { ShareGrid } from "@/components/group/share-grid";
import { DrawPhaseBadge } from "@/components/group/draw-phase";
import { FormingNotice } from "@/components/group/forming-notice";
import { GroupLoading, GroupNotFound } from "@/components/group/group-state";
import { LoadError } from "@/components/onchain/load-error";
import { OnchainDetails } from "@/components/onchain/onchain-details";
import { PlanCard } from "@/components/kz/plan-card";
import { ReferenceNote, ScreenTitle } from "@/components/kz/screen";
import { SurfaceList, SurfaceRow } from "@/components/kz/surface-list";
import { TxLink } from "@/components/onchain/tx-link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShare, formatPeriod, formatUsdc, plural } from "@/lib/format";

// Screen 04 · Group detail.
export function GroupView({ id }: { id: string }) {
  const { data, loading, error, mine } = useGroup(id);

  if (loading && !data) return <GroupLoading />;
  if (error && !data) return <LoadError what="this group" error={error} />;
  if (!data) return <GroupNotFound />;

  const { group, metadata } = data;
  const spots = group.maxMembers - group.membersJoined;
  const full = spots === 0;
  const member = mine.length > 0;
  const fee = group.adminFeeBps / 100;
  const credit = formatUsdc(creditValue(group), { decimals: 0 });

  const rules = [
    {
      title: `You pay ${group.maxMembers} installments of ${formatUsdc(group.quotaAmount)} USD`,
      body: `One installment ${formatPeriod(group.periodSecs)} into the group vault, before each draw, until the last one`,
    },
    {
      title: `One draw ${formatPeriod(group.periodSecs)}`,
      body: "Each draw contemplates one share among those that paid, with verifiable randomness. Every share is contemplated once.",
    },
    {
      title: `The contemplated share gets the ${credit} USD credit value for the property`,
      body: `Minus the ${fee}% admin fee, it stays in the group vault and is sent to the company responsible for the property. Contemplated shares keep paying until the last installment.`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <ScreenTitle
          eyebrow={`Group · ${group.name}`}
          title={`${group.maxMembers}-installment group`}
          caption={metadata ? `${metadata.location} · ${metadata.description}` : "No down payment. No fine print."}
        />
        <DrawPhaseBadge group={group} className="mt-1 hidden sm:inline-flex" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          <PlanCard
            label="Credit value"
            value={credit}
            suffix="USD"
            progress={group.round / group.maxMembers}
            progressLabel={`${group.maxMembers} installments`}
            progressRight={`Draw ${currentDrawNumber(group)} of ${group.maxMembers}`}
          />

          <FormingNotice group={group} />

          <Card render={<ol />} padding="none" className="divide-y divide-subtle px-4">
            {rules.map((rule, i) => (
              <li key={i} className="flex gap-4 py-4">
                <span className="type-mono-caption text-brand">0{i + 1}</span>
                <div className="flex flex-col gap-1">
                  <span className="type-label-lg">{rule.title}</span>
                  <span className="type-body-sm text-tertiary">{rule.body}</span>
                </div>
              </li>
            ))}
          </Card>

          <Card render={<section />} padding="md" className="flex flex-col gap-4">
            <p className="label-mono">Shares</p>
            <ShareGrid group={group} mine={mine} />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <SurfaceList>
            {metadata && (
              <SurfaceRow label="Property value" value={`${formatUsdc(metadata.propertyValue, { decimals: 0 })} USD`} />
            )}
            <SurfaceRow label="Credit value" value={`${credit} USD`} />
            <SurfaceRow
              label="Installments"
              value={`${group.maxMembers} × ${formatUsdc(group.quotaAmount)} USD, ${formatPeriod(group.periodSecs)}`}
            />
            <SurfaceRow label="Admin fee" value={`${fee}% · ${formatUsdc(creditValueFee(group))} USD`} />
            <SurfaceRow label="Credit for the property" value={`${formatUsdc(fullRoundPrize(group))} USD`} />
            <SurfaceRow
              label="Members"
              value={
                <span className="inline-flex items-center gap-2">
                  {group.membersJoined}/{group.maxMembers}
                  <Badge tone={full ? "neutral" : "blue"}>{full ? "Full" : plural(spots, "open spot")}</Badge>
                </span>
              }
            />
          </SurfaceList>
          <OnchainDetails>
            <SurfaceRow label="Group contract" value={<TxLink value={group.address} kind="address" />} />
          </OnchainDetails>

          {member && (
            <Card render={<p />} padding="md" className="type-body-sm text-secondary">
              You hold share{mine.length > 1 ? "s" : ""}{" "}
              <span className="font-mono text-primary">{mine.map((m) => formatShare(m.index)).join(", ")}</span> in this
              group.
            </Card>
          )}

          {member && (
            <Link
              href="/home"
              onClick={() => selectShare(mine[0].id)}
              className={buttonVariants({ variant: "primary", size: "xl" })}
            >
              Go to my share <ArrowRight />
            </Link>
          )}
          {!full && (
            <Link
              href={`/groups/${group.id}/join`}
              className={buttonVariants({ variant: member ? "secondary" : "primary", size: "xl" })}
            >
              {member ? "Take another share" : "Join this group"} <ArrowRight />
            </Link>
          )}
          {full && !member && (
            <Button variant="primary" size="xl" disabled>
              Group is full
            </Button>
          )}
          <ReferenceNote />
        </div>
      </div>
    </div>
  );
}
