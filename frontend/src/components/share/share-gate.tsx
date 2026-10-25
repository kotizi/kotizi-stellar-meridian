"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useMyShares, type MyShare } from "@/chain/use-my-shares";
import { LoadError } from "@/components/onchain/load-error";
import { ScreenLoading } from "@/components/kz/screen";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/session/context";

/** Renders `children` with the user's shares, or the loading / signed-out / no-share state. */
export function ShareGate({
  empty,
  children,
}: {
  /** Shown when the user has no share yet. */
  empty: ReactNode;
  children: (shares: MyShare[]) => ReactNode;
}) {
  const session = useSession();
  const shares = useMyShares();

  if (!useSharesSettled()) return <ScreenLoading />;
  if (session.status === "signedOut") {
    return (
      <Card className="flex flex-col items-start gap-4">
        <p className="type-body-md text-secondary">Sign in to see your shares, installments and draws.</p>
        <Button variant="primary" size="lg" onClick={() => session.login()}>
          Sign in
        </Button>
      </Card>
    );
  }
  if (shares.error && !shares.data) return <LoadError what="your shares" error={shares.error} />;
  if (!shares.data?.length) return <>{empty}</>;
  return <>{children(shares.data)}</>;
}

/** False while the session or the user's shares are still loading (what `ShareGate` waits for). */
export function useSharesSettled(): boolean {
  const session = useSession();
  const shares = useMyShares();
  return !(session.status === "loading" || (shares.signedIn && shares.loading && !shares.data));
}

export function NoShare({ message }: { message: string }) {
  return (
    <Card className="flex flex-col items-start gap-4">
      <p className="type-body-md text-secondary">{message}</p>
      <Link href="/groups" className={buttonVariants({ variant: "primary", size: "lg" })}>
        Choose a group
      </Link>
    </Card>
  );
}
