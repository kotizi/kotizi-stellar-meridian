// NEXT_PUBLIC_* values are inlined at build time, so each one is read explicitly.
export const env = {
  /** Privy app id. Without it the app falls back to a mock session (no real login). */
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  privyClientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined,
  /** "mock" (default) or "stellar" once the contract is deployed and the client is generated. */
  chainClient: (process.env.NEXT_PUBLIC_CHAIN_CLIENT ?? "mock") as "mock" | "stellar",
  /** The app's backend: reads, the sponsored relay, draws, demo onboarding. */
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, ""),
  // TODO(stellar): Soroban RPC URL, network passphrase, contract id.
};

export const usePrivyAuth = env.privyAppId.length > 0;
