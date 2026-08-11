/**
 * Shared pace conversion helpers.
 *
 * The API stores pace thresholds/targets in m/s. Humans think in mm:ss per
 * distance unit (km, mile, or 100m depending on sport). These helpers convert
 * between the two so every screen that shows or edits a pace value uses the
 * same math.
 *
 * The unit is always EXPLICIT (CW-483): a value can only be rendered or parsed
 * against a known reference distance, otherwise a swimmer's `1:45 /100m` and a
 * runner's `1:45 /km` collapse into the same (wrong) m/s.
 */

import { parseDecimal } from './parseDecimal';

/** Reference distance a mm:ss pace is measured over. */
export type PaceUnit = 'per-km' | 'per-mile' | 'per-100m';

/** Metres covered by one unit of pace. */
export const PACE_UNIT_METERS: Record<PaceUnit, number> = {
  'per-km': 1000,
  'per-mile': 1609.344,
  'per-100m': 100,
};

/** Suffix appended to a rendered pace, e.g. `5:15/km`. */
export function paceUnitSuffix(unit: PaceUnit): string {
  switch (unit) {
    case 'per-mile':
      return '/mi';
    case 'per-100m':
      return '/100m';
    default:
      return '/km';
  }
}

/** Field label / helper wording for a single resolved unit, e.g. `min/100m`. */
export function paceUnitLabel(unit: PaceUnit): string {
  switch (unit) {
    case 'per-mile':
      return 'min/mi';
    case 'per-100m':
      return 'min/100m';
    default:
      return 'min/km';
  }
}

/** Human name of the reference distance, e.g. `mile`. */
export function paceUnitDistanceName(unit: PaceUnit): string {
  switch (unit) {
    case 'per-mile':
      return 'mile';
    case 'per-100m':
      return '100 m';
    default:
      return 'km';
  }
}

/**
 * Format an m/s value as an `M:SS` label for the given unit. Optional suffix,
 * e.g. `/km`. Defaults to minutes-per-km so existing per-km call sites keep
 * their behaviour.
 */
export function mpsToPaceLabel(mps: number, suffix = '', unit: PaceUnit = 'per-km'): string {
  const minutesPerUnit = PACE_UNIT_METERS[unit] / (mps * 60);
  if (!Number.isFinite(minutesPerUnit) || minutesPerUnit <= 0) return `${mps.toFixed(2)} m/s`;
  const mins = Math.floor(minutesPerUnit);
  const secs = Math.round((minutesPerUnit - mins) * 60);
  const safeSecs = secs === 60 ? 0 : secs;
  const safeMins = secs === 60 ? mins + 1 : mins;
  return `${safeMins}:${String(safeSecs).padStart(2, '0')}${suffix}`;
}

/**
 * Parse a pace string back to m/s for the given unit. Accepts `mm:ss` (e.g.
 * "5:15") or a plain/decimal number of minutes (e.g. "5.25" / "5,25").
 * Returns undefined when the input isn't a valid positive pace.
 */
export function parsePaceToMps(value: string, unit: PaceUnit = 'per-km'): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const colonMatch = trimmed.match(/^(\d+):([0-5]?\d)$/);
  let totalMinutes: number;
  if (colonMatch) {
    const mins = Number(colonMatch[1]);
    const secs = Number(colonMatch[2]);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return undefined;
    totalMinutes = mins + secs / 60;
  } else {
    const n = parseDecimal(trimmed);
    if (n == null) return undefined;
    totalMinutes = n;
  }

  if (totalMinutes <= 0) return undefined;
  const mps = PACE_UNIT_METERS[unit] / (totalMinutes * 60);
  return Number.isFinite(mps) && mps > 0 ? mps : undefined;
}
