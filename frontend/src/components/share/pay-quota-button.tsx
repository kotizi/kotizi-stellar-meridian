"use client";

import { useState } from "react";

import { useChainAction } from "@/chain/hooks";
import { quotaStatus } from "@/chain/share";
import type { MyShare } from "@/chain/use-my-shares";
import { CheckoutDialog } from "@/components/checkout/checkout-dialog";
import type { DepositMethod } from "@/components/checkout/deposit-methods";
import { Button } from "@/components/ui/button";
import { formatShare, formatUsdc } from "@/lib/format";
import { useSession } from "@/session/context";

import { installmentName } from "./installment-label";

/**
 * Pays this round's quota for the share through the checkout (the money comes in with the payment).
 * Reports the signature and the method used so screens can show a receipt.
 */
export function PayQuotaButton({
  share,
  onPaid,
  size = "xl",
  label,
}: {
  share: MyShare;
  onPaid?: (receipt: { signature: string; method: DepositMethod | null }) => void;
  size?: "xl" | "lg";
  label?: string;
}) {
  const { address } = useSession();
  const { run, pending } = useChainAction();
  const [checkingOut, setCheckingOut] = useState(false);
  const { group, membership } = share;
  const status = quotaStatus(share);

  const pay = async (method: DepositMethod | null) => {
    if (!address) return;
    const result = await run("pay", (c) => c.payQuota({ owner: address, membership: membership.id }), {
      pending: "Paying installment…",
      success: `${installmentName(share)} paid`,
      failure: "Payment not completed",
    });
    if (result) onPaid?.({ signature: result.signature, method });
  };

  if (status !== "due") return null;

  return (
    <div className="flex flex-col">
      <Button
        variant="primary"
        size={size}
        disabled={!address || pending !== null}
        onClick={() => setCheckingOut(true)}
      >
        {pending === "pay" ? "Confirming…" : (label ?? `Pay ${formatUsdc(group.quotaAmount)} USD`)}
      </Button>
      <CheckoutDialog
        open={checkingOut}
        onOpenChange={setCheckingOut}
        title={`Pay ${installmentName(share).toLowerCase()}`}
        amount={group.quotaAmount}
        details={[
          { label: "Group", value: group.name },
          { label: "Share", value: formatShare(membership.index) },
        ]}
        confirmLabel="Confirm payment"
        onConfirm={pay}
      />
    </div>
  );
}
