import type { ActivityListItem, PlannedListItem } from '@/src/features/activity/types';
import { localDateKey, weekRangeContaining } from '@/src/lib/date';

export type WeekDayBar = {
  /** Local YYYY-MM-DD */
  dateKey: string;
  /** Short weekday label (Mon, Tue, …) */
  weekday: string;
  /** 0–1 relative height for the tiny bar chart */
  height: number;
  /** True when any completed activity falls on this local day */
  hasDone: boolean;
  /** True when any planned session falls on this local day */
  hasPlanned: boolean;
};

export type WeekGlance = {
  doneDurationSec: number;
  doneTss: number;
  plannedTss: number;
  /** e.g. "4h 12m" */
  doneDurationLabel: string;
  summaryLine: string;
  days: WeekDayBar[];
};

function formatHoursMinutes(totalSec: number): string {
  if (totalSec <= 0) return '0m';
  const minutes = Math.round(totalSec / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function weekdayShort(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

/**
 * Thin weekly load glance from recent activities + upcoming/planned already on Today.
 * No CTL/form math — just duration/TSS sums and a 7-day presence bar.
 */
export function computeWeekGlance(
  recent: ActivityListItem[] | undefined,
  planned: PlannedListItem[] | undefined,
  now = new Date(),
): WeekGlance {
  const { keys } = weekRangeContaining(now);
  const keySet = new Set(keys);

  let doneDurationSec = 0;
  let doneTss = 0;
  const doneByDay = new Map<string, number>();
  const plannedByDay = new Map<string, number>();
  const plannedDays = new Set<string>();
  const doneDays = new Set<string>();

  for (const item of recent ?? []) {
    const key = localDateKey(item.date);
    if (!key || !keySet.has(key)) continue;
    const dur =
      item.durationSec != null && Number.isFinite(item.durationSec) ? item.durationSec : 0;
    const tss = item.tss != null && Number.isFinite(item.tss) ? item.tss : 0;
    doneDurationSec += dur;
    doneTss += tss;
    doneDays.add(key);
    // Prefer TSS; fall back to durationSec/36 (~TSS-ish) so bars share one unit with planned.
    const dayLoad = tss > 0 ? tss : dur > 0 ? dur / 36 : 0;
    doneByDay.set(key, (doneByDay.get(key) ?? 0) + dayLoad);
  }

  let plannedTss = 0;
  for (const item of planned ?? []) {
    const key = localDateKey(item.date);
    if (!key || !keySet.has(key)) continue;
    const tss = item.tss != null && Number.isFinite(item.tss) ? item.tss : 0;
    plannedTss += tss;
    plannedDays.add(key);
    plannedByDay.set(key, (plannedByDay.get(key) ?? 0) + Math.max(tss, 0));
  }

  const loads = keys.map((key) => (doneByDay.get(key) ?? 0) + (plannedByDay.get(key) ?? 0));
  const maxLoad = Math.max(...loads, 1);

  const days: WeekDayBar[] = keys.map((dateKey, i) => ({
    dateKey,
    weekday: weekdayShort(dateKey),
    height: loads[i]! / maxLoad,
    hasDone: doneDays.has(dateKey),
    hasPlanned: plannedDays.has(dateKey),
  }));

  const doneDurationLabel = formatHoursMinutes(doneDurationSec);
  const doneTssRounded = Math.round(doneTss);
  const plannedTssRounded = Math.round(plannedTss);

  let summaryLine: string;
  if (plannedTssRounded > 0) {
    summaryLine = `This week: ${doneDurationLabel} · ${doneTssRounded} TSS of ~${plannedTssRounded} planned`;
  } else if (doneDurationSec > 0 || doneTssRounded > 0) {
    summaryLine = `This week: ${doneDurationLabel} · ${doneTssRounded} TSS`;
  } else {
    summaryLine = 'This week: no load logged yet';
  }

  return {
    doneDurationSec,
    doneTss,
    plannedTss,
    doneDurationLabel,
    summaryLine,
    days,
  };
}

export type WeekGlanceStripState = { status: 'loading' } | { status: 'ready'; glance: WeekGlance };

/**
 * Decide what the Today "This week" strip renders. Kept pure (and out of the .tsx)
 * so the loading/ready decision is testable — the completed side is fed by the
 * date-ranged glance query, which is pending on first paint (CW-489).
 */
export function resolveWeekGlanceStripState(input: {
  workouts: ActivityListItem[] | undefined;
  planned: PlannedListItem[] | undefined;
  /** True while the week-ranged workouts query has no data yet. */
  workoutsPending: boolean;
  now?: Date;
}): WeekGlanceStripState {
  if (input.workouts == null && input.workoutsPending) return { status: 'loading' };
  return {
    status: 'ready',
    glance: computeWeekGlance(input.workouts, input.planned, input.now ?? new Date()),
  };
}
