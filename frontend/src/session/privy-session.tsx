"use client";

import { PrivyProvider, useLogin, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import { env } from "@/config/env";
import { sleep } from "@/lib/sleep";

import { LOGIN_METHODS, SessionContext, type Session, type SessionSigner } from "./context";
import { clearIdentityCheck, completeIdentityCheck, markLogin, useIdentityCheck } from "./identity-check";
import { needsStellarWallet, signatureBytes, stellarAddressOf, toHex, type PrivyUserLike } from "./stellar-wallet";

/** Tries at creating a missing Stellar wallet before leaving it to the next visit. */
const CREATE_WALLET_ATTEMPTS = 3;
const CREATE_WALLET_RETRY_MS = 2_000;

// Walletless onboarding: email login, then the app gives the account a Stellar embedded wallet.
// Stellar is a Privy "extended chain" (raw-hash signing, no `createOnLogin`), so the wallet is
// created here once Privy's login flow is over, and signs the 32-byte payloads the backend's relay
// asks for. Privy has no external Stellar wallets; the admin signs group creation with Freighter.
export function PrivySession({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={env.privyAppId}
      clientId={env.privyClientId}
      config={{
        loginMethods: [...LOGIN_METHODS],
        appearance: {
          theme: "#171717", // graphite, the brand's dark background (Privy's "dark" is navy)
          accentColor: "#0000FF",
          logo: "/brand/logo-white.svg",
        },
        // Our screens are the confirmation step (amount, "Network fee: Free", explicit button).
        embeddedWallets: { showWalletUIs: false },
      }}
    >
      <PrivySessionBridge>{children}</PrivySessionBridge>
    </PrivyProvider>
  );
}

function PrivySessionBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const identityCheck = useIdentityCheck();
  const ensureStellarWallet = useEnsureStellarWallet();
  // Also fires when an existing session is restored (`wasAlreadyAuthenticated`): only a real login
  // starts identity verification. It runs once Privy's modal is done, so the wallet is created here
  // and never while that modal is still creating the account.
  const { login } = useLogin({
    onComplete: ({ user, isNewUser, wasAlreadyAuthenticated }) => {
      if (!wasAlreadyAuthenticated) markLogin({ accountId: user.id, isNewAccount: isNewUser });
      ensureStellarWallet(user.id, user);
    },
  });

  // The account's address comes from the Stellar wallets linked to it (the embedded one first).
  const address = authenticated && user ? stellarAddressOf(user) : null;
  const email = user?.email?.address ?? null;

  // The embedded wallet signs without a prompt: our screens are the confirmation. `signRawHash`
  // changes identity across renders, so the signer reads it through a ref and stays stable per
  // address (the chain client is rebuilt whenever the signer changes).
  const { signRawHash } = useSignRawHash();
  const signRawHashRef = useRef(signRawHash);
  useEffect(() => {
    signRawHashRef.current = signRawHash;
  }, [signRawHash]);
  const signer = useMemo<SessionSigner | null>(
    () =>
      address
        ? {
            address,
            signHash: async (hash) => {
              const { signature } = await signRawHashRef.current({ address, chainType: "stellar", hash: toHex(hash) });
              return signatureBytes(signature);
            },
          }
        : null,
    [address],
  );

  // Stable while signed in: the chain client is rebuilt whenever this changes.
  const accessToken = useCallback(
    () => (authenticated ? getAccessToken() : Promise.resolve(null)),
    [authenticated, getAccessToken],
  );

  const session = useMemo<Session>(() => {
    return {
      mode: "privy",
      status: !ready ? "loading" : authenticated ? "signedIn" : "signedOut",
      address,
      label: email,
      loginMethods: LOGIN_METHODS,
      signer,
      getAccessToken: accessToken,
      isNewAccount: identityCheck.isNewAccount,
      newAccountPending: authenticated && identityCheck.pending,
      identityVerified: authenticated && identityCheck.verified,
      completeIdentityCheck,
      login: (method) => login(method ? { loginMethods: [method] } : undefined),
      logout: async () => {
        clearIdentityCheck();
        await logout();
      },
    };
  }, [ready, authenticated, address, email, signer, accessToken, identityCheck, login, logout]);

  return <SessionContext value={session}>{children}</SessionContext>;
}

/**
 * Gives an account without a Stellar wallet its embedded one (`needsStellarWallet`): every new
 * account, since Stellar has no `createOnLogin`, and any older one whose creation was cut short.
 * Call it only after Privy's login flow: creating a wallet while its modal is still open takes the
 * modal over. Once per account and tab; a failure is retried a couple of times, since without a
 * wallet the account can't act, and otherwise left to the next visit.
 */
function useEnsureStellarWallet() {
  const { createWallet } = useCreateWallet();
  const createRef = useRef(createWallet);
  useEffect(() => {
    createRef.current = createWallet;
  }, [createWallet]);
  const attempted = useRef<string | null>(null);
  return useCallback((accountId: string, user: PrivyUserLike) => {
    if (attempted.current === accountId || !needsStellarWallet(user)) return;
    attempted.current = accountId;
    void (async () => {
      for (let attempt = 1; attempt <= CREATE_WALLET_ATTEMPTS; attempt++) {
        try {
          await createRef.current({ chainType: "stellar" });
          return;
        } catch {
          if (attempt < CREATE_WALLET_ATTEMPTS) await sleep(CREATE_WALLET_RETRY_MS);
        }
      }
    })();
  }, []);
}
