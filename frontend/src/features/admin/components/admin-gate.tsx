"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { ScreenLoading } from "@/components/kz/screen";
import { useSession } from "@/session/context";

import { useIsAdmin } from "../hooks/use-admin";
import { ConnectAdminWallet } from "./connect-admin-wallet";

/**
 * Admin screens. The admin is either the session's own wallet or the admin's Freighter wallet: a
 * browser with Freighter that isn't connected yet gets the step to connect it; any other account is
 * sent to the app's home. A placeholder while that isn't known.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, adminWallet } = useSession();
  const admin = useIsAdmin();
  const freighter = adminWallet?.available;
  const checking = status !== "signedIn" || admin === undefined || (admin === false && adminWallet !== null && freighter === undefined);
  const sendHome = !checking && admin === false && freighter !== true;

  useEffect(() => {
    if (sendHome) router.replace("/home");
  }, [sendHome, router]);

  if (checking) return <ScreenLoading />;
  if (admin) return children;
  return sendHome ? null : <ConnectAdminWallet />;
}
