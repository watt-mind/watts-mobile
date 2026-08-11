import { mergeIntervalDurationMs } from '@/src/features/log/sleepIntervals';

/** HealthKit asleep category values (core/deep/rem/asleepUnspecified). */
export const HK_ASLEEP_UNSPECIFIED = 1;
/** HKCategoryValueSleepAnalysis.awake — in the sleep window but not asleep. */
export const HK_AWAKE = 2;
export const HK_STAGE_VALUES = new Set([3, 4, 5]); // core / deep / rem
export const HK_ALL_ASLEEP = new Set([HK_ASLEEP_UNSPECIFIED, 3, 4, 5]);

export type SleepStageBucket = {
  sleepSecs: number;
  sleepDeepSecs?: number;
  sleepRemSecs?: number;
  sleepLightSecs?: number;
  sleepAwakeSecs?: number;
};

export function sleepSecsFromIntervals(intervals: { start: number; end: number }[]): number {
  const ms = mergeIntervalDurationMs(intervals);
  return ms > 0 ? Math.round(ms / 1000) : 0;
}

/** Prefer stage samples when present so watch stages + phone "asleep" don't double-count. */
export function filterHealthKitSleepSamples(
  samples: { value: number; start: number; end: number }[],
): { value: number; start: number; end: number }[] {
  const parsed = samples.filter((s) => HK_ALL_ASLEEP.has(s.value) && s.end > s.start);
  const hasStages = parsed.some((s) => HK_STAGE_VALUES.has(s.value));
  return hasStages ? parsed.filter((s) => HK_STAGE_VALUES.has(s.value)) : parsed;
}

export function bucketHealthKitSleep(
  samples: { value: number; start: number; end: number }[],
): SleepStageBucket | null {
  const accepted = filterHealthKitSleepSamples(samples);
  if (!accepted.length) return null;

  const sleepSecs = sleepSecsFromIntervals(accepted.map((s) => ({ start: s.start, end: s.end })));
  if (sleepSecs <= 0) return null;

  const deep = sleepSecsFromIntervals(accepted.filter((s) => s.value === 4));
  const rem = sleepSecsFromIntervals(accepted.filter((s) => s.value === 5));
  const light = sleepSecsFromIntervals(accepted.filter((s) => s.value === 3));
  // Awake segments are excluded from time asleep but reported alongside it, so
  // the iOS payload carries the same stage set Health Connect already sends.
  const awake = sleepSecsFromIntervals(
    samples.filter((s) => s.value === HK_AWAKE && s.end > s.start),
  );

  return {
    sleepSecs,
    sleepDeepSecs: deep || undefined,
    sleepRemSecs: rem || undefined,
    sleepLightSecs: light || undefined,
    sleepAwakeSecs: awake || undefined,
  };
}

/** Health Connect SleepSessionRecord stage types. */
export const HC_STAGE_AWAKE = 1;
export const HC_STAGE_SLEEPING = 2;
export const HC_STAGE_LIGHT = 4;
export const HC_STAGE_DEEP = 5;
export const HC_STAGE_REM = 6;

/** Stages counting toward time asleep. AWAKE / OUT_OF_BED / AWAKE_IN_BED are excluded. */
const HC_ASLEEP_STAGES = new Set([HC_STAGE_SLEEPING, HC_STAGE_LIGHT, HC_STAGE_DEEP, HC_STAGE_REM]);

export type HcSleepSession = {
  start: number;
  end: number;
  stages?: { startTime?: string; endTime?: string; stage?: number }[];
};

/**
 * Clip a sleep session (and its stages) to a date's attribution window.
 *
 * `sleepWindowForDate` returns abutting noon-to-noon windows, and a session is
 * selected for a date when it *intersects* that window. Without clipping, a
 * session that crosses noon — a shift worker sleeping 08:00–15:00, a long
 * afternoon nap — is counted in full against both adjacent dates (CW-480).
 * Clipping splits it at the boundary instead: the pre-noon part belongs to the
 * earlier date, the post-noon part to the later one.
 *
 * Returns null when nothing of the session falls inside the window.
 */
export function clipHcSleepSessionToWindow(
  session: HcSleepSession,
  windowStart: number,
  windowEnd: number,
): HcSleepSession | null {
  const start = Math.max(session.start, windowStart);
  const end = Math.min(session.end, windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  if (!session.stages) return { start, end };

  const stages = session.stages.flatMap((stage) => {
    if (!stage.startTime || !stage.endTime || stage.stage == null) return [];
    const stageStart = new Date(stage.startTime).getTime();
    const stageEnd = new Date(stage.endTime).getTime();
    if (!Number.isFinite(stageStart) || !Number.isFinite(stageEnd)) return [];
    const clippedStart = Math.max(stageStart, windowStart);
    const clippedEnd = Math.min(stageEnd, windowEnd);
    if (clippedEnd <= clippedStart) return [];
    return [
      {
        startTime: new Date(clippedStart).toISOString(),
        endTime: new Date(clippedEnd).toISOString(),
        stage: stage.stage,
      },
    ];
  });

  return { start, end, stages };
}

/**
 * Bucket Health Connect sleep into merged stage durations.
 *
 * Every bucket merges overlapping intervals rather than summing raw durations —
 * two apps writing the same night (watch + phone) would otherwise double-count.
 * Falls back to the merged in-bed span only when no session carries stages.
 */
export function bucketHealthConnectSleep(sessions: HcSleepSession[]): SleepStageBucket | null {
  if (!sessions.length) return null;

  const byStage = new Map<number, { start: number; end: number }[]>();
  for (const session of sessions) {
    for (const stage of session.stages ?? []) {
      if (!stage.startTime || !stage.endTime || stage.stage == null) continue;
      const start = new Date(stage.startTime).getTime();
      const end = new Date(stage.endTime).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const bucket = byStage.get(stage.stage) ?? [];
      bucket.push({ start, end });
      byStage.set(stage.stage, bucket);
    }
  }

  const stageSecs = (stage: number) => sleepSecsFromIntervals(byStage.get(stage) ?? []);
  const asleepIntervals = [...byStage.entries()]
    .filter(([stage]) => HC_ASLEEP_STAGES.has(stage))
    .flatMap(([, intervals]) => intervals);

  // Merge across stage types too, so an overlap between e.g. a generic SLEEPING
  // block and a staged DEEP block from another source is counted once.
  const sleepSecs = asleepIntervals.length
    ? sleepSecsFromIntervals(asleepIntervals)
    : sleepSecsFromIntervals(sessions.map((s) => ({ start: s.start, end: s.end })));
  if (sleepSecs <= 0) return null;

  const deep = stageSecs(HC_STAGE_DEEP);
  const rem = stageSecs(HC_STAGE_REM);
  const light = stageSecs(HC_STAGE_LIGHT);
  const awake = stageSecs(HC_STAGE_AWAKE);

  return {
    sleepSecs,
    sleepDeepSecs: deep || undefined,
    sleepRemSecs: rem || undefined,
    sleepLightSecs: light || undefined,
    sleepAwakeSecs: awake || undefined,
  };
}

export function dayWindowLocal(dateYmd: string): { start: Date; end: Date } {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Sleep for a calendar day uses previous evening → next morning window.
 * The bounds are exactly 24h apart and abut the neighbouring days' windows;
 * combined with clipping at those bounds (see `clipHcSleepSessionToWindow`),
 * sleep crossing the boundary is split between the two dates rather than
 * counted twice.
 */
export function sleepWindowForDate(dateYmd: string): { start: Date; end: Date } {
  const [y, m, d] = dateYmd.split('-').map(Number);
  // From noon previous day to noon of date (covers overnight sleep attributed to wake day).
  const start = new Date(y, (m ?? 1) - 1, (d ?? 1) - 1, 12, 0, 0, 0);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  return { start, end };
}
