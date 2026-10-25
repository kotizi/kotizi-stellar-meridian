"use client";

import Link from "next/link";
import { useState } from "react";

import { currentDrawNumber } from "@/chain/derive";
import { quotaStatus, type QuotaStatus } from "@/chain/share";
import type { MyShare } from "@/chain/use-my-shares";
import { ShareGate, NoShare } from "@/components/share/share-gate";
import { ShareSwitcher, useSelectedShare } from "@/components/share/share-switcher";
import { PayQuotaButton } from "@/components/share/pay-quota-button";
import { installmentOfTotal } from "@/components/share/installment-label";
import { DEPOSIT_METHODS, type DepositMethod } from "@/components/checkout/deposit-methods";
import { OnchainDetails } from "@/components/onchain/onchain-details";
import { ReferenceNote, ScreenTitle } from "@/components/kz/screen";
import { NetworkFeeRow } from "@/components/checkout/network-fee-row";
import { SurfaceList, SurfaceRow } from "@/components/kz/surface-list";
import { TxLink } from "@/components/onchain/tx-link";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShare, formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_BADGES: Record<QuotaStatus, { label: string } & Pick<BadgeProps, "tone" | "variant">> = {
  due: { label: "Due before the draw", tone: "blue" },
  // Solid white: the paid card is blue (card-plano).
  paid: { label: "Paid", tone: "neutral", variant: "solid" },
  drawPending: { label: "Draw in progress", tone: "neutral" },
  completed: { label: "Group completed", tone: "neutral" },
};

// Screen 06 · Installment payment (pay_quota). Pix, autopay and history are out of scope for now.
export function PaymentsView() {
  return (
    <ShareGate
      empty={
        <div className="flex flex-col gap-6">
          <ScreenTitle eyebrow="Payments" title="No installments yet" />
          <NoShare message="Join a group to start paying your installments." />
        </div>
      }
    >
      {(shares) => <Payments shares={shares} />}
    </ShareGate>
  );
}

function Payments({ shares }: { shares: MyShare[] }) {
  const { current, select } = useSelectedShare(shares);
  // Receipt of a payment made in this session, keyed by membership + round.
  const [receipt, setReceipt] = useState<{ key: string; signature: string; method: DepositMethod | null } | null>(null);
  if (!current) return null;

  const { group, membership } = current;
  const status = quotaStatus(current);
  const receiptKey = `${membership.id}:${group.round}`;
  const paid = status === "paid";
  const statusBadge = STATUS_BADGES[status];

  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle
        eyebrow={`Payments · ${group.name} · share ${formatShare(membership.index)}`}
        title={installmentOfTotal(current)}
      />
      <ShareSwitcher shares={shares} current={current} onSelect={select} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card render={<section />} variant={paid ? "plano" : "surface"} radius="xl">
            <div className="flex items-start justify-between gap-3">
              <p className={cn("label-mono", paid && "text-on-brand/90")}>
                Draw {currentDrawNumber(group)} of {group.maxMembers}
              </p>
              <Badge tone={statusBadge.tone} variant={statusBadge.variant}>
                {statusBadge.label}
              </Badge>
            </div>
            <p className="mt-8 type-data-lg">
              {formatUsdc(group.quotaAmount)}
              <span className={cn("ml-2 type-mono-caption", paid ? "text-on-brand/85" : "text-tertiary")}>
                USD
              </span>
            </p>
            <p className={cn("mt-2 type-body-sm", paid ? "text-on-brand" : "text-tertiary")}>Goes to the group vault</p>
          </Card>

          {paid ? (
            <>
              <SurfaceList>
                {receipt?.key === receiptKey && receipt.method && (
                  <SurfaceRow label="Paid with" value={DEPOSIT_METHODS[receipt.method].label} />
                )}
                <SurfaceRow label="Status" value={<Badge tone="success">Confirmed</Badge>} />
              </SurfaceList>
              {receipt?.key === receiptKey && (
                <OnchainDetails>
                  <SurfaceRow label="Transaction" value={<TxLink value={receipt.signature} />} />
                </OnchainDetails>
              )}
            </>
          ) : (
            <SurfaceList>
              <SurfaceRow label="Pay with" value="Bank transfer, Pix or crypto" />
              <NetworkFeeRow />
            </SurfaceList>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {status === "due" ? (
            <PayQuotaButton share={current} onPaid={(paid) => setReceipt({ key: receiptKey, ...paid })} />
          ) : (
            <Card render={<p />} padding="md" className="type-body-sm text-secondary">
              {status === "paid"
                ? "You're up to date. The next installment opens after this draw."
                : status === "drawPending"
                  ? "Payments reopen as soon as the draw is settled."
                  : "This group has finished. No more installments are due."}
            </Card>
          )}
          <Link href="/home" className={buttonVariants({ variant: "secondary", size: "xl" })}>
            Back to home
          </Link>
          <ReferenceNote />
        </div>
      </div>
    </div>
  );
}
