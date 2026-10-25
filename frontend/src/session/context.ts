"use client";

import { createContext, useContext } from "react";

import type { Address } from "@/chain";

export type LoginMethod = "email" | "wallet";

/**
 * Signs with the session's wallet, without sending. Plain bytes in and out, so the session doesn't
 * depend on a chain SDK; the chain client decides what to sign.
 *
 * The wallet never signs a transaction: the app's backend builds it with its sponsor as the source
 * (so it pays the fee and the storage rent, and users never need XLM) and asks the wallet to sign
 * only the 32-byte payload of each Soroban authorization entry. Privy treats Stellar as a raw-signing
 * chain, so that payload is signed as a raw hash.
 */
export interface SessionSigner {
  address: Address;
  /** Resolves with the 64-byte ed25519 signature over `hash`. */
  signHash(hash: Uint8Array): Promise<Uint8Array>;
}

export interface Session {
  /** "privy" when NEXT_PUBLIC_PRIVY_APP_ID is set, "mock" otherwise. */
  mode: "privy" | "mock";
  status: "loading" | "signedOut" | "signedIn";
  /** The account's Stellar wallet. The UI names the account by it (the `owner` of every action). Null until a wallet exists. */
  address: Address | null;
  /** Email or social handle shown in the UI. */
  label: string | null;
  /** Signer for `address`. Null without a wallet, and always null in the mock session. */
  signer: SessionSigner | null;
  /**
   * Access token proving who is signed in, sent to the app's backend (it sponsors transactions only
   * for its users' wallets). Null when signed out, and always null in the mock session.
   */
  getAccessToken: () => Promise<string | null>;
  /**
   * Whether the account didn't exist before the last login (Privy's `isNewUser`). Null when unknown:
   * a restored session, or the mock session.
   */
  isNewAccount: boolean | null;
  /**
   * A new account that hasn't finished identity verification yet. Accounts without an identity
   * record also go to /verify; `useIdentityCheckRequired` combines both.
   */
  newAccountPending: boolean;
  /** Identity verification finished in this tab for this account (set by `completeIdentityCheck`). */
  identityVerified: boolean;
  completeIdentityCheck: () => void;
  /** Opens the login flow; `method` preselects email or an external wallet. */
  login: (method?: LoginMethod) => void;
  /** Resolves once signed out. UI code signs out through `useSignOut` (it also clears its state). */
  logout: () => Promise<void>;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <AppProviders>");
  return session;
}
