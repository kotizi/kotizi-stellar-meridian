"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/session/context";

/**
 * The app's screens are for signed-in accounts only: a signed-out visitor is sent to the landing
 * page and nothing of the app renders on the way. While the session is still loading (also during
 * prerender and Next's instant-navigation check) the screens render with their own placeholders.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  const signedOut = status === "signedOut";

  useEffect(() => {
    if (signedOut) router.replace("/");
  }, [signedOut, router]);

  return signedOut ? null : children;
}
