"use client";

import Link from "next/link";
import { adminFee, contemplatedInDraw, creditValue, grossPrize, hasWon, isUnclaimed, prizeOf, quotasLeft } from "@/chain/derive";
import { useGroup } from "@/chain/use-group";
import { GroupLoading, GroupNotFound } from "@/components/group/group-state";
import { LoadError } from "@/components/onchain/load-error";
import { PlanCard } from "@/components/kz/plan-card";
import { ReferenceNote } from "@/components/kz/screen";
import { SurfaceList, SurfaceRow } from "@/components/kz/surface-list";
import { Timeline } from "@/components/kz/timeline";
import { VidroK } from "@/components/kz/vidro-k";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShare, formatUsdc } from "@/lib/format";
import { useSession } from "@/session/context";

// Screen 08 · Credit for the contemplated share. The credit stays in the group vault for the company
// responsible for the property: the UI never calls claim_prize (that would pay the member).
export function CreditView({ id }: { id: string }) {
  const { address: wallet } = useSession();
  const { data, loading, error, mine } = useGroup(id);

  if (loading && !data) return <GroupLoading />;
  if (error && !data) return <LoadError what="this group" error={error} />;
  if (!data) return <GroupNotFound />;
  const { group } = data;

  // A share with a reserved credit comes first (any round); otherwise one claimed before the credit was reserved.
  const share = mine.find((m) => isUnclaimed(group, m.index)) ?? mine.find((m) => hasWon(group, m.index));

  if (!share || !wallet) {
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="type-h3">No credit yet</h1>
        <p className="type-body-md text-secondary">None of your shares in {group.name} has been contemplated yet.</p>
        <Link href="/draws" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Go to draws
        </Link>
      </div>
    );
  }

  const reserved = isUnclaimed(group, share.index);
  // The ledger keeps each share's prize after a claim, so an older claimed share shows its amount too.
  const amount = prizeOf(group, share.index);
  const remaining = quotasLeft(group, share.index);
  const gross = grossPrize(group, share.index);
  const fullCredit = creditValue(group);
  const draw = contemplatedInDraw(group, share.index);

  return (
    <div className="flex flex-col gap-6">
      <p className="label-mono">{reserved ? "Credit reserved" : "Receipt"}</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          <PlanCard
            label={`${reserved ? "Credit reserved" : "Credit received"} · share ${formatShare(share.index)}`}
            value={formatUsdc(amount)}
            suffix="USD"
          >
            <p className="mt-6 type-body-md">
              {reserved
                ? "Your credit stays in the group vault and will be sent to the company responsible for the property."
                : "Your own home, no down payment."}
            </p>
            <VidroK className="absolute -right-10 -bottom-20 -z-10 w-36" />
          </PlanCard>

          <Card render={<section />} className="flex flex-col gap-4">
            <p className="label-mono">Path of the credit</p>
            <Timeline
              steps={[
                {
                  title: `Share ${formatShare(share.index)} contemplated`,
                  detail: `${group.name} draw ${draw} of ${group.maxMembers}, publicly verifiable`,
                  done: true,
                },
                reserved
                  ? {
                      title: "Reserved in the group vault",
                      detail: "Held by the group's rules, not by any person",
                      done: true,
                    }
                  : {
                      title: "Released from the group vault",
                      detail: "Received before credits were reserved for the property",
                      done: true,
                    },
                {
                  title: "Sent to the company responsible for the property",
                  detail: "The credit goes to the property, never to a personal balance",
                  done: false,
                },
              ]}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SurfaceList>
            <SurfaceRow label="Credit value" value={`${formatUsdc(fullCredit)} USD`} />
            <SurfaceRow label={`Collected in draw ${draw}`} value={`${formatUsdc(gross)} USD`} />
            <SurfaceRow
              label={`Admin fee · ${group.adminFeeBps / 100}%`}
              value={`−${formatUsdc(adminFee(gross, group.adminFeeBps))} USD`}
            />
            <SurfaceRow
              label={reserved ? "Credit for the property" : "You received"}
              value={`${formatUsdc(amount)} USD`}
            />
          </SurfaceList>
          {gross < fullCredit && (
            <p className="type-body-sm text-tertiary">
              This draw collected less than the credit value: the group was still forming or some shares missed the
              installment.
            </p>
          )}
          <Card render={<section />} padding="md" className="flex flex-col gap-2">
            <Badge tone={remaining > 0 ? "info" : "success"} className="self-start">
              {remaining > 0 ? "Installments continue" : "All installments paid"}
            </Badge>
            <p className="type-body-sm text-secondary">
              {remaining > 0 ? (
                <>
                  <span className="font-mono text-primary">
                    {remaining} × {formatUsdc(group.quotaAmount)} USD
                  </span>{" "}
                  left, one before each draw until draw {group.maxMembers}. Contemplated shares keep paying so every member
                  gets their credit.
                </>
              ) : (
                "Your share has no installments left in this group."
              )}
            </p>
          </Card>
          <Link href="/home" className={buttonVariants({ variant: "secondary", size: "xl" })}>
            Back to home
          </Link>
          <ReferenceNote />
        </div>
      </div>
    </div>
  );
}
