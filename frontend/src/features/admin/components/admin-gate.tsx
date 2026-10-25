"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { ScreenLoading } from "@/components/kz/screen";
import { useSession } from "@/session/context";

import { useIsAdmin } from "../hooks/use-admin";

/** Admin screens: any other account is sent to the app's home; a placeholder while that isn't known. */
export function AdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  // Without a session yet `useIsAdmin` answers false (no address): wait for the session first.
  const admin = useIsAdmin();
  const isAdmin = status === "signedIn" ? admin : undefined;

  useEffect(() => {
    if (isAdmin === false) router.replace("/home");
  }, [isAdmin, router]);

  if (isAdmin === undefined) return <ScreenLoading />;
  return isAdmin ? children : null;
}
