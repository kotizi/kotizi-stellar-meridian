"use client";

import { createContext, useContext } from "react";

import type { Address } from "@/chain";

/**
 * How people sign in: `email` through Privy (members), `wallet` with Freighter (the operator: an
 * account without a Privy login, see `Session.walletOnly`).
 */
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

/**
 * The operator's own Stellar wallet (Freighter), used only to create groups: `create_group` is
 * signed and paid by the contract's admin, whose key isn't a Privy account (Privy has no external
 * Stellar wallets). Base64 XDR in and out, so the session doesn't depend on a chain SDK.
 */
export interface AdminWallet {
  /** Whether the Freighter extension is in this browser; undefined while that's being checked. */
  available: boolean | undefined;
  /** The address Freighter shares with this site; null until the site is allowed. */
  address: Address | null;
  /** Asks Freighter to share its address (Freighter's own prompt); resolves with it. */
  connect(): Promise<Address>;
  /**
   * Signs a transaction envelope with Freighter's prompt, once Freighter is on `networkPassphrase`
   * (else `WalletWrongNetwork`); resolves with the signed envelope.
   */
  signTransaction(transactionXdr: string, networkPassphrase: string): Promise<string>;
}

export interface Session {
  /** "privy" when NEXT_PUBLIC_PRIVY_APP_ID is set, "mock" otherwise. */
  mode: "privy" | "mock";
  status: "loading" | "signedOut" | "signedIn";
  /** The account's Stellar wallet. The UI names the account by it (the `owner` of every action). Null until a wallet exists. */
  address: Address | null;
  /** Email or social handle shown in the UI. */
  label: string | null;
  /** How this session lets people sign in; the landing offers only these. */
  loginMethods: readonly LoginMethod[];
  /**
   * Signed in with a wallet (Freighter) instead of Privy: the operator's account (user decision,
   * 2026-10-25). It has no access token, so the backend's account routes (shares, identity, the relay)
   * don't know it: it browses groups and, as the admin, creates them; member screens say so.
   */
  walletOnly: boolean;
  /** Signer for `address`. Null without a wallet, and always null in the mock session. */
  signer: SessionSigner | null;
  /** The admin's Freighter wallet, for group creation. Null in the mock session (everyone may create there). */
  adminWallet: AdminWallet | null;
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
