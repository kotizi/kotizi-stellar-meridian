"use client";

import { Building2, LogOut, RotateCcw, ShieldCheck, TriangleAlert, WifiOff, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { invalidateChain } from "@/chain/hooks";
import { useIsAdmin } from "@/features/admin";
import { TX_FAILURE_CODES, type TxFailureCode } from "@/chain/errors";
import { useWalletState } from "@/chain/use-account";
import { useTestHelpers } from "@/chain/use-test-helpers";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/session/context";

import { useSignOut } from "./use-sign-out";

const FAILURE_LABELS: Record<TxFailureCode, string> = {
  UserRejected: "Cancelled by the user",
  TransactionExpired: "Confirmation timed out",
  NetworkError: "Network error",
  SessionExpired: "Session expired",
  SponsorUnavailable: "Sponsorship unavailable",
  ServiceUnavailable: "Service unavailable",
  TransactionFailed: "Generic failure",
};

/** Account dropdown: "Create group" for the admin, identity verification, mock test helpers and sign out. */
export function AccountMenu({ trigger, align = "end" }: { trigger: ReactElement; align?: "start" | "end" }) {
  const session = useSession();
  const { address, kycApproved } = useWalletState();
  const testing = useTestHelpers();
  const isAdmin = useIsAdmin();
  const signOut = useSignOut();
  const mockHelpers = testing && (testing.failNextTransaction || testing.setOffline || testing.reset);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent align={align} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-1">
              <span className="text-primary">{session.label ?? "Signed in"}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {isAdmin && (
            <DropdownMenuItem render={<Link href="/admin/groups/new" />}>
              <Building2 /> Create group
            </DropdownMenuItem>
          )}
          {kycApproved === false ? (
            <DropdownMenuItem render={<Link href="/verify" />} className="justify-between">
              <span className="flex items-center gap-2">
                <ShieldCheck /> Verify identity
              </span>
              <Badge tone="warning">Pending</Badge>
            </DropdownMenuItem>
          ) : (
            <div className="flex items-center justify-between px-2 py-1.5 type-body-sm">
              <span className="text-tertiary">Identity</span>
              <Badge tone={kycApproved ? "success" : "neutral"}>{kycApproved ? "Verified" : "…"}</Badge>
            </div>
          )}
          {mockHelpers && address && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5">
                  <Wrench className="size-3.5" /> Test helpers
                </DropdownMenuLabel>
                {testing.failNextTransaction && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <TriangleAlert /> Fail next confirmation
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {TX_FAILURE_CODES.map((code) => (
                        <DropdownMenuItem key={code} onClick={() => testing.failNextTransaction?.(code)}>
                          {FAILURE_LABELS[code]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {testing.setOffline && (
                  <DropdownMenuItem
                    onClick={() => {
                      testing.setOffline?.(!testing.isOffline?.());
                      invalidateChain();
                    }}
                  >
                    <WifiOff /> {testing.isOffline?.() ? "End network outage" : "Simulate network outage"}
                  </DropdownMenuItem>
                )}
                {testing.reset && (
                  <DropdownMenuItem
                    onClick={async () => {
                      await testing.reset?.();
                      invalidateChain();
                    }}
                  >
                    <RotateCcw /> Reset mock data
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
