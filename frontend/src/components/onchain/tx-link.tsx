"use client";

import { ArrowUpRight } from "lucide-react";

import { network } from "@/chain/network";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Short hash in lavender with an arrow, linking to the network's explorer. The mock's signatures and
 * addresses are fake (no explorer), so they render as plain text marked "mock".
 */
export function TxLink({
  value,
  kind = "tx",
  className,
}: {
  value: string;
  kind?: "tx" | "address";
  className?: string;
}) {
  const explorerUrl = network.explorerUrl;
  const label = shortAddress(value);
  if (!explorerUrl) {
    return (
      <span className={cn("type-mono-caption text-brand", className)} title={`${value} (mock)`}>
        {label} <span className="text-tertiary">· mock</span>
      </span>
    );
  }
  return (
    <a
      href={explorerUrl(kind, value)}
      target="_blank"
      rel="noreferrer"
      className={cn("focus-ring inline-flex items-center gap-0.5 rounded-sm type-mono-caption text-brand hover:text-brand-hover", className)}
    >
      {label}
      <ArrowUpRight className="size-3.5" />
    </a>
  );
}
