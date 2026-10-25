import { Coins, Landmark, QrCode, type LucideIcon } from "lucide-react";

import { network } from "@/chain/network";
import { SurfaceList, SurfaceRow } from "@/components/kz/surface-list";

export type DepositMethod = "bank" | "pix" | "crypto";

/**
 * How the checkout takes the money, as a production app would offer it. The app keeps no balance:
 * each payment brings its own deposit. On test networks every method is fulfilled by the network's
 * faucet (`testing.depositShortfall`); the instructions below are mock data.
 */
export const DEPOSIT_METHODS: Record<DepositMethod, { icon: LucideIcon; label: string; hint: string; description: string }> = {
  bank: {
    icon: Landmark,
    label: "Bank transfer",
    hint: "1–2 business days",
    description: "Transfer from your bank account using the details below.",
  },
  pix: {
    icon: QrCode,
    label: "Pix",
    hint: "Instant · Brazil",
    description: "Scan the code or copy it into your bank's app.",
  },
  crypto: {
    icon: Coins,
    label: "Crypto",
    hint: "USDC · a few seconds",
    description: "Send USDC to your kotizi deposit address. 1 USDC = 1 USD.",
  },
};

/** The method's instructions (mock data: every method is fulfilled by the test network's faucet). */
export function MethodDetails({ method, seed }: { method: DepositMethod; seed: string }) {
  const reference = `KZ-${seed.slice(0, 6).toUpperCase()}`;
  switch (method) {
    case "bank":
      return (
        <SurfaceList>
          <SurfaceRow label="Beneficiary" value="kotizi Payments" />
          <SurfaceRow label="Bank" value="kotizi partner bank" />
          <SurfaceRow label="Branch · Account" value="0001 · 12345-6" />
          <SurfaceRow label="Reference" value={reference} />
        </SurfaceList>
      );
    case "pix":
      return (
        <div className="flex items-center gap-4 rounded-lg border border-subtle p-4">
          <FakeQr seed={seed} className="size-28 shrink-0 rounded-sm bg-white p-2 text-graphite" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="label-mono">Pix copy and paste</span>
            <code className="type-mono-caption break-all text-secondary">
              00020126580014br.gov.bcb.pix0136kotizi-{reference.toLowerCase()}5204000053039865802BR6304A1F3
            </code>
          </div>
        </div>
      );
    case "crypto":
      return (
        <SurfaceList>
          <SurfaceRow label="Asset" value="USDC" />
          <SurfaceRow label="Network" value={network.name} />
          <SurfaceRow label="Arrives in" value="~ a few seconds" />
        </SurfaceList>
      );
  }
}

/** Decorative QR-like grid (21×21 with the three finder squares), derived from `seed`. Not scannable. */
function FakeQr({ seed, className }: { seed: string; className?: string }) {
  const size = 21;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const cells: [number, number][] = [];
  const finder = (x: number, y: number) =>
    [0, size - 7].some((ox) =>
      [0, size - 7].some((oy) => !(ox && oy) && x >= ox && x < ox + 7 && y >= oy && y < oy + 7),
    );
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (finder(x, y)) continue;
      h = Math.imul(h ^ (x * 31 + y), 2654435761);
      if ((h >>> 16) & 1) cells.push([x, y]);
    }
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} aria-label="Pix QR code" role="img">
      {[
        [0, 0],
        [size - 7, 0],
        [0, size - 7],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`} fill="currentColor">
          <path d={`M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z`} fillRule="evenodd" />
          <rect x={x + 2} y={y + 2} width={3} height={3} />
        </g>
      ))}
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}
