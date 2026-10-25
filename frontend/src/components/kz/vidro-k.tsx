import { cn } from "@/lib/utils";

// Original path of the K symbol (design/simbolo.svg). Never redraw, rotate freely or recolor it.
const K_PATH =
  "M52.8856 84.9317L127.492 10.7523V76.3977L108.625 95.1722L180 165.813H113.704L52.8856 105.232V166L0 113.559V0H52.8856V84.9317Z";

/**
 * Translucent K with a 1px white stroke ("vidrio", brandbook 6.3). Decorative: place it inside a
 * `relative overflow-hidden isolate` container with `absolute -z-10`, bleeding past an edge.
 */
export function VidroK({
  className,
  fill = "rgba(182,182,240,0.16)",
  stroke = "rgba(255,255,255,0.85)",
}: {
  className?: string;
  fill?: string;
  stroke?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 180 166" className={cn("overflow-visible", className)}>
      <path d={K_PATH} fill={fill} stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Solid white K seal for blue surfaces and headers. Decorative; set the width with `className`. */
export function KSeal({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 180 166" className={cn("fill-white", className)}>
      <path d={K_PATH} />
    </svg>
  );
}

/** App icon: Kotizi blue square with light in the lower-left corner and the white symbol. */
export function AppIcon({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("app-icon flex size-16 items-center justify-center rounded-lg", className)}>
      <KSeal className="w-[30px]" />
    </div>
  );
}
