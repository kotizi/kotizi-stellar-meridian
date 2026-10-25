"use client";

import { ArrowLeft, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { KotiziError } from "@/chain/errors";
import { errorMessage, invalidateChain } from "@/chain/hooks";
import { useTestHelpers } from "@/chain/use-test-helpers";
import { DEPOSIT_METHODS, MethodDetails, type DepositMethod } from "@/components/checkout/deposit-methods";
import { NetworkFeeRow } from "@/components/checkout/network-fee-row";
import { SurfaceList, SurfaceRow } from "@/components/kz/surface-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession } from "@/session/context";

type Step =
  | { name: "review" }
  | { name: "method"; method: DepositMethod }
  | { name: "depositing"; method: DepositMethod }
  | { name: "error"; method: DepositMethod; error: unknown };

/**
 * The checkout of every payment (joining a group, paying an installment). The app keeps no balance,
 * so the money comes in here: the user reviews what they pay, picks how (bank transfer, Pix or
 * crypto), sees that method's instructions and confirms. The deposit lands on the network of what
 * is being paid, only for what the account's wallet there lacks, and `onConfirm` then runs the
 * payment itself. Cancel holds the initial focus, so a stray Enter or double click never pays.
 *
 * Without a deposit to make (nothing to pay now, or a network without test helpers) it is a plain
 * confirmation.
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  title,
  amount,
  details,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  amount: bigint;
  details: { label: string; value: ReactNode }[];
  confirmLabel: string;
  /** Runs the payment once the money is in; `method` is null when there was nothing to deposit. */
  onConfirm: (method: DepositMethod | null) => void;
}) {
  const { address } = useSession();
  const testing = useTestHelpers();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<Step>({ name: "review" });
  const depositShortfall = amount > 0n ? testing?.depositShortfall : undefined;
  const depositing = step.name === "depositing";

  const changeOpen = (next: boolean) => {
    if (depositing) return; // the deposit is on its way; its result shows here
    onOpenChange(next);
    if (!next) setStep({ name: "review" });
  };

  const confirm = (method: DepositMethod | null) => {
    changeOpen(false);
    onConfirm(method);
  };

  const deposit = async (method: DepositMethod) => {
    if (!depositShortfall || !address) return;
    setStep({ name: "depositing", method });
    try {
      await depositShortfall({ owner: address, amount });
    } catch (error) {
      console.warn("[kotizi] checkout deposit failed", error);
      setStep({ name: "error", method, error });
      return;
    } finally {
      invalidateChain();
    }
    confirm(method);
  };

  const id = useId();

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent initialFocus={cancelRef} showCloseButton={!depositing} className="gap-5 p-6 sm:max-w-md">
        {step.name === "review" && (
          <>
            <Header title={title} description="Check the details. Nothing is paid until you confirm." />
            <Amount amount={amount} />
            <SurfaceList>
              {details.map((d) => (
                <SurfaceRow key={d.label} label={d.label} value={d.value} />
              ))}
              <NetworkFeeRow />
            </SurfaceList>
            {depositShortfall ? (
              <>
                <div className="flex flex-col gap-2">
                  <span id={id} className="label-mono">Pay with</span>
                  <ul aria-labelledby={id} className="flex flex-col gap-2">
                    {(Object.keys(DEPOSIT_METHODS) as DepositMethod[]).map((method) => {
                      const { icon: Icon, label, hint } = DEPOSIT_METHODS[method];
                      return (
                        <li key={method}>
                          <button
                            type="button"
                            onClick={() => setStep({ name: "method", method })}
                            className="focus-ring flex w-full items-center gap-3 rounded-md border border-default px-4 py-3 text-left transition-colors hover:bg-hover"
                          >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-brand-subtle text-brand">
                              <Icon className="size-5" />
                            </span>
                            <span className="flex flex-1 flex-col">
                              <span className="type-label-lg text-primary">{label}</span>
                              <span className="type-body-sm text-tertiary">{hint}</span>
                            </span>
                            <ChevronRight className="size-4 text-tertiary" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <DialogClose render={<Button ref={cancelRef} variant="secondary" size="lg" />}>Cancel</DialogClose>
              </>
            ) : (
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <DialogClose render={<Button ref={cancelRef} variant="secondary" size="lg" className="sm:flex-1" />}>
                  Cancel
                </DialogClose>
                <Button variant="primary" size="lg" className="sm:flex-1" onClick={() => confirm(null)}>
                  {confirmLabel}
                </Button>
              </div>
            )}
          </>
        )}

        {step.name === "method" && (
          <>
            <div className="flex flex-col gap-3 pr-8">
              <BackButton onClick={() => setStep({ name: "review" })} />
              <Header title={DEPOSIT_METHODS[step.method].label} description={DEPOSIT_METHODS[step.method].description} />
            </div>
            <Amount amount={amount} />
            <MethodDetails method={step.method} seed={address ?? "kotizi"} />
            <SurfaceList>
              <SurfaceRow label="Deposit fee" value={<Badge tone="success">Free</Badge>} />
              <NetworkFeeRow />
            </SurfaceList>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" size="lg" className="sm:flex-1" onClick={() => setStep({ name: "review" })}>
                Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="sm:flex-1"
                disabled={!address}
                onClick={() => void deposit(step.method)}
              >
                {confirmLabel}
              </Button>
            </div>
          </>
        )}

        {depositing && (
          <Result
            icon={<LoaderCircle className="size-6 animate-spin text-brand" />}
            title="Confirming your payment…"
            description="This takes a few seconds. You can keep this window open."
          />
        )}

        {step.name === "error" && (
          <DepositError
            error={step.error}
            onRetry={() => setStep({ name: "method", method: step.method })}
            onClose={() => changeOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Header({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1.5 pr-8">
      <DialogTitle className="type-h5">{title}</DialogTitle>
      <DialogDescription className="type-body-sm text-secondary">{description}</DialogDescription>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring -ml-1 flex w-fit items-center gap-1 rounded-xs px-1 type-body-sm text-secondary hover:text-primary"
    >
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}

function Amount({ amount }: { amount: bigint }) {
  return (
    <p className="type-data-lg">
      {formatUsdc(amount)}
      <span className="ml-1.5 type-mono-caption text-tertiary">USD</span>
    </p>
  );
}

function Result({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-raised">{icon}</span>
      <DialogTitle className="type-h5">{title}</DialogTitle>
      <DialogDescription className="type-body-sm text-secondary">{description}</DialogDescription>
    </div>
  );
}

function DepositError({ error, onRetry, onClose }: { error: unknown; onRetry: () => void; onClose: () => void }) {
  const limited = error instanceof KotiziError && error.code === "FaucetLimit";
  return (
    <>
      <Result
        icon={<TriangleAlert className={cn("size-6", limited ? "text-warning" : "text-error")} />}
        title={limited ? "Deposit limit reached" : "Payment not completed"}
        description={limited ? `${errorMessage(error)}. Try again tomorrow.` : errorMessage(error)}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant={limited ? "primary" : "secondary"} size="lg" className="sm:flex-1" onClick={onClose}>
          Close
        </Button>
        {!limited && (
          <Button variant="primary" size="lg" className="sm:flex-1" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </>
  );
}
