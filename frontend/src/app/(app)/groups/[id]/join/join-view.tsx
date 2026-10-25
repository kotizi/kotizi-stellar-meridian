"use client";

import Link from "next/link";
import { useState } from "react";

import { creditValue, creditValueFee } from "@/chain/derive";
import { useChainAction, useNow } from "@/chain/hooks";
import { useGroup } from "@/chain/use-group";
import { FormingNotice } from "@/components/group/forming-notice";
import { GroupLoading, GroupNotFound } from "@/components/group/group-state";
import { LoadError } from "@/components/onchain/load-error";
import { GlassSheet } from "@/components/kz/glass-sheet";
import { Luz } from "@/components/kz/luz";
import { OnchainDetails } from "@/components/onchain/onchain-details";
import { ReferenceNote, ScreenTitle } from "@/components/kz/screen";
import { CheckoutDialog } from "@/components/checkout/checkout-dialog";
import { NetworkFeeRow } from "@/components/checkout/network-fee-row";
import { SurfaceList, SurfaceRow } from "@/components/kz/surface-list";
import { TxLink } from "@/components/onchain/tx-link";
import { AppIcon, KSeal } from "@/components/kz/vidro-k";
import { useWalletState } from "@/chain/use-account";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatShare, formatNextDraw, formatPeriod, formatUsdc } from "@/lib/format";
import { useSession } from "@/session/context";
import { selectShare } from "@/components/share/share-switcher";

// Screen 05 · Join a group: review, accept the rules, sign (join_group + first pay_quota, the 1st installment).
export function JoinView({ id }: { id: string }) {
  const session = useSession();
  const { data, loading, error } = useGroup(id);
  const { kycApproved } = useWalletState();
  const { run, pending } = useChainAction();
  const [accepted, setAccepted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [joined, setJoined] = useState<{ share: string; signature: string } | null>(null);
  const now = useNow();

  if (loading && !data) return <GroupLoading />;
  if (error && !data) return <LoadError what="this group" error={error} />;
  if (!data) return <GroupNotFound />;
  const { group } = data;

  if (joined) {
    return (
      <div className="flex flex-1 flex-col items-start gap-6 pt-6">
        <AppIcon />
        <div className="flex flex-col gap-2">
          <h1 className="type-h3">You&apos;re in the group.</h1>
          <p className="type-body-md text-secondary">
            Your share is <span className="font-mono text-primary">{joined.share}</span> of group {group.name}.
          </p>
        </div>
        <OnchainDetails className="w-full">
          <SurfaceRow label="Transaction" value={<TxLink value={joined.signature} />} />
        </OnchainDetails>
        <Link href="/home" className={buttonVariants({ variant: "primary", size: "xl", className: "w-full" })}>
          Go to home
        </Link>
      </div>
    );
  }

  const full = group.membersJoined >= group.maxMembers;
  // pay_quota only runs while the group is open; during a draw the first quota waits for the next round.
  const payNow = group.status === "open";
  const signedIn = session.status === "signedIn" && session.address;
  const installments = `${group.maxMembers} × ${formatUsdc(group.quotaAmount)} USD, ${formatPeriod(group.periodSecs)}`;
  const canSign = signedIn && accepted && kycApproved === true && !full && pending === null;

  const sign = async () => {
    if (!session.address) return;
    const owner = session.address;
    const share = formatShare(group.membersJoined);
    const result = await run("join", (c) => c.joinGroup({ owner, group: group.id, payFirstQuota: payNow }), {
      pending: "Joining the group…",
      success: `You took share ${share}`,
    });
    if (result) {
      selectShare(result.membership); // home opens on the new share
      setJoined({ share, signature: result.signature });
    }
  };

  const hint = !signedIn
    ? "Sign in to continue"
    : full
      ? "This group is full"
      : kycApproved === false
        ? "Identity verification required before joining"
        : !accepted
            ? "Accept the group rules to continue"
            : session.mode === "privy"
              ? "Secured by Privy · no password needed"
              : "Demo mode · no real payment";

  return (
    <div className="relative isolate flex flex-col gap-6">
      <Luz className="-z-10 opacity-40 lg:hidden" />
      <ScreenTitle eyebrow="Join group" title="Confirm your entry" caption="Review the details before confirming." />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="flex flex-col gap-4">
          <SurfaceList>
            <SurfaceRow label="Group" value={group.name} />
            <SurfaceRow label="Credit value" value={`${formatUsdc(creditValue(group), { decimals: 0 })} USD`} />
            <SurfaceRow label="Installments" value={installments} />
            <SurfaceRow
              label="Admin fee"
              value={`${group.adminFeeBps / 100}% · ${formatUsdc(creditValueFee(group))} USD, from the credit`}
            />
            <SurfaceRow label="Next draw" value={formatNextDraw(group.nextDrawTs, now)} />
            <SurfaceRow label="Your share" value={full ? "—" : formatShare(group.membersJoined)} />
          </SurfaceList>

          <FormingNotice group={group} />

          <Card render={<label />} padding="md" className="flex cursor-pointer items-start gap-3">
            <Checkbox checked={accepted} onCheckedChange={setAccepted} className="mt-0.5" />
            <span className="type-body-md text-secondary">
              I have read and accept the group rules, and I understand that one installment is due before every draw
              until the last one, including after my share is contemplated.
            </span>
          </Card>

          {signedIn && kycApproved === false && (
            <Card padding="md" className="flex flex-col gap-3">
              <p className="type-body-sm text-secondary">Identity verification is required before joining a group.</p>
              <Link
                href={`/verify?next=${encodeURIComponent(`/groups/${id}/join`)}`}
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                Verify identity
              </Link>
            </Card>
          )}
        </div>

        <GlassSheet>
          <div className="flex items-center gap-2.5">
            <KSeal className="w-[22px]" />
            <span className="type-label-lg">First payment</span>
          </div>
          <SurfaceList plain>
            <SurfaceRow
              label={payNow ? "1st installment now" : "1st installment"}
              value={payNow ? `${formatUsdc(group.quotaAmount)} USD` : "after the current draw"}
            />
            <NetworkFeeRow />
          </SurfaceList>
          {signedIn ? (
            <Button variant="primary" size="xl" disabled={!canSign} onClick={() => setConfirming(true)}>
              {pending === "join" ? "Confirming…" : "Join group"}
            </Button>
          ) : (
            <Button variant="primary" size="xl" onClick={() => session.login()} disabled={session.status === "loading"}>
              Sign in
            </Button>
          )}
          <p className="label-mono text-center">{hint}</p>
        </GlassSheet>
        <CheckoutDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Join ${group.name}`}
          amount={payNow ? group.quotaAmount : 0n}
          details={[
            { label: "Your share", value: formatShare(group.membersJoined) },
            { label: "Installments", value: installments },
            { label: "1st installment", value: payNow ? "now" : "after the current draw" },
          ]}
          confirmLabel="Confirm and join"
          onConfirm={() => void sign()}
        />
      </div>
      <ReferenceNote />
    </div>
  );
}
