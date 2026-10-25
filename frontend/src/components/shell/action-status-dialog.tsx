"use client";

import { CircleCheck, CircleMinus, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { closeActionStatus, useActionStatus, type ActionStatus } from "@/chain/action-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ICONS: Record<string, ReactNode> = {
  pending: <LoaderCircle className="size-6 animate-spin text-brand" />,
  success: <CircleCheck className="size-6 text-success" />,
  info: <Info className="size-6 text-info" />,
  error: <TriangleAlert className="size-6 text-error" />,
  warning: <TriangleAlert className="size-6 text-warning" />,
  neutral: <CircleMinus className="size-6 text-tertiary" />,
};

/**
 * The app's one status dialog: every action's progress and how it ended (the checkout's deposit,
 * joining, paying, drawing, creating a group), and any action's failure. Mounted once, in the app's
 * providers; `useChainAction` and the checkout drive it (`chain/action-status.ts`). While an action
 * runs it can't be closed.
 */
export function ActionStatusDialog() {
  const status = useActionStatus();
  const closeRef = useRef<HTMLButtonElement>(null);
  const pending = status?.phase === "pending";

  return (
    <Dialog open={status !== null} onOpenChange={(open) => !open && closeActionStatus()}>
      <DialogContent
        initialFocus={pending ? undefined : closeRef}
        showCloseButton={!pending}
        className="gap-5 p-6 sm:max-w-md"
      >
        {status && <StatusBody status={status} closeRef={closeRef} />}
      </DialogContent>
    </Dialog>
  );
}

function StatusBody({ status, closeRef }: { status: ActionStatus; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const icon = ICONS[status.phase === "pending" ? "pending" : status.tone];
  const description =
    status.phase === "pending" ? "This takes a few seconds. You can keep this window open." : status.description;

  return (
    <>
      <div className="flex flex-col items-center gap-3 px-2 py-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-raised">{icon}</span>
        <DialogTitle className="type-h5">{status.title}</DialogTitle>
        {description && <DialogDescription className="type-body-sm text-secondary">{description}</DialogDescription>}
      </div>

      {status.phase === "done" && (
        <Button ref={closeRef} variant="primary" size="lg" onClick={closeActionStatus}>
          Done
        </Button>
      )}

      {status.phase === "failed" && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            ref={closeRef}
            variant={status.retry ? "secondary" : "primary"}
            size="lg"
            className={cn(status.retry && "sm:flex-1")}
            onClick={closeActionStatus}
          >
            Close
          </Button>
          {status.retry && (
            <Button variant="primary" size="lg" className="sm:flex-1" onClick={status.retry}>
              Try again
            </Button>
          )}
        </div>
      )}
    </>
  );
}
