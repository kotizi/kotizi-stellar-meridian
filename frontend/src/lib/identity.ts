// Checks for the identity verification form (demo). They run on this device only: the details
// are never sent or stored, the backend approves the wallet alone.

export interface IdentityDetails {
  fullName: string;
  /** Brazilian CPF, masked (`000.000.000-00`) or digits only. Other documents only if the product asks. */
  cpf: string;
  /** `YYYY-MM-DD`, as an `<input type="date">` gives it. */
  birthDate: string;
}

export type IdentityErrors = Partial<Record<keyof IdentityDetails, string>>;

const MIN_AGE = 18;

/**
 * Bounds of the date-of-birth field. Browsers let the year run to 6 digits unless the input has a
 * `max`, and then cap it at the digits of the max's year: a fixed 4-digit one keeps the field
 * static (no "today" at render); future and under-age dates are refused by `validateIdentity`.
 */
export const BIRTH_DATE_MIN = "1900-01-01";
export const BIRTH_DATE_MAX = "9999-12-31";

/** Masks what's typed as a CPF (`000.000.000-00`): digits only, at most 11. */
export function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** Whole years between `birthDate` (`YYYY-MM-DD`) and `today`; null when the date isn't valid. */
export function ageOn(birthDate: string, today: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const [ty, tm, td] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  return ty - year - (tm < month || (tm === month && td < day) ? 1 : 0);
}

export function validateIdentity(details: IdentityDetails, today: Date): IdentityErrors {
  const errors: IdentityErrors = {};

  const words = details.fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.some((w) => !/^[\p{L}'.-]+$/u.test(w))) {
    errors.fullName = "Enter your full name, as on your document";
  }

  // Demo verification: any 11 digits pass (user decision, 2026-10-11). A real KYC provider checks
  // the CPF itself, check digits included.
  if (details.cpf.replace(/\D/g, "").length !== 11) errors.cpf = "Enter your 11-digit CPF";

  const age = ageOn(details.birthDate, today);
  if (age === null || age < 0 || details.birthDate < BIRTH_DATE_MIN) errors.birthDate = "Enter a valid date of birth";
  else if (age < MIN_AGE) errors.birthDate = `You must be at least ${MIN_AGE} years old`;

  return errors;
}
