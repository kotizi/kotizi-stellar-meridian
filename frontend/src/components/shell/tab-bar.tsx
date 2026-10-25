"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

import { isActive, NAV } from "./nav";

/** Mobile bottom navigation: 84px, canvas, square icon (active = filled blue) + mono label. */
export function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 h-[84px] border-t border-subtle bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <Suspense fallback={<Tabs pathname="" />}>
        <ActiveTabs />
      </Suspense>
    </nav>
  );
}

function ActiveTabs() {
  return <Tabs pathname={usePathname()} />;
}

function Tabs({ pathname }: { pathname: string }) {
  return (
    <ul className="mx-auto grid h-full max-w-md grid-cols-4">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="focus-ring flex h-full flex-col items-center justify-center gap-2 rounded-md pb-3"
            >
              <span
                aria-hidden
                className={cn("size-5 rounded-xs", active ? "bg-brand" : "border-[1.8px] border-default")}
              />
              <span className={cn("label-mono", active && "text-primary")}>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
