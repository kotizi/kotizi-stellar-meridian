"use client";

import { Dices } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { DrawIdleReason } from "@/chain";
import { awaitingInstallment, currentDrawNumber, currentPool, DRAW_THRESHOLD_PCT, drawPhase, eligibleBitmap, lastDrawShown, paidNeeded, popcount, prizeOf, waitsForNewMembers } from "@/chain/derive";
import { drawUntilSettled, type DrawOutcome } from "@/chain/draw";
import { useChainAction, useNow } from "@/chain/hooks";
import { canClaim } from "@/chain/share";
import type { MyShare } from "@/chain/use-my-shares";
import { ShareGate, NoShare } from "@/components/share/share-gate";
import { ShareSwitcher, useSelectedShare } from "@/components/share/share-switcher";
import { DrawThreshold } from "@/components/group/draw-threshold";
import { DrawDigits } from "@/components/group/draw-digits";
import { Luz } from "@/components/kz/luz";
import { OnchainDetails } from "@/components/onchain/onchain-details";
import { ReferenceNote } from "@/components/kz/screen";
import { SurfaceList, SurfaceRow } from "@/components/kz/surface-list";
import { TxLink } from "@/components/onchain/tx-link";
import { VidroK } from "@/components/kz/vidro-k";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatShare, formatShares, formatDateMono, formatDuration, formatUsdc, plural } from "@/lib/format";
import { useSession } from "@/session/context";

const IDLE_MESSAGES: Record<DrawIdleReason, string> = {
  notDue: "The draw isn't due yet",
  noEligibleShares: "No eligible share has paid this installment yet",
  waitingForRandomness: "The random number isn't ready yet. Try again in a few seconds",
  completed: "This group is complete",
  belowThreshold: `The draw opens once ${DRAW_THRESHOLD_PCT}% of the shares pay this installment`,
};

const drawMessage = (outcome: DrawOutcome) =>
  outcome.settled
    ? "Share contemplated"
    : outcome.requested
      ? "Draw started. The contemplated share appears in a few seconds"
      : IDLE_MESSAGES[outcome.reason];

/** Where the randomness comes from, in plain words. */
const randomnessSource = () => "Hash of a future ledger (commit-reveal)";

// Screen 07 · Draw of the selected share's group.
export function DrawsView() {
  return (
    <ShareGate
      empty={
        <div className="flex flex-col gap-6">
          <h1 className="type-h3">Draws</h1>
          <NoShare message="Join a group to take part in its draws." />
        </div>
      }
    >
      {(shares) => <Draw shares={shares} />}
    </ShareGate>
  );
}

function Draw({ shares }: { shares: MyShare[] }) {
  const { current, select } = useSelectedShare(shares);
  const now = useNow();
  const { address: wallet } = useSession();
  const { run, pending } = useChainAction();
  // Settle transaction of a draw run in this session (the proof link).
  const [proof, setProof] = useState<{ group: string; round: number; signature: string } | null>(null);
  if (!current) return null;

  const { group, membership } = current;
  const phase = drawPhase(group, now);
  const claim = canClaim(current);
  const round = currentDrawNumber(group);
  const revealed = lastDrawShown(group, phase);
  const drawnBefore = popcount(group.wonBitmap);
  const newMembers = waitsForNewMembers(group, now);

  const title = claim
    ? "You were contemplated."
    : phase === "waiting"
      ? `Draw in ${formatDuration(group.nextDrawTs - now)}`
      : phase === "pending"
        ? "Drawing…"
        : phase === "completed"
          ? "Every share was contemplated."
          : phase === "noEligible"
            ? newMembers
              ? "Waiting for new members"
              : "Waiting for installments"
            : phase === "belowThreshold"
              ? "Waiting for installments"
              : "The draw is open";
  const sub = claim
    ? `The ${formatUsdc(prizeOf(group, membership.index))} USD credit of share ${formatShare(membership.index)} is reserved for the property.`
    : phase === "waiting"
      ? `${formatDateMono(group.nextDrawTs)}, live and verifiable.`
      : phase === "pending"
        ? "The draw is locked in. Revealing the contemplated share."
        : phase === "noEligible"
          ? newMembers
            ? "Every share in the group has been contemplated. The next draw waits for a new member to join and pay."
            : `Waiting for ${formatShares(awaitingInstallment(group))} to pay this installment.`
          : phase === "completed"
            ? "This group is complete."
            : phase === "belowThreshold"
              ? `The draw opens once ${DRAW_THRESHOLD_PCT}% of the shares pay this installment: ${plural(paidNeeded(group), "more installment")} needed.`
              : "It runs on its own, or anyone can start it now. Shares that paid and weren't contemplated yet take part.";

  const draw = async () => {
    const outcome = await run("draw", (c) => drawUntilSettled(c, group.id), {
      pending: phase === "pending" ? "Revealing the contemplated share…" : "Drawing…",
      success: drawMessage,
    });
    if (outcome?.settled && outcome.signature) {
      setProof({ group: group.id, round: group.round + 1, signature: outcome.signature });
    }
  };
  const proofHere = proof && proof.group === group.id && proof.round === group.round ? proof : null;

  return (
    <div className="relative isolate flex flex-col gap-6">
      <Luz className="-z-20 top-[180px]" style={{ opacity: revealed ? 0.9 : 0.35 }} />
      <VidroK className="absolute -top-6 -right-28 -z-10 w-[170px] lg:-right-16" stroke="rgba(255,255,255,0.35)" fill="rgba(182,182,240,0.08)" />

      <header className="flex flex-col gap-2">
        <p className="label-mono">
          Draw {round} · {group.name}
        </p>
        <h1 className="type-h3">{title}</h1>
        <p className="max-w-xl type-body-md text-secondary">{sub}</p>
      </header>
      <ShareSwitcher shares={shares} current={current} onSelect={select} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-3">
          <p className="label-mono">Contemplated share</p>
          <DrawDigits share={revealed ? formatShare(group.lastWinnerIndex) : null} />
          {!revealed && phase !== "pending" && group.round > 0 && (
            <p className="label-mono">Last contemplated: share {formatShare(group.lastWinnerIndex)}</p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <SurfaceList className="bg-surface/90">
            <SurfaceRow
              label={revealed ? "Credit reserved" : "Collected for this draw"}
              value={`${formatUsdc(revealed ? prizeOf(group, group.lastWinnerIndex) : currentPool(group))} USD`}
            />
            <SurfaceRow label="Installments paid" value={`${popcount(group.paidBitmap)}/${group.membersJoined}`} />
            <SurfaceRow
              label="Shares in the draw"
              value={`${popcount(eligibleBitmap(group))} · ${drawnBefore} already contemplated`}
            />
          </SurfaceList>
          {(phase === "waiting" || phase === "belowThreshold" || phase === "due") && (
            <DrawThreshold group={group} className="px-1" />
          )}
          <OnchainDetails>
            <SurfaceRow
              label="Randomness proof"
              value={
                proofHere ? (
                  <TxLink value={proofHere.signature} />
                ) : phase === "pending" ? (
                  `${randomnessSource()} · ledger ${group.commitLedger}`
                ) : (
                  <span className="text-tertiary">{revealed ? randomnessSource() : "Waiting"}</span>
                )
              }
            />
          </OnchainDetails>

          {claim && (
            <Link
              href={`/groups/${group.id}/credit`}
              className={buttonVariants({ variant: "secondary", size: "xl" })}
            >
              See my credit
            </Link>
          )}
          {(phase === "due" || phase === "pending") && (
            <Button
              variant="primary"
              size="xl"
              disabled={!wallet || pending !== null}
              onClick={draw}
            >
              <Dices /> {pending === "draw" ? "Drawing…" : "Draw now"}
            </Button>
          )}
          <ReferenceNote />
        </div>
      </div>
    </div>
  );
}
