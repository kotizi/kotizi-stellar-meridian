import { cn } from "@/lib/utils";

/** Contemplated share as three blocks. `null` = waiting ("–"). */
export function DrawDigits({ share, className }: { share: string | null; className?: string }) {
  const digits = share ? share.split("") : ["–", "–", "–"];
  return (
    <div role="img" className={cn("grid grid-cols-3 gap-2.5", className)} aria-label={share ? `Share ${share}` : "Not contemplated yet"}>
      {digits.map((d, i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            "flex aspect-[4/5] items-center justify-center rounded-lg border font-mono text-[64px] leading-none font-medium sm:text-[76px]",
            share ? "border-transparent bg-brand text-on-brand" : "border-subtle bg-surface/90 text-disabled",
          )}
        >
          {d}
        </div>
      ))}
    </div>
  );
}
