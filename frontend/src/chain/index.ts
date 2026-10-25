import type { KotiziClient } from "./client";
import { MockKotiziClient } from "./mock/client";

// One mock for the whole app, so its state survives sign-in/sign-out.
let mock: MockKotiziClient | null = null;

/**
 * Builds the chain client. Called by `ChainProvider`; UI code gets the client from `useKotiziClient()`.
 *
 * TODO(stellar), task 6: with `env.chainClient === "stellar"` return a `StellarKotiziClient` built from
 * `createBackendApi({ baseUrl: env.apiUrl, getAccessToken })` and the session's `SessionSigner`, and
 * pass those in again (`ChainProvider` rebuilds the client when the signer changes).
 */
export function createKotiziClient(): KotiziClient {
  return (mock ??= new MockKotiziClient());
}

export type { KotiziClient } from "./client";
export * from "./types";
