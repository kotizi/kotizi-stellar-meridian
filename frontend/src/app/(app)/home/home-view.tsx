"use client";

import Link from "next/link";

import { awaitingInstallment, currentDrawNumber, drawPhase, eligibleBitmap, lastDrawShown, popcount, prizeOf, waitsForNewMembers } from "@/chain/derive";
import { useNow } from "@/chain/hooks";
import { canClaim, installmentsPaid, installmentsTotal, quotaStatus } from "@/chain/share";
import type { MyShare } from "@/chain/use-my-shares";
import { ShareGate, NoShare, useSharesSettled } from "@/components/share/share-gate";
import { ShareJourney } from "@/components/share/share-journey";
import { ShareSwitcher, useSelectedShare } from "@/components/share/share-switcher";
import { PayQuotaButton } from "@/components/share/pay-quota-button";
import { installmentName, installmentOfTotal } from "@/components/share/installment-label";
import { thresholdText } from "@/components/group/draw-threshold";
import { OpenGroups } from "@/components/group/open-groups";
import { Breakpoint } from "@/components/shell/breakpoint";
import { DrawDigits } from "@/components/group/draw-digits";
import { PlanCard } from "@/components/kz/plan-card";
import { SectionTitle } from "@/components/kz/screen";
import { StepItem, type StepState } from "@/components/kz/step-item";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShare, formatShares, formatDateMono, formatDuration, formatNextDraw, formatUsdc, plural } from "@/lib/format";

// Screen 02 · Home (mobile) and W · Web panel (>= 1024px).
export function HomeView() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="type-h3">Hello.</h1>
          <p className="type-body-md text-secondary">Your own home is getting closer.</p>
        </div>
      </header>

      <ShareGate empty={<NoShare message="You don't have a share yet. Pick a group to get started." />}>
        {(shares) => <HomeContent shares={shares} />}
      </ShareGate>

      <Breakpoint show="desktop">
        <HomeOpenGroups />
      </Breakpoint>
    </div>
  );
}

// Shown once the shares above have loaded: rendered earlier, it gets pushed down when they arrive.
function HomeOpenGroups() {
  if (!useSharesSettled()) return null;
  return (
    <section className="hidden flex-col gap-4 lg:flex">
      <SectionTitle>Open groups</SectionTitle>
      <OpenGroups />
    </section>
  );
}

function HomeContent({ shares }: { shares: MyShare[] }) {
  const { current, select } = useSelectedShare(shares);
  if (!current) return null;

  return (
    <div className="flex flex-col gap-4">
      <ShareSwitcher shares={shares} current={current} onSelect={select} />
      <div className="grid gap-4 lg:grid-cols-3">
        <PlanSummary share={current} />
        <div className="lg:hidden">
          <NextSteps share={current} />
        </div>
        <Breakpoint show="desktop">
          <NextQuotaCard share={current} />
        </Breakpoint>
        <DrawCard share={current} />
      </div>
      <section className="flex flex-col gap-1">
        <SectionTitle>Your share&apos;s path</SectionTitle>
        <Card className="mt-1">
          <ShareJourney share={current} />
        </Card>
      </section>
    </div>
  );
}

function PlanSummary({ share }: { share: MyShare }) {
  const paid = installmentsPaid(share);
  const total = installmentsTotal(share);
  // Where the share's installments aren't numbered (EVM), the group's draws show the progress.
  const progress =
    paid === null || total === null
      ? { done: share.group.round, of: share.group.maxMembers, label: `${share.group.round} of ${share.group.maxMembers} draws` }
      : { done: paid, of: total, label: `${paid} of ${total} installments` };
  return (
    <Link href={`/groups/${share.group.id}`} className="focus-ring block rounded-xl">
      <PlanCard
        label={`Your group · ${share.group.name} · share ${formatShare(share.membership.index)}`}
        caption="Installment"
        value={formatUsdc(share.group.quotaAmount)}
        suffix="USD"
        progress={progress.done / progress.of}
        progressLabel={progress.label}
        progressRight={`${Math.round((progress.done / progress.of) * 100)}%`}
        className="h-full"
      />
    </Link>
  );
}

// The 1 s clock is read only in the cards that show time, so the rest of home doesn't re-render every tick.
function NextSteps({ share }: { share: MyShare }) {
  const now = useNow();
  const { group } = share;
  const status = quotaStatus(share);
  const round = currentDrawNumber(group);
  const claim = canClaim(share);
  const phase = drawPhase(group, now);

  const quotaStep: { state: StepState; status: string } =
    status === "paid"
      ? { state: "done", status: "Paid" }
      : status === "due"
        ? { state: "current", status: `Due before the draw · ${formatUsdc(group.quotaAmount)} USD` }
        : status === "drawPending"
          ? { state: "future", status: "Opens after the draw" }
          : { state: "done", status: "Group completed" };

  const drawStep: { state: StepState; status: string } = claim
    ? { state: "current", status: "Contemplated · credit reserved for the property" }
    : phase === "pending"
      ? { state: "current", status: "Drawing now" }
      : phase === "completed"
        ? { state: "done", status: "Every share contemplated" }
        : phase === "waiting"
          ? { state: "future", status: `${formatDateMono(group.nextDrawTs)} · live` }
          : phase === "belowThreshold"
            ? { state: "future", status: thresholdText(group) }
            : { state: "future", status: "Open now" };

  return (
    <section className="flex flex-col">
      <SectionTitle>Next steps</SectionTitle>
      <Card render={<ol />} padding="none" className="mt-1 divide-y divide-subtle px-4">
        <StepItem n={1} state="done" title={`Joined ${group.name}`} status={`Share ${formatShare(share.membership.index)}`} />
        <StepItem n={2} state={quotaStep.state} title={installmentName(share)} status={quotaStep.status} />
        <StepItem n={3} state={drawStep.state} title={`Draw ${round}`} status={drawStep.status} />
      </Card>
    </section>
  );
}

function NextQuotaCard({ share }: { share: MyShare }) {
  const { group } = share;
  const status = quotaStatus(share);
  const { label, badge } = {
    due: { label: "Next installment", badge: <Badge tone="blue">Due before the draw</Badge> },
    paid: { label: installmentName(share), badge: <Badge tone="success">Paid</Badge> },
    drawPending: { label: "Next installment", badge: <Badge>After the draw</Badge> },
    completed: { label: "Group completed", badge: null },
  }[status];

  return (
    <Card render={<section />} radius="xl" className="hidden flex-col gap-3 lg:flex">
      <div className="flex items-start justify-between gap-3">
        <p className="label-mono">{label}</p>
        {badge}
      </div>
      <p className="type-data-lg">
        {formatUsdc(group.quotaAmount)}
        <span className="ml-1.5 type-mono-caption text-tertiary">USD</span>
      </p>
      <p className="type-body-sm text-tertiary">
        {installmentOfTotal(share)}
      </p>
      <div className="mt-auto">
        <PayQuotaButton share={share} size="lg" label="Pay now" />
        {status !== "due" && (
          <Link href="/payments" className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}>
            Payments
          </Link>
        )}
      </div>
    </Card>
  );
}

function DrawCard({ share }: { share: MyShare }) {
  const now = useNow();
  const { group } = share;
  const phase = drawPhase(group, now);
  const claim = canClaim(share);
  const revealed = lastDrawShown(group, phase);
  const eligible = popcount(eligibleBitmap(group));
  // A contemplated share shows its own number while its credit is reserved.
  const shown = claim ? share.membership.index : revealed ? group.lastWinnerIndex : null;
  const text =
    phase === "waiting"
      ? `Draw in ${formatDuration(group.nextDrawTs - now)}`
      : phase === "pending"
        ? "Drawing now"
        : phase === "completed"
          ? "Every share has been contemplated"
          : phase === "noEligible"
            ? waitsForNewMembers(group, now)
              ? "Waiting for new members"
              : `Waiting for ${formatShares(awaitingInstallment(group))} to pay`
            : phase === "belowThreshold"
              ? thresholdText(group)
              : "The draw is open";

  return (
    <Card render={<section />} radius="xl" className="hidden flex-col gap-3 lg:flex">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
        <p className="label-mono">
          Draw {currentDrawNumber(group)} · {formatNextDraw(group.nextDrawTs, now)}
        </p>
        {claim ? (
          <Badge tone="success">Contemplated</Badge>
        ) : (
          <p className="label-mono">{plural(eligible, "eligible share")}</p>
        )}
      </div>
      <DrawDigits share={shown === null ? null : formatShare(shown)} className="[&>div]:text-[44px]" />
      {claim ? (
        <p className="type-data-md">
          {formatUsdc(prizeOf(group, share.membership.index))}
          <span className="ml-1.5 type-mono-caption text-tertiary">USD for the property</span>
        </p>
      ) : (
        <p className="type-body-md">{text}</p>
      )}
      <Link
        href={claim ? `/groups/${group.id}/credit` : "/draws"}
        className={buttonVariants({ variant: "secondary", size: "lg", className: "mt-auto w-full" })}
      >
        {claim ? "See my credit" : "Go to draw"}
      </Link>
    </Card>
  );
}
