// NEXT_PUBLIC_* values are inlined at build time, so each one is read explicitly.
export const env = {
  /** Privy app id. Without it the app falls back to a mock session (no real login). */
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  privyClientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined,
  /** "mock" (default) or "stellar" (the Kotizi contract on testnet, through the backend). */
  chainClient: (process.env.NEXT_PUBLIC_CHAIN_CLIENT ?? "mock") as "mock" | "stellar",
  /**
   * The app's backend: reads, the sponsored relay, draws, demo onboarding. The contract id, the
   * Soroban RPC and the network passphrase come from its `GET /v1/config`, so the app needs no
   * variable of its own for them.
   */
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, ""),
};

export const usePrivyAuth = env.privyAppId.length > 0;
