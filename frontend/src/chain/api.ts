// HTTP client for the Kotizi backend (backend/README.md): reads, the sponsored relay,
// "draw now" and the demo onboarding (KYC, test USDC). Bigints travel as strings.

import type { z } from "zod";

import { sleep as defaultSleep } from "@/lib/sleep";

/** A non-2xx answer from the backend: `{ code, message }`, plus program logs on a failed transaction. */
export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly logs?: string[],
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/**
 * The backend caches a user's linked wallets for 30 s, and a wallet Privy creates right after login
 * (e.g. an embedded wallet created right after sign-up) can be missing from that cache: the
 * backend then answers `no_wallet` or `not_user_wallet` for a wallet the session already has. Both
 * are checked before anything is sent on chain, so the request is safely retried until the cache
 * catches up.
 */
const WALLET_NOT_KNOWN_YET = new Set(["no_wallet", "not_user_wallet"]);
const WALLET_RETRY_MS = 3_000;
const WALLET_RETRY_FOR_MS = 35_000;

/**
 * The backend rate-limits per IP (429). A read that hits the limit waits and asks again before it
 * fails, so a burst of polls doesn't turn into an error screen. Writes are never repeated.
 */
const RATE_LIMIT_RETRIES_MS = [2_000, 4_000, 8_000];

type RequestOptions = { method?: "GET" | "POST"; body?: unknown; auth?: boolean };

export interface BackendApi {
  /**
   * `schema` checks the answer; a mismatch is a `BackendError` 502 `invalid_response`.
   * `auth` sends the session's access token (required by `/v1/me` and every POST).
   */
  request<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T>;
}

export function createBackendApi({
  baseUrl,
  getAccessToken,
  fetch: fetchImpl = fetch,
  sleep = defaultSleep,
}: {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): BackendApi {
  const once = async <T>(
    path: string,
    schema: z.ZodType<T>,
    { method = "GET", body, auth = false }: RequestOptions,
  ): Promise<T> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (auth) {
      const token = await getAccessToken();
      if (!token) throw new BackendError(401, "unauthorized", "Not signed in");
      headers.authorization = `Bearer ${token}`;
    }
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new BackendError(
        response.status,
        typeof json.code === "string" ? json.code : "error",
        typeof json.message === "string" ? json.message : response.statusText,
        Array.isArray(json.logs) ? json.logs.filter((l): l is string => typeof l === "string") : undefined,
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new BackendError(502, "invalid_response", `Unexpected answer from ${path}: ${parsed.error.message}`);
    }

    return parsed.data;
  };

  return {
    async request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}) {
      const isRead = (options.method ?? "GET") === "GET";
      let walletWaited = 0;
      let rateLimited = 0;
      for (;;) {
        try {
          return await once(path, schema, options);
        } catch (error) {
          if (!(error instanceof BackendError)) throw error;
          if (options.auth && WALLET_NOT_KNOWN_YET.has(error.code) && walletWaited + WALLET_RETRY_MS <= WALLET_RETRY_FOR_MS) {
            walletWaited += WALLET_RETRY_MS;
            await sleep(WALLET_RETRY_MS);
          } else if (isRead && error.status === 429 && rateLimited < RATE_LIMIT_RETRIES_MS.length) {
            await sleep(RATE_LIMIT_RETRIES_MS[rateLimited++]);
          } else {
            throw error;
          }
        }
      }
    },
  };
}
