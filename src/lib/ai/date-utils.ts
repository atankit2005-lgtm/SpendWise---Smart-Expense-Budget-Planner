import { formatDateUTC, normalizeDate } from "@/lib/financial-engine";

/** yyyy-mm-dd -> a Date at UTC midnight, safe for arithmetic. */
export function toUTCDate(value: string): Date {
  const normalized = normalizeDate(value);
  return new Date(`${normalized}T00:00:00.000Z`);
}

/** "yyyy-mm" bucket key for a date string. */
export function monthKey(value: string): string {
  return normalizeDate(value).slice(0, 7);
}

/** Whole-day difference between two yyyy-mm-dd dates (end - start). */
export function daysBetween(start: string, end: string): number {
  const ms = toUTCDate(end).getTime() - toUTCDate(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function addDays(value: string, days: number): string {
  const date = toUTCDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateUTC(date);
}

/** 0 = Monday ... 6 = Sunday, ISO-style, so weekend checks are locale independent. */
export function isWeekend(value: string): boolean {
  const day = toUTCDate(value).getUTCDay();
  return day === 0 || day === 6;
}

/** The first day of the month for a given reference date, as yyyy-mm-dd. */
export function startOfMonth(date: Date): string {
  return formatDateUTC(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

/** The last N complete calendar months before (and including) the reference month,
 *  returned oldest -> newest as "yyyy-mm" keys. The in-progress reference month is
 *  excluded so forecasts are built only from completed periods. */
export function trailingCompleteMonthKeys(referenceDate: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count; i >= 1; i -= 1) {
    const d = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - i, 1),
    );
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
