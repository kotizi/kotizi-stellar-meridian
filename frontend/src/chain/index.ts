import { env } from "@/config/env";
import type { SessionSigner } from "@/session/context";

import { createBackendApi } from "./api";
import type { KotiziClient } from "./client";
import { MockKotiziClient } from "./mock/client";
import { StellarKotiziClient } from "./stellar/client";

// One mock for the whole app, so its state survives sign-in/sign-out.
let mock: MockKotiziClient | null = null;

/**
 * Builds the chain client: the mock (`NEXT_PUBLIC_CHAIN_CLIENT=mock`, the default) or the Kotizi
 * contract on Stellar testnet through the backend (`stellar`). Called by `ChainProvider` whenever the
 * session's signer or token source changes; UI code gets the client from `useKotiziClient()`.
 */
export function createKotiziClient({
  signer,
  getAccessToken,
}: {
  signer: SessionSigner | null;
  getAccessToken: () => Promise<string | null>;
}): KotiziClient {
  if (env.chainClient === "stellar") {
    return new StellarKotiziClient({ api: createBackendApi({ baseUrl: env.apiUrl, getAccessToken }), signer });
  }
  return (mock ??= new MockKotiziClient());
}

export type { KotiziClient } from "./client";
export * from "./types";
