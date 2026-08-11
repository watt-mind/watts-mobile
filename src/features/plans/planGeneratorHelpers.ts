import { localDateKey, localDateYmd } from '@/src/lib/date';
import { ymdToLocalEndOfDayIso, ymdToLocalStartOfDayIso } from '@/src/lib/wireDate';

import type { AvailabilityDay } from './api';
import type { PlanInitializeResult, PlanStrategy, StartingPhase, VolumePreference } from './types';

/** Web PlanWizard mapping: ≤5 LOW, ≥10 HIGH, else MID. */
export function volumePreferenceFromHours(hours: number): VolumePreference {
  if (hours <= 5) return 'LOW';
  if (hours >= 10) return 'HIGH';
  return 'MID';
}

export function clampVolumeHours(hours: number): number {
  if (!Number.isFinite(hours)) return 6;
  return Math.min(20, Math.max(3, Math.round(hours * 2) / 2));
}

export type PlanEndMode = 'goal' | 'duration';

export type PhaseGlance = {
  id: string;
  title: string;
  weeksLabel: string;
  rangeLabel: string | null;
  /** Plan block type for `blockTypeColor` accents (BASE, BUILD, …). */
  type: string | null;
};

/**
 * Local calendar YYYY-MM-DD → initialize/activate `startDate`.
 *
 * CW-493: `/api/plans/initialize` validates `z.string().datetime()` (so a bare
 * YYYY-MM-DD is rejected) and then re-derives the calendar day from the
 * instant using the athlete's stored timezone. A fixed UTC hour therefore
 * lands on the wrong day at the extremes — UTC noon is a day late at UTC+12,
 * UTC midnight a day early at UTC-5 — so the instant of *local* midnight is
 * sent, matching the web PlanWizard.
 */
export function planStartDateIso(ymd: string): string {
  return ymdToLocalStartOfDayIso(ymd);
}

/** @deprecated Misnomer since CW-493 — the anchor is local midnight, not UTC noon. Use `planStartDateIso`. */
export const planDateIsoNoon = planStartDateIso;

/** End-of-day ISO for initialize `endDate`, anchored to the athlete's local day (CW-493). */
export function planEndDateIso(ymd: string): string {
  return ymdToLocalEndOfDayIso(ymd);
}

export function addWeeksToYmd(ymd: string, weeks: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + Math.round(weeks) * 7);
  return localDateYmd(date);
}

export function clampDurationWeeks(weeks: number): number {
  if (!Number.isFinite(weeks)) return 12;
  return Math.min(52, Math.max(4, Math.round(weeks)));
}

/**
 * Whole weeks from start→end (calendar days / 7, floored).
 *
 * CW-485: measured on the UTC timeline built from the Y/M/D triples, never
 * from local-time millis — two local midnights either side of a DST spring
 * forward are only 6 days 23h apart, which used to drop an exact 4-week span
 * to 3 and block a legitimate plan.
 */
export function weeksBetweenYmd(startYmd: string, endYmd: string): number {
  return Math.floor(daysBetweenYmd(startYmd, endYmd) / 7);
}

/** Whole calendar days from start→end (0 when either side is unparseable or end < start). */
export function daysBetweenYmd(startYmd: string, endYmd: string): number {
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 0;
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  if (end < start) return 0;
  return Math.round((end - start) / 86400000);
}

export function resolvePlanEndDateYmd(input: {
  mode: PlanEndMode;
  startYmd: string;
  goalEndYmd: string | null | undefined;
  durationWeeks: number;
}): string | null {
  if (input.mode === 'duration') {
    return addWeeksToYmd(input.startYmd, clampDurationWeeks(input.durationWeeks));
  }
  const goalEnd = input.goalEndYmd?.trim() || null;
  return goalEnd && /^\d{4}-\d{2}-\d{2}$/.test(goalEnd) ? goalEnd : null;
}

/** Server initialize requires ≥4 weeks start→end. */
export function isPlanSpanValid(startYmd: string, endYmd: string): boolean {
  return weeksBetweenYmd(startYmd, endYmd) >= 4;
}

export function defaultSelectedGoalId(
  goalIds: string[],
  preferredId?: string | null,
  primaryId?: string | null,
): string | null {
  if (goalIds.length === 0) return null;
  if (goalIds.length === 1) return goalIds[0] ?? null;
  if (preferredId && goalIds.includes(preferredId)) return preferredId;
  if (primaryId && goalIds.includes(primaryId)) return primaryId;
  return goalIds[0] ?? null;
}

export function mapPhaseGlance(
  blocks: NonNullable<PlanInitializeResult['plan']>['blocks'] | undefined,
): PhaseGlance[] {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block, index) => {
      const id = typeof block.id === 'string' ? block.id : `block-${index}`;
      const name =
        (typeof block.name === 'string' && block.name.trim()) ||
        (typeof block.type === 'string' && block.type.trim()) ||
        `Phase ${index + 1}`;
      const weeks =
        typeof block.durationWeeks === 'number' && block.durationWeeks > 0
          ? block.durationWeeks
          : Array.isArray(block.weeks)
            ? block.weeks.length
            : 0;
      const startKey = localDateKey(block.startDate);
      let rangeLabel: string | null = null;
      if (startKey && weeks > 0) {
        const endKey = addWeeksToYmd(startKey, weeks);
        rangeLabel = `${startKey} → ${endKey}`;
      } else if (startKey) {
        rangeLabel = startKey;
      }
      const type = typeof block.type === 'string' && block.type.trim() ? block.type.trim() : null;
      return {
        id,
        title: name,
        weeksLabel: weeks > 0 ? `${weeks} wk` : '—',
        rangeLabel,
        type,
      };
    })
    .filter((b) => Boolean(b.title));
}

export const DURATION_WEEK_CHIPS = [8, 12, 16, 20, 24] as const;

/** Afternoon training slot so week gen does not treat the day as rest. */
export function buildAvailabilityDays(dayOfWeeks: number[], sports: string[]): AvailabilityDay[] {
  const activityTypes = sports.length > 0 ? sports : ['Ride'];
  const gymAccess = activityTypes.some((s) => /gym|weight/i.test(s));
  const bikeAccess = activityTypes.some((s) => /ride|bike/i.test(s));

  return dayOfWeeks.map((dayOfWeek) => ({
    dayOfWeek,
    morning: false,
    afternoon: true,
    evening: false,
    slots: [
      {
        name: 'Afternoon',
        startTime: '14:00',
        duration: 90,
        activityTypes,
        gymAccess,
        bikeAccess,
        indoorOnly: gymAccess && !bikeAccess,
      },
    ],
  }));
}

/** SVG path `d` for web PlanWizard strategy sparklines (viewBox 0 0 100 20). */
export const STRATEGY_SPARKLINE_PATHS: Record<PlanStrategy, string> = {
  LINEAR: 'M0 18 L20 15 L40 12 L60 8 L80 4 L100 0',
  POLARIZED: 'M0 18 L15 18 L20 2 L25 18 L40 18 L45 2 L50 18 L100 18',
  BLOCK: 'M0 15 L30 15 L30 5 L60 5 L60 15 L90 15 L90 2',
  UNDULATING: 'M0 10 Q25 0 50 10 T100 10',
  REVERSE: 'M0 0 L20 4 L40 8 L60 12 L80 15 L100 18',
  MAINTENANCE: 'M0 10 L100 10',
};

export const PLAN_STRATEGY_OPTIONS: {
  id: PlanStrategy;
  label: string;
  /** Short chip hint (legacy). */
  hint: string;
  /** Web PlanWizard card description. */
  description: string;
  sparklinePath: string;
}[] = [
  {
    id: 'LINEAR',
    label: 'Linear',
    hint: 'Steady progression',
    description: 'Steady progression. Classic approach.',
    sparklinePath: STRATEGY_SPARKLINE_PATHS.LINEAR,
  },
  {
    id: 'POLARIZED',
    label: 'Polarized',
    hint: 'Mostly easy, some hard',
    description: '80% Easy, 20% Hard. Max freshness.',
    sparklinePath: STRATEGY_SPARKLINE_PATHS.POLARIZED,
  },
  {
    id: 'BLOCK',
    label: 'Block',
    hint: 'Concentrated intensity',
    description: 'Concentrated intensity weeks. Advanced.',
    sparklinePath: STRATEGY_SPARKLINE_PATHS.BLOCK,
  },
  {
    id: 'UNDULATING',
    label: 'Undulating',
    hint: 'Varied daily focus',
    description: 'Varied daily focus. Prevents plateaus.',
    sparklinePath: STRATEGY_SPARKLINE_PATHS.UNDULATING,
  },
  {
    id: 'REVERSE',
    label: 'Reverse',
    hint: 'Hard early, long later',
    description: 'Intense first, then long. Ideal for Ironman/Ultras.',
    sparklinePath: STRATEGY_SPARKLINE_PATHS.REVERSE,
  },
  {
    id: 'MAINTENANCE',
    label: 'Maintenance',
    hint: 'Stay fit between goals',
    description: 'Steady load, no peak. Stay fit between goals.',
    sparklinePath: STRATEGY_SPARKLINE_PATHS.MAINTENANCE,
  },
];

export const RECOVERY_RHYTHM_OPTIONS: {
  id: number;
  /** Ratio chip, e.g. 3:1 */
  label: string;
  /** Short chip hint (legacy). */
  hint: string;
  /** Web card title (Return to Play, High Recovery, …). */
  title: string;
  /** Web long description (Masters / Pro copy). */
  description: string;
}[] = [
  {
    id: 2,
    label: '1:1',
    hint: 'Work · recover',
    title: 'Return to Play',
    description:
      '1 week build, 1 week recovery. Best for injury recovery or extreme intensity blocks.',
  },
  {
    id: 3,
    label: '2:1',
    hint: 'Two on · one off',
    title: 'High Recovery',
    description: '2 weeks build, 1 week rest. Ideal for Masters (45+) and high-stress lifestyles.',
  },
  {
    id: 4,
    label: '3:1',
    hint: 'Classic load cycle',
    title: 'Standard Build',
    description: '3 weeks build, 1 week rest. The classic standard for most healthy athletes.',
  },
  {
    id: 5,
    label: '4:1',
    hint: 'Longer load block',
    title: 'Professional',
    description:
      '4 weeks build, 1 week rest. Advanced pattern for high-volume, full-time athletes.',
  },
];

/** Web PlanWizard `recommendStrategy()` heuristics. */
export function recommendStrategy(input: {
  volumeHours: number;
  eventBased: boolean;
  weeksToGoal: number | null;
}): { strategy: PlanStrategy; rationale: string } {
  if (input.volumeHours > 10) {
    return {
      strategy: 'POLARIZED',
      rationale:
        'With high volume (>10h), Polarized is excellent for avoiding burnout while building huge aerobic capacity.',
    };
  }
  if (input.eventBased && input.weeksToGoal != null) {
    if (input.weeksToGoal < 8) {
      return {
        strategy: 'BLOCK',
        rationale:
          'With limited time (<8 weeks), Block periodization can provide a rapid fitness boost.',
      };
    }
    return {
      strategy: 'LINEAR',
      rationale: 'Linear periodization is the safest and most reliable way to peak for your event.',
    };
  }
  return {
    strategy: 'LINEAR',
    rationale: 'Linear periodization is the best starting point for most athletes.',
  };
}

export const STARTING_PHASE_OPTIONS: {
  id: StartingPhase;
  label: string;
  hint: string;
}[] = [
  { id: 'BASE', label: 'Fresh', hint: 'Start in Base' },
  { id: 'BUILD', label: 'Ready', hint: 'Skip into Build' },
  { id: 'PEAK', label: 'Race-ready', hint: 'Short Peak path' },
];

export const VOLUME_HOUR_CHIPS = [4, 5, 6, 8, 10, 12, 14, 16] as const;

/** Upper bound the first-week preview poller waits before giving up (see api.ts). */
export const PLAN_GENERATE_TIMEOUT_MS = 180_000;

/**
 * Progress copy for the plan "working" phase. Generation can legitimately take
 * minutes, so the panel must show that time is passing rather than a frozen
 * line of text.
 */
export function formatGenerateProgress(
  elapsedMs: number,
  timeoutMs: number = PLAN_GENERATE_TIMEOUT_MS,
): { elapsedLabel: string; hint: string } {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const elapsedLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;
  const remainingMs = Math.max(0, timeoutMs - elapsedMs);
  const hint =
    remainingMs === 0
      ? 'This is taking longer than expected — you can cancel and try again.'
      : elapsedMs >= 30_000
        ? 'Still working. Building a season can take a couple of minutes.'
        : 'This usually takes under a minute.';
  return { elapsedLabel, hint };
}
