import { displayWeightToKg, kgToDisplayWeight } from '@/src/features/profile/mapProfile';
import type { WeightUnits } from '@/src/features/profile/types';
import { localDateYmd } from '@/src/lib/date';
import { parseDecimal } from '@/src/lib/parseDecimal';

import type { LogFormValues, WellnessDay, WellnessUploadPayload } from './types';
import { clampSubjectiveScore, normalizeStressScore } from './wellnessLabels';

/** True only for real calendar days (rejects JS-normalized values like 2026-02-31). */
export function isValidCalendarYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [year, month, day] = ymd.split('-').map((part) => Number(part));
  if (!year || !month || !day) return false;
  const local = new Date(year, month - 1, day);
  return local.getFullYear() === year && local.getMonth() === month - 1 && local.getDate() === day;
}

/** Local YYYY-MM-DD after adding calendar months (avoids UTC off-by-one from toISOString). */
export function addLocalMonthsYmd(monthsAhead: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setMonth(d.getMonth() + monthsAhead);
  return localDateYmd(d);
}

/**
 * Parse an optional numeric field. Comma decimals are accepted (CW-484): the
 * decimal-pad keyboard emits ',' as its only decimal key in comma-decimal
 * locales, so `Number("70,5")` used to be NaN and the weigh-in was dropped
 * while the sheet still reported "Saved".
 */
function parseOptionalNumber(value: string): number | undefined {
  const n = parseDecimal(value);
  return n == null ? undefined : n;
}

/**
 * Same non-negative floor the wellness stepper UI applies (see SleepDurationInput.tsx,
 * fixed under CW-136). Free-text entry bypasses the stepper's Math.max(0, ...) clamp, so
 * this mirrors it here to stop a manually typed negative value (e.g. "-3" sleep hours)
 * from being submitted as-is.
 */
function parseNonNegativeNumber(value: string): number | undefined {
  const n = parseOptionalNumber(value);
  return n == null ? undefined : Math.max(0, n);
}

/**
 * Step the sleep-hours field by `delta` (the −/+ 0.5 h stepper buttons).
 *
 * Shared by `SleepDurationInput` and the `onStep` callback in
 * `WellnessCheckinSheet` so the two cannot drift apart.
 *
 * The field is a `decimal-pad` TextInput, so on a comma-decimal device the typed
 * text is "7,5" and `Number("7,5")` is NaN — which used to fall through the
 * finite guard to a 0 base and silently rewrite seven and a half hours of sleep
 * as "0.5" on the first tap (CW-543). Parsing via `parseDecimal` (CW-484) keeps
 * the athlete's typed value, and matches how `toWellnessPayload` already reads
 * the very same string.
 *
 * Text that cannot be parsed at all still falls back to a 0 base; the result is
 * clamped at 0 and rounded to one decimal, exactly as before.
 */
export function stepSleepHours(current: string, delta: number): string {
  const parsed = parseDecimal(current);
  const base = parsed == null ? 0 : Math.max(0, parsed);
  return String(Math.max(0, Math.round((base + delta) * 10) / 10));
}

function asSubjective(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return clampSubjectiveScore(value);
}

/**
 * Fields that were filled in but cannot be parsed as numbers. Callers must block
 * the save and surface these instead of letting `toWellnessPayload` omit them —
 * a silently dropped weigh-in looks identical to a successful save.
 */
export function logFormInvalidFields(values: LogFormValues): ('sleepHours' | 'weight')[] {
  const invalid: ('sleepHours' | 'weight')[] = [];
  if (values.sleepHours.trim() && parseOptionalNumber(values.sleepHours) === undefined) {
    invalid.push('sleepHours');
  }
  if (values.weight.trim() && parseOptionalNumber(values.weight) === undefined) {
    invalid.push('weight');
  }
  return invalid;
}

export function formHasContent(values: LogFormValues): boolean {
  return Boolean(
    values.mood != null ||
    values.stress != null ||
    values.fatigue != null ||
    values.soreness != null ||
    values.sleepHours.trim() ||
    values.notes.trim() ||
    values.weight.trim(),
  );
}

/**
 * Build wellness upload payload. Weight is always sent in kg (server storage unit).
 * Pass `weightUnits` when the form field is in the athlete's display unit.
 */
export function toWellnessPayload(
  values: LogFormValues,
  date = localDateYmd(),
  weightUnits: WeightUnits = 'Kilograms',
): WellnessUploadPayload {
  const payload: WellnessUploadPayload = { date };

  if (values.mood != null) payload.mood = clampSubjectiveScore(values.mood);
  if (values.stress != null) payload.stress = clampSubjectiveScore(values.stress);
  if (values.fatigue != null) payload.fatigue = clampSubjectiveScore(values.fatigue);
  if (values.soreness != null) payload.soreness = clampSubjectiveScore(values.soreness);

  const sleepHours = parseNonNegativeNumber(values.sleepHours);
  const displayWeight = parseNonNegativeNumber(values.weight);

  if (sleepHours != null) payload.sleepHours = sleepHours;
  if (displayWeight != null) {
    payload.weight = displayWeightToKg(displayWeight, weightUnits);
  }
  if (values.notes.trim()) payload.comments = values.notes.trim();

  return payload;
}

export function emptyLogForm(): LogFormValues {
  return {
    mood: null,
    stress: null,
    fatigue: null,
    soreness: null,
    sleepHours: '',
    notes: '',
    weight: '',
  };
}

/** Hydrate form from server wellness (weight stored in kg → display units). */
export function formFromWellness(
  day: WellnessDay | null,
  weightUnits: WeightUnits = 'Kilograms',
): LogFormValues {
  if (!day) return emptyLogForm();
  const displayWeight = kgToDisplayWeight(day.weight, weightUnits);
  return {
    mood: day.mood,
    stress: day.stress,
    fatigue: day.fatigue,
    soreness: day.soreness,
    sleepHours: day.sleepHours != null ? String(day.sleepHours) : '',
    notes: day.comments ?? '',
    weight: displayWeight != null ? String(displayWeight) : '',
  };
}

export function pickTodayWellness(rows: unknown[], today = localDateYmd()): WellnessDay | null {
  if (!Array.isArray(rows)) return null;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const dateRaw = r.date;
    if (dateRaw == null) continue;
    const date = String(dateRaw).slice(0, 10);
    if (date !== today) continue;

    const stressRaw = typeof r.stress === 'number' ? normalizeStressScore(r.stress) : null;

    return {
      id: String(r.id ?? ''),
      date,
      mood: asSubjective(r.mood),
      stress: stressRaw != null ? clampSubjectiveScore(stressRaw) : null,
      fatigue: asSubjective(r.fatigue),
      soreness: asSubjective(r.soreness),
      sleepHours: typeof r.sleepHours === 'number' ? r.sleepHours : null,
      comments: typeof r.comments === 'string' ? r.comments : null,
      weight: typeof r.weight === 'number' ? r.weight : null,
    };
  }

  return null;
}
