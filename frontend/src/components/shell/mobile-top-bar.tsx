"use client";

import Link from "next/link";

import { useKotiziClient } from "@/chain/provider";
import { Logo } from "@/components/brand/logo";
import { UserAvatar } from "@/components/kz/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/session/context";

import { AccountMenu } from "./account-menu";
import { useSigningOut } from "./use-sign-out";

/** Mobile header: logo on the left, avatar (account menu) or sign-in on the right. */
export function MobileTopBar() {
  const session = useSession();
  const isMock = useKotiziClient().kind === "mock";
  const signingOut = useSigningOut();
  // "Sign in" only once the session is known to be signed out (not while loading or leaving).
  const offerSignIn = session.status === "signedOut" && !signingOut;

  return (
    <header className="flex h-16 items-center justify-between px-6 lg:hidden">
      <Link href="/home" aria-label="kotizi home" className="focus-ring rounded-sm">
        <Logo className="h-6 w-auto text-white" />
      </Link>
      <div className="flex items-center gap-3">
        {isMock && <Badge tone="blue">Mock data</Badge>}
        {session.status === "signedIn" ? (
          <AccountMenu
            trigger={
              <button aria-label="Account" className="focus-ring rounded-full">
                <UserAvatar label={session.label} size="lg" />
              </button>
            }
          />
        ) : (
          offerSignIn && (
            <Button variant="primary" size="sm" onClick={() => session.login()}>
              Sign in
            </Button>
          )
        )}
      </div>
    </header>
  );
}
