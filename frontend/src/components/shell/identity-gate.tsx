"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useKyc } from "@/chain/use-account";
import { ScreenLoading } from "@/components/kz/screen";
import { useSession } from "@/session/context";
import { requiresIdentityCheck } from "@/session/identity-check";

import { useSigningOut } from "./use-sign-out";

/**
 * Whether the signed-in account must verify its identity: a new account, or a wallet without an
 * identity record. Undefined while that isn't known yet. Only a settled read counts, so a record
 * created a moment ago isn't hidden by the previous answer still in the cache.
 */
export function useIdentityCheckRequired(): boolean | undefined {
  return useIdentityGateState().required;
}

/** `failed`: the identity record couldn't be read, so it won't be known until a later poll. */
function useIdentityGateState(): { required: boolean | undefined; failed: boolean } {
  const session = useSession();
  const address = session.status === "signedIn" ? session.address : null;
  const kyc = useKyc(address);
  const kycApproved = kyc.loading || kyc.error || !address ? undefined : kyc.data !== null;
  if (session.status !== "signedIn") return { required: false, failed: false };
  const required = requiresIdentityCheck({
    newAccountPending: session.newAccountPending,
    verifiedHere: session.identityVerified,
    kycApproved,
  });
  return { required, failed: Boolean(kyc.error) };
}

/**
 * The app waits behind /verify while identity verification is required, and shows a placeholder
 * while that isn't known yet (right after login), so the requested screen never flashes before
 * /verify. A failed read doesn't hold the app: `join_group` requires the record anyway.
 */
export function IdentityGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { required, failed } = useIdentityGateState();
  const signingOut = useSigningOut();
  const blocked = required === true && !signingOut;

  useEffect(() => {
    // Read here rather than with usePathname, which would need a <Suspense> around the whole shell.
    if (blocked) router.replace(`/verify?next=${encodeURIComponent(window.location.pathname)}`);
  }, [blocked, router]);

  if (blocked) return null;
  if (signingOut || (required === undefined && !failed)) return <ScreenLoading />;
  return children;
}
