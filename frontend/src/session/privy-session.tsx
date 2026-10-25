"use client";

import { PrivyProvider, useLogin, usePrivy } from "@privy-io/react-auth";
import { useCallback, useMemo, type ReactNode } from "react";

import { env } from "@/config/env";

import { SessionContext, type Session, type SessionSigner } from "./context";
import { clearIdentityCheck, completeIdentityCheck, markLogin, useIdentityCheck } from "./identity-check";

// Walletless onboarding: email login gives the account a Stellar embedded wallet.
//
// TODO(stellar), task 6 — the parts that were Solana/EVM-specific here and are NOT ported yet:
//  - Stellar is a Privy Tier 2 chain: no `useWallets`/`useSignTransaction` helper and no
//    `embeddedWallets.<chain>.createOnLogin` config key is assumed. Creating the embedded wallet
//    (REST/`createWallet` with chain_type "stellar") and the raw-sign flow (hash in, signature out)
//    must be confirmed against a real Privy app before this file is finished.
//  - `signer` below is therefore always null, and `chainType === "stellar"` on linked accounts is the
//    same unverified assumption as in backend/src/auth/privy.ts.
export function PrivySession({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={env.privyAppId}
      clientId={env.privyClientId}
      config={{
        loginMethods: ["email", "wallet"],
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
  // Also fires when an existing session is restored (`wasAlreadyAuthenticated`): only a real login
  // starts identity verification.
  const { login } = useLogin({
    onComplete: ({ user, isNewUser, wasAlreadyAuthenticated }) => {
      if (!wasAlreadyAuthenticated) markLogin({ accountId: user.id, isNewAccount: isNewUser });
    },
  });

  // The account's address comes from the wallets linked to it. Prefer the embedded wallet.
  const address = useMemo(() => {
    if (!authenticated) return null;
    const stellar = (user?.linkedAccounts ?? []).flatMap((a) =>
      a.type === "wallet" && (a.chainType as string) === "stellar"
        ? [{ address: a.address, embedded: a.walletClientType === "privy" }]
        : [],
    );
    return (stellar.find((w) => w.embedded) ?? stellar[0])?.address ?? null;
  }, [authenticated, user]);
  const email = user?.email?.address ?? null;

  const signer = useMemo<SessionSigner | null>(() => null, []);

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
