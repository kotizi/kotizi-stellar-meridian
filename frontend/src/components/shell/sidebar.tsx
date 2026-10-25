"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { useKotiziClient } from "@/chain/provider";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSession } from "@/session/context";

import { AccountMenu } from "./account-menu";
import { useSignOut, useSigningOut } from "./use-sign-out";
import { isActive, NAV } from "./nav";

/** Desktop sidebar (>= 1024px): logo, navigation and the account card at the bottom. */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-subtle bg-canvas px-4 py-6 lg:flex">
      <Link href="/home" aria-label="kotizi home" className="focus-ring self-start rounded-sm px-3">
        <Logo className="h-[26px] w-auto text-white" />
      </Link>
      <nav aria-label="Main" className="mt-10 flex flex-col gap-1">
        <Suspense fallback={<NavItems pathname="" />}>
          <ActiveNavItems />
        </Suspense>
      </nav>
      <div className="mt-auto">
        <AccountCard />
      </div>
    </aside>
  );
}

function ActiveNavItems() {
  return <NavItems pathname={usePathname()} />;
}

function NavItems({ pathname }: { pathname: string }) {
  return NAV.map((item) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "focus-ring flex h-11 items-center gap-3 rounded-md px-3 type-body-md transition-colors",
          active ? "bg-surface text-primary" : "text-secondary hover:text-primary",
        )}
      >
        <span aria-hidden className={cn("size-4 rounded-xs", active ? "bg-brand" : "border-[1.8px] border-default")} />
        {item.label}
      </Link>
    );
  });
}

function AccountCard() {
  const session = useSession();
  const isMock = useKotiziClient().kind === "mock";
  const signOut = useSignOut();
  const signingOut = useSigningOut();

  // Neither the account nor "Sign in" while the session is unknown or on its way out. Same height as
  // the signed-in card, so nothing moves when it arrives.
  if (session.status === "loading" || signingOut) return <Skeleton className="h-41 rounded-lg" />;
  if (session.status === "signedOut") {
    return (
      <Card padding="md" className="flex flex-col gap-3">
        <p className="type-body-sm text-secondary">Sign in to join a group.</p>
        <Button variant="primary" size="lg" onClick={() => session.login()}>
          Sign in
        </Button>
      </Card>
    );
  }

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="label-mono">Your account</p>
        {(isMock || session.mode === "mock") && <Badge tone="blue">Demo</Badge>}
      </div>
      <AccountMenu
        align="start"
        trigger={
          <Button variant="secondary" size="lg" className="w-full">
            Account
          </Button>
        }
      />
      <Button variant="ghost" size="md" className="w-full" onClick={() => void signOut()}>
        <LogOut /> Sign out
      </Button>
    </Card>
  );
}
