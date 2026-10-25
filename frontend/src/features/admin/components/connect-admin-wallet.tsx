"use client";

import Link from "next/link";
import { useState } from "react";

import { errorMessage } from "@/chain/hooks";
import { ScreenTitle } from "@/components/kz/screen";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/session/context";

/**
 * The admin's first step on a browser with Freighter: connect the wallet that holds kotizi's admin
 * key. The operator's screen, so it names the wallet (user decision, 2026-10-25). Once connected
 * and recognized as the admin, `AdminGate` shows the admin screens.
 */
export function ConnectAdminWallet() {
  const { adminWallet } = useSession();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Connected, yet the gate still shows this: that Freighter account isn't the contract's admin.
  const notAdmin = adminWallet?.address != null;

  const connect = async () => {
    if (!adminWallet) return;
    setConnecting(true);
    setError(null);
    try {
      await adminWallet.connect();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle
        eyebrow="Admin"
        title="Connect the admin wallet"
        caption="Groups are created and paid for by kotizi's admin account, which lives in Freighter. Connect it to continue."
      />
      <Card className="flex max-w-md flex-col gap-4">
        {notAdmin && (
          <p role="alert" className="type-body-sm text-warning">
            This Freighter account isn&apos;t kotizi&apos;s admin. Switch to the admin account in Freighter and connect again.
          </p>
        )}
        {error && (
          <p role="alert" className="type-body-sm text-error">
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" disabled={connecting} onClick={() => void connect()}>
          {connecting ? "Waiting for Freighter…" : notAdmin ? "Connect again" : "Connect Freighter"}
        </Button>
        <Link href="/home" className={buttonVariants({ variant: "ghost", size: "md" })}>
          Go to home
        </Link>
      </Card>
    </div>
  );
}
