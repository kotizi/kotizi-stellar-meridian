"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { useIsAdmin } from "../hooks/use-admin";
import { buttonVariants } from "@/components/ui/button";

/** "Create group", only for the program's admin. */
export function CreateGroupLink({ className }: { className?: string }) {
  if (!useIsAdmin()) return null;
  return (
    <Link href="/admin/groups/new" className={buttonVariants({ variant: "secondary", size: "md", className })}>
      <Plus /> Create group
    </Link>
  );
}
