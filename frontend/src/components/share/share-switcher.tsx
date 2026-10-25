"use client";

import { useSyncExternalStore } from "react";

import type { MyShare } from "@/chain/use-my-shares";
import { formatShare } from "@/lib/format";
import { Chip } from "@/components/kz/chip";

const key = (c: MyShare) => c.membership.id;

// The selected share is shared by every screen (home, payments, draws) and kept for the tab's
// session, so picking a share on one screen keeps it on the next. Storage can be unavailable
// (private mode, blocked site data): the selection then lasts until the page reloads.
const STORAGE_KEY = "kotizi:selected-share";
const listeners = new Set<() => void>();
let selected: string | null | undefined;

function readSelected() {
  if (selected === undefined) {
    try {
      selected = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      selected = null;
    }
  }
  return selected;
}

/** Selects a share (by membership id) on every screen. */
export function selectShare(membership: string) {
  selected = membership;
  try {
    sessionStorage.setItem(STORAGE_KEY, membership);
  } catch {
    // Kept in memory only.
  }
  listeners.forEach((l) => l());
}

/** Forgets the selection (sign out: the next account has other shares). */
export function clearSelectedShare() {
  selected = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The selected share, shared across screens; defaults to the first one. */
export function useSelectedShare(shares: MyShare[] | undefined) {
  const current = useSyncExternalStore(subscribe, readSelected, () => null);
  return { current: shares?.find((c) => key(c) === current) ?? shares?.[0] ?? null, select: selectShare };
}

/** Pills to switch between the user's shares. Hidden when there is only one. */
export function ShareSwitcher({
  shares,
  current,
  onSelect,
}: {
  shares: MyShare[];
  current: MyShare | null;
  onSelect: (membership: string) => void;
}) {
  if (shares.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Your shares" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
      {shares.map((c) => {
        const active = current && key(c) === key(current);
        return (
          <Chip key={key(c)} size="sm" selected={!!active} onClick={() => onSelect(key(c))}>
            {c.group.name} · <span className="font-mono">{formatShare(c.membership.index)}</span>
          </Chip>
        );
      })}
    </div>
  );
}
