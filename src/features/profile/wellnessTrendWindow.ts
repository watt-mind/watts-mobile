import { localDateKey } from '@/src/features/today/weekGlance';

/**
 * Local-day window for the wellness trend baseline (CW-492).
 *
 * The baseline is "the 7 days *before* the latest wellness day", so the day
 * key and the range boundaries must both be the athlete's local calendar day.
 * Deriving them in UTC put an athlete at UTC+12 a day ahead of their own
 * "today": yesterday was excluded from the baseline and today was left inside
 * it, quietly diluting (and near midnight inverting) every trend.
 */
export function wellnessTrendWindow(latestDate: Date): {
  latestDateKey: string;
  startDateStr: string;
  endDateStr: string;
} {
  const key = localDateKey(latestDate) ?? localDateKey(new Date())!;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  // Local wall-clock boundaries; the Date constructor normalizes a negative
  // day-of-month across month/year edges.
  const start = new Date(y, m - 1, d - 8, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return {
    latestDateKey: key,
    startDateStr: start.toISOString(),
    endDateStr: end.toISOString(),
  };
}

/**
 * `fetchWellnessTrend` returns unvalidated JSON: `date` is a `YYYY-MM-DD`
 * day marker today, but a full timestamp would otherwise never match the day
 * key and would leave the latest day inside its own baseline forever.
 */
function wellnessRowDateKey(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return localDateKey(value) ?? '';
  return '';
}

/** Trend rows excluding the latest day, i.e. the prior-day baseline. */
export function priorWellnessHistory<T extends { date?: unknown }>(
  rows: readonly T[],
  latestDateKey: string,
): T[] {
  return rows.filter((row) => wellnessRowDateKey(row?.date) !== latestDateKey);
}
