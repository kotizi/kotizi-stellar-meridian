const USDC_DECIMALS = 6n;
const UNIT = 10n ** USDC_DECIMALS;
const thousands = new Intl.NumberFormat("en-US");

/** USDC base units -> "1,250.00". */
export function formatUsdc(amount: bigint, { decimals = 2 }: { decimals?: number } = {}): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(Number(USDC_DECIMALS), "0").slice(0, decimals);
  return `${negative ? "-" : ""}${thousands.format(whole)}${decimals > 0 ? `.${frac}` : ""}`;
}

/** USD amount -> USDC base units: 1.5 -> 1_500_000n. */
export const usdc = (n: number) => BigInt(Math.round(n * Number(UNIT)));

export const shortAddress = (address: string, size = 4) =>
  `${address.slice(0, size)}…${address.slice(-size)}`;

export function formatDuration(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

export function formatPeriod(secs: number): string {
  if (secs % 2_592_000 === 0) return secs === 2_592_000 ? "monthly" : `every ${secs / 2_592_000} months`;
  if (secs % 86_400 === 0) return secs === 86_400 ? "daily" : `every ${secs / 86_400} days`;
  if (secs % 3_600 === 0) return `every ${secs / 3_600} h`;
  if (secs % 60 === 0) return `every ${secs / 60} min`;
  return `every ${secs} s`;
}

/** Share number always with 3 digits: index 40 -> "041". */
export const formatShare = (index: number) => String(index + 1).padStart(3, "0");

/** "1 share", "2 shares": a count with its noun (regular English plural). */
export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Shares in a sentence: "share 002", "shares 002 and 004", "shares 001, 002 and 004"; past three,
 * "shares 001, 002, 003 and 5 more" (groups have up to 64).
 */
export function formatShares(indexes: number[]): string {
  const numbers = indexes.map(formatShare);
  if (numbers.length === 0) return "no share";
  if (numbers.length === 1) return `share ${numbers[0]}`;
  const last = numbers.length > 4 ? `${numbers.length - 3} more` : numbers.at(-1);
  return `shares ${numbers.slice(0, Math.min(3, numbers.length - 1)).join(", ")} and ${last}`;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Short mono date: "NOV 15 · 20:00". */
export function formatDateMono(unixSecs: number): string {
  const d = new Date(unixSecs * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${hh}:${mm}`;
}

/**
 * When the next draw is: its date, or "Due now" once that time has passed (the draw then waits for
 * an eligible payment). `now` is 0 during prerender, which shows the date.
 */
export function formatNextDraw(unixSecs: number, now: number): string {
  return now > 0 && now >= unixSecs ? "Due now" : formatDateMono(unixSecs);
}
