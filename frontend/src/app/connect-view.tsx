"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Logo } from "@/components/brand/logo";
import { GlassSheet } from "@/components/kz/glass-sheet";
import { Luz } from "@/components/kz/luz";
import { VidroK } from "@/components/kz/vidro-k";
import { endSignOut, useSigningOut } from "@/components/shell/use-sign-out";
import { Button } from "@/components/ui/button";
import { useSession } from "@/session/context";

// Screen 01 · Connect. Signed-in users go straight to /home; new accounts verify their identity
// first (the app's gate also sends wallets without an identity record to /verify).
export function ConnectView() {
  const session = useSession();
  const router = useRouter();
  const signingOut = useSigningOut();
  const busy = session.status === "loading" || signingOut;

  useEffect(() => {
    // Right after "Sign out" the session may still be signed in: wait for it instead of going back.
    if (signingOut) {
      if (session.status === "signedOut") endSignOut();
    } else if (session.status === "signedIn") {
      router.replace(session.newAccountPending ? "/verify" : "/home");
    }
  }, [signingOut, session.status, session.newAccountPending, router]);

  return (
    <main className="relative isolate flex min-h-svh flex-1 flex-col overflow-hidden">
      <Luz className="-z-20 lg:top-[300px] lg:left-[20%]" />
      <VidroK className="absolute top-[400px] -right-16 -z-10 w-[260px] lg:top-24 lg:right-[8%] lg:w-[460px]" />

      <div className="page-grid mx-auto flex w-full max-w-md flex-1 flex-col pt-8 pb-6 lg:grid lg:max-w-none lg:items-end lg:pt-12 lg:pb-16">
        <div className="flex flex-1 flex-col lg:col-span-7 lg:self-stretch">
          <Logo className="h-[26px] w-auto self-start text-white" />
          <div className="mt-14 flex flex-col gap-5 lg:mt-auto lg:mb-6">
            <p className="label-mono">Digital buying group · no down payment</p>
            <h1 className="type-firma lg:text-8xl lg:leading-[0.95]">
              your own home
              <br />
              <span className="font-light">no down payment.</span>
            </h1>
            <p className="max-w-sm type-body-md text-secondary">
              Join a group, pay your installments and follow every draw, fully transparent. No fine print.
            </p>
          </div>
        </div>

        <GlassSheet className="mt-auto w-full lg:col-span-5 lg:col-start-8 lg:mt-0 lg:max-w-sm lg:justify-self-end">
          <Button variant="primary" size="xl" disabled={busy} onClick={() => session.login("email")}>
            Sign in with email
          </Button>
          <p className="label-mono text-center">
            {session.mode === "privy"
              ? "Login via Privy · your account is ready instantly"
              : "Mock login · set NEXT_PUBLIC_PRIVY_APP_ID for Privy"}
          </p>
          {/* Email is the path we recommend (no prompts); a wallet, when the session offers it, stays quiet. */}
          {session.loginMethods.includes("wallet") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => session.login("wallet")}
              className="focus-ring self-center rounded-sm type-body-sm text-tertiary underline-offset-4 transition-colors hover:text-secondary hover:underline disabled:pointer-events-none disabled:text-disabled"
            >
              Already have a crypto wallet? Use it instead
            </button>
          )}
        </GlassSheet>
      </div>
    </main>
  );
}
