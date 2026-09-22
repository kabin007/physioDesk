import { addDays, format, formatDistanceToNowStrict, parseISO } from "date-fns";

/**
 * Formatting rules:
 * - Date-only values ("2026-09-22") and times ("09:30") are clinic-local wall-clock values
 *   from the API. They are formatted as-is and never converted through a timezone.
 * - Instants (created_at, paid_at, ...) are UTC and displayed in the clinic's timezone,
 *   independent of the viewer's browser timezone.
 * - Money arrives as decimal strings and is formatted without floating-point maths.
 */

export const CLINIC_TIMEZONE = process.env.NEXT_PUBLIC_CLINIC_TIMEZONE ?? "Asia/Kathmandu";
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "NPR";

// --- Date-only values -------------------------------------------------------------------

/** Parse "YYYY-MM-DD" as a local calendar date (no timezone shift). */
export function parseDateOnly(value: string): Date {
  return parseISO(value);
}

export function toDateOnly(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function shiftDate(value: string, days: number): string {
  return toDateOnly(addDays(parseDateOnly(value), days));
}

/** "22 Sep 2026" */
export function formatDate(value: string): string {
  return format(parseDateOnly(value), "d MMM yyyy");
}

/** "Tuesday, 22 September 2026" */
export function formatLongDate(value: string): string {
  return format(parseDateOnly(value), "EEEE, d MMMM yyyy");
}

/** "Tue, 22 Sep" */
export function formatShortDate(value: string): string {
  return format(parseDateOnly(value), "EEE, d MMM");
}

/** Today's date in the clinic timezone, as "YYYY-MM-DD". */
export function clinicToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIMEZONE }).format(new Date());
}

// --- Times --------------------------------------------------------------------------------

/** "09:00–09:30" */
export function formatTimeRange(start: string, end: string): string {
  return `${start}–${end}`;
}

export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// --- Instants -----------------------------------------------------------------------------

const instantDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const instantDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "22 Sep 2026" in the clinic timezone. */
export function formatInstantDate(value: string): string {
  return instantDate.format(new Date(value));
}

/** "22 Sep 2026, 14:05" in the clinic timezone. */
export function formatInstantDateTime(value: string): string {
  return instantDateTime.format(new Date(value));
}

/** "3 days ago" */
export function formatRelative(value: string): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

// --- Money --------------------------------------------------------------------------------

const MONEY_PATTERN = /^-?\d+(\.\d+)?$/;

/** "1500.5" -> "NPR 1,500.50". String-based: no floating-point rounding. */
export function formatMoney(value: string | number): string {
  const text = String(value).trim();
  if (!MONEY_PATTERN.test(text)) return `${CURRENCY} —`;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${CURRENCY} ${grouped}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

/** Parse a user-entered amount into integer cents, or null if it isn't a valid amount. */
export function toCents(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
}

export function centsToString(cents: bigint): string {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  const whole = abs / BigInt(100);
  const fraction = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}
