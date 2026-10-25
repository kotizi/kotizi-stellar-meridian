"use client";

import { useSyncExternalStore } from "react";

// What an action is doing, shown in the app's one status dialog (`ActionStatusDialog`): the
// checkout's deposit, then the action itself (joining, paying, drawing…), then how it ended.
// `useChainAction` and the checkout write it; nothing here renders.

export type ActionStatus =
  | { phase: "pending"; title: string }
  | { phase: "done"; tone: "success" | "info"; title: string; description?: string }
  | {
      phase: "failed";
      /** `warning` for a limit the user just has to wait out, `neutral` for a confirmation they cancelled. */
      tone: "error" | "warning" | "neutral";
      title: string;
      description: string;
      /** Runs the same action again from the dialog ("Try again"). */
      retry?: () => void;
    };

let current: ActionStatus | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Opens the status dialog on `status`, or moves it there when it's already open. */
export function showActionStatus(status: ActionStatus) {
  current = status;
  listeners.forEach((l) => l());
}

/** Closes the status dialog; an action still running keeps it open. */
export function closeActionStatus() {
  if (current?.phase === "pending") return;
  current = null;
  listeners.forEach((l) => l());
}

/** The status the dialog shows; null while closed. */
export function useActionStatus(): ActionStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
