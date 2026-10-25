"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ScreenTitle } from "@/components/kz/screen";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateGroupLink } from "@/features/admin";
import { useSession } from "@/session/context";

/**
 * A member's screen (home, payments, draws, joining, the credit). The operator's wallet account
 * (`Session.walletOnly`, signed in with Freighter) has no member data in the backend, so it gets a
 * notice instead and the screen never mounts (nor reads the account's shares).
 */
export function MembersOnly({ children }: { children: ReactNode }) {
  const { walletOnly } = useSession();
  if (!walletOnly) return children;
  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle
        eyebrow="Wallet account"
        title="This account manages groups"
        caption="Signed in with a wallet, you can browse the groups and, as kotizi's admin, create them. Members sign in with email to join groups and pay installments."
      />
      <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Link href="/groups" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Open groups
        </Link>
        <CreateGroupLink />
      </Card>
    </div>
  );
}
