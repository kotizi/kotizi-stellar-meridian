"use client";

import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";

import { sameValue } from "@/lib/same-value";

import { showActionStatus, type ActionStatus } from "./action-status";
import { KotiziError } from "./errors";
import type { KotiziClient } from "./index";
import { useKotiziClient } from "./provider";

// Tiny query layer: every read refetches when any action finishes and on a polling interval
// (10 s by default: a signed-in screen reads every network, and the backend allows 120 requests a
// minute per IP).
// Queries are identified by a key; components asking for the same key share one request, so a
// screen with several readers of e.g. the balance hits the RPC once per round of polling: polls
// tick on wall-clock multiples of their interval, so readers that mounted at different times
// still ask together. An answer equal to the last one keeps the old object (no re-render).

let version = 0;
const listeners = new Set<() => void>();

export function invalidateChain() {
  version++;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Serializable parts that identify a read, e.g. `["balance", address]`. */
type QueryKey = readonly (string | number | boolean | null)[];

/** A request finished this recently is reused instead of refetched (readers ticking together). */
const DEDUPE_MS = 1_000;
/** A key nobody has read for this long is dropped from the cache. */
const EVICT_MS = 5 * 60_000;

interface Entry {
  client: KotiziClient;
  version: number;
  promise: Promise<unknown>;
  /** Null while in flight. */
  settledAt: number | null;
  failed: boolean;
  /** Last successful result for this key and client, kept for readers that mount later. */
  data: { value: unknown } | null;
}

const cache = new Map<string, Entry>();
const readers = new Map<string, number>();

/** Counts a reader of `key`; the returned release drops the key's cache once nobody reads it for `EVICT_MS`. */
function retain(key: string) {
  readers.set(key, (readers.get(key) ?? 0) + 1);
  return () => {
    const left = (readers.get(key) ?? 1) - 1;
    if (left > 0) return void readers.set(key, left);
    readers.delete(key);
    setTimeout(() => readers.has(key) || cache.delete(key), EVICT_MS);
  };
}

/** Time until the next wall-clock multiple of `ms`. */
const untilNextTick = (ms: number) => ms - (Date.now() % ms);

/** Drops every cached answer and refetches (sign out: nothing of the last account is shown). */
export function resetChainCache() {
  cache.clear();
  invalidateChain();
}

function fetchShared<T>(key: string, client: KotiziClient, fetcher: (client: KotiziClient) => Promise<T>): Promise<T> {
  const prev = cache.get(key);
  const sameRound = prev && prev.client === client && prev.version === version;
  // Failures are never reused, so the next poll (or a retry) asks again.
  const reusable = prev && (prev.settledAt === null || (!prev.failed && Date.now() - prev.settledAt < DEDUPE_MS));
  if (sameRound && reusable) {
    return prev.promise as Promise<T>;
  }
  const data = prev?.client === client ? prev.data : null;
  const promise = fetcher(client).then(
    (value) => {
      const kept = data && sameValue(data.value, value) ? (data.value as T) : value;
      entry.settledAt = Date.now();
      entry.data = { value: kept };
      return kept;
    },
    (error: unknown) => {
      entry.settledAt = Date.now();
      entry.failed = true;
      throw error;
    },
  );
  const entry: Entry = { client, version, promise, settledAt: null, failed: false, data };
  cache.set(key, entry);
  return promise;
}

function cachedData<T>(key: string, client: KotiziClient): T | undefined {
  const entry = cache.get(key);
  return entry?.client === client ? (entry.data?.value as T | undefined) : undefined;
}

/**
 * Reads from the chain client. `fetcher: null` disables the query (e.g. signed out). The fetcher
 * must depend only on what is in `key`: readers with the same key share its result. `pollWhile`
 * stops polling once an answer fails it (e.g. a group that doesn't exist); actions still refetch.
 */
export function useChainQuery<T>(
  key: QueryKey,
  fetcher: ((client: KotiziClient) => Promise<T>) | null,
  { pollMs = 10_000, pollWhile }: { pollMs?: number; pollWhile?: (data: T) => boolean } = {},
) {
  const client = useKotiziClient();
  const keyId = JSON.stringify(key);
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  const [state, setState] = useState<{ keyId: string; data: T | undefined; error: unknown } | null>(null);
  const [tick, setTick] = useState(0);
  const enabled = fetcher !== null;
  const load = useEffectEvent((client: KotiziClient) => (fetcher ? fetchShared(keyId, client, fetcher) : undefined));

  const keepPolling = useEffectEvent(
    () => !pollWhile || state?.keyId !== keyId || state.error !== null || pollWhile(state.data as T),
  );

  useEffect(() => (enabled ? retain(keyId) : undefined), [enabled, keyId]);

  useEffect(() => {
    if (!pollMs) return;
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      id = setTimeout(() => {
        // A hidden tab doesn't poll; the next tick after it's shown again catches up.
        if (document.visibilityState !== "hidden" && keepPolling()) setTick((t) => t + 1);
        schedule();
      }, untilNextTick(pollMs));
    };
    schedule();
    return () => clearTimeout(id);
  }, [pollMs]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load(client)?.then(
      // Same object as before (unchanged answer): keep the state, so nothing re-renders.
      (data) =>
        !cancelled && setState((s) => (s?.keyId === keyId && s.data === data && s.error === null ? s : { keyId, data, error: null })),
      (error) => !cancelled && setState((s) => ({ keyId, data: s?.keyId === keyId ? s.data : undefined, error })),
    );
    return () => {
      cancelled = true;
    };
  }, [client, v, tick, enabled, keyId]);

  if (!enabled) return { data: undefined, error: null, loading: false };
  // Until this key's first answer arrives, show what another reader already fetched for it.
  if (state?.keyId !== keyId) return { data: cachedData<T>(keyId, client), error: null, loading: true };
  return { data: state.data, error: state.error, loading: false };
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

/** How an action ended, as the status dialog says it: a title, maybe a line, and its tone. */
export type ActionOutcome = string | { title: string; description?: string; tone?: "success" | "info" };

/**
 * Runs a transaction and shows it in the app's status dialog (`ActionStatusDialog`): the pending
 * label while it runs, then its outcome, or why it failed. Then refreshes every query.
 * `feedback: "errors"` opens the dialog only on a failure, for screens that show their own progress.
 */
export function useChainAction() {
  const client = useKotiziClient();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async <R>(
      key: string,
      action: (client: KotiziClient) => Promise<R>,
      labels: {
        pending: string;
        success: ActionOutcome | ((result: R) => ActionOutcome);
        /** The dialog's title when it fails; the error's own message goes under it. */
        failure?: string;
      },
      { feedback = "all" }: { feedback?: "all" | "errors" } = {},
    ) => {
      setPending(key);
      if (feedback === "all") showActionStatus({ phase: "pending", title: labels.pending });
      try {
        const result = await action(client);
        if (feedback === "all") {
          const outcome = typeof labels.success === "function" ? labels.success(result) : labels.success;
          const { title, description, tone = "success" } = typeof outcome === "string" ? { title: outcome } : outcome;
          showActionStatus({ phase: "done", tone, title, description });
        }
        return result;
      } catch (error) {
        console.warn(`[kotizi] ${key} failed`, error);
        showActionStatus(failureStatus(error, labels.failure));
        return null;
      } finally {
        setPending(null);
        invalidateChain();
      }
    },
    [client],
  );

  return { run, pending };
}

/** A failed action in the status dialog. Cancelling a confirmation is the user's choice, not a failure. */
export function failureStatus(error: unknown, title = "Not completed"): Extract<ActionStatus, { phase: "failed" }> {
  if (error instanceof KotiziError && error.code === "UserRejected") {
    return { phase: "failed", tone: "neutral", title: errorMessage(error), description: "Nothing was sent." };
  }
  return { phase: "failed", tone: "error", title, description: errorMessage(error) };
}

// One 1 s timer shared by every `useNow` reader, running only while there is one.
const clockListeners = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | undefined;

const subscribeClock = (l: () => void) => {
  clockListeners.add(l);
  clock ??= setInterval(() => clockListeners.forEach((listener) => listener()), 1_000);
  return () => {
    clockListeners.delete(l);
    if (clockListeners.size === 0) {
      clearInterval(clock);
      clock = undefined;
    }
  };
};

/** Current unix time in seconds, ticking every second (for countdowns). 0 during prerender. */
export function useNow() {
  return useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );
}
