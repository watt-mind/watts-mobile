import { Platform } from 'react-native';

import { localDateYmd, lookbackStartDate, eachLocalDateYmd } from '../mapToWellnessPayload';
import { canonicalSportFromHealthConnect, sportLabel } from '../sportTypes';
import type { DailyWellnessSample, HealthReadWindow, PlatformWorkoutSession } from '../types';
import { LOOKBACK_DAYS } from '../types';
import {
  bucketHealthConnectSleep,
  clipHcSleepSessionToWindow,
  dayWindowLocal,
  sleepWindowForDate,
  type HcSleepSession,
} from './sleepShared';
import {
  summarizeCadence,
  summarizeHeartRate,
  summarizePower,
  summarizeRoute,
  summarizeSpeed,
} from './workoutStreams';

function avg(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function latest(nums: { t: number; v: number }[]): number | undefined {
  if (!nums.length) return undefined;
  nums.sort((a, b) => b.t - a.t);
  return nums[0]?.v;
}

function resolveFrom(window: HealthReadWindow, today: Date): Date {
  const lookbackDays = window.lookbackDays ?? LOOKBACK_DAYS;
  const lookbackStart = lookbackStartDate(lookbackDays, today);
  if (window.from && window.from.getTime() > lookbackStart.getTime()) {
    const from = new Date(window.from);
    from.setHours(0, 0, 0, 0);
    return from;
  }
  return lookbackStart;
}

/**
 * Page ceiling. High enough that a full lookback of dense sample records (HR at
 * ~1/min for 14 days) drains completely; it exists only to bound a pathological
 * or looping pageToken, not to trim normal histories.
 */
const HC_MAX_PAGES = 400;

async function readHcRecords(
  HC: typeof import('react-native-health-connect'),
  recordType: string,
  start: Date,
  end: Date,
  pageSize = 100,
): Promise<unknown[]> {
  const out: unknown[] = [];
  let pageToken: string | undefined;
  let exhausted = false;
  try {
    for (let page = 0; page < HC_MAX_PAGES; page++) {
      const res = await HC.readRecords(recordType as never, {
        timeRangeFilter: {
          operator: 'between',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
        // Ascending so that if the page ceiling is ever hit, the truncation
        // falls at the recent end (re-read next pass) rather than silently
        // dropping the oldest records in the window.
        ascendingOrder: true,
        pageSize,
        ...(pageToken ? { pageToken } : {}),
      });
      const records = (res?.records ?? []) as unknown[];
      out.push(...records);
      pageToken = res?.pageToken || undefined;
      if (!pageToken || records.length === 0) {
        exhausted = true;
        break;
      }
    }
    if (!exhausted) {
      console.warn(
        `[HealthSync] ${recordType} hit the page ceiling (${HC_MAX_PAGES}) — window truncated`,
      );
    }
  } catch (err) {
    // Return whatever pages we already collected, but say so: a permission
    // denial and an empty store are otherwise indistinguishable here (CW-481).
    console.warn(
      `[HealthSync] ${recordType} read failed after ${out.length} record(s)`,
      err instanceof Error ? err.message : 'error',
    );
  }
  return out;
}

async function readHcAggregate(
  HC: typeof import('react-native-health-connect'),
  recordType: string,
  start: Date,
  end: Date,
): Promise<Record<string, unknown> | undefined> {
  try {
    return (await HC.aggregateRecord({
      recordType: recordType as never,
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    } as never)) as unknown as Record<string, unknown>;
  } catch (err) {
    console.warn(
      `[HealthSync] ${recordType} aggregate failed`,
      err instanceof Error ? err.message : 'error',
    );
    return undefined;
  }
}

/** Daily-aggregate record types read for the wellness sample. */
const HC_DAILY_AGGREGATE_TYPES = [
  'Steps',
  'Distance',
  'FloorsClimbed',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'BasalMetabolicRate',
  'ExerciseSession',
] as const;

type HcDailyAggregateType = (typeof HC_DAILY_AGGREGATE_TYPES)[number];
type HcAggregateRow = Record<string, unknown> | undefined;
/** recordType → local YMD → that day's aggregate row. */
type HcDailyAggregates = Map<HcDailyAggregateType, Map<string, HcAggregateRow>>;

/**
 * Fetch every daily aggregate for the whole window in one call per record type.
 *
 * The per-day path costs 7 binder round-trips × 14 lookback days; on Android the
 * sync pass runs inside a time-budgeted background task, where ~100 serial IPC
 * calls is real latency (CW-481). `aggregateGroupByPeriod` slices server-side.
 * Returns an empty map for any type the grouped call rejects, so the caller
 * transparently falls back to the per-day aggregate for that type.
 */
async function readHcDailyAggregates(
  HC: typeof import('react-native-health-connect'),
  start: Date,
  end: Date,
): Promise<HcDailyAggregates> {
  const byType: HcDailyAggregates = new Map();

  await Promise.all(
    HC_DAILY_AGGREGATE_TYPES.map(async (recordType) => {
      const byDate = new Map<string, HcAggregateRow>();
      byType.set(recordType, byDate);
      try {
        const groups = await HC.aggregateGroupByPeriod({
          recordType: recordType as never,
          timeRangeFilter: {
            operator: 'between',
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          },
          timeRangeSlicer: { period: 'DAYS', length: 1 },
        } as never);
        for (const group of (groups ?? []) as {
          startTime?: string;
          result?: Record<string, unknown>;
        }[]) {
          if (!group.startTime || !group.result) continue;
          // Health Connect returns local wall-clock bounds for a DAYS slicer.
          const date = localDateYmd(new Date(group.startTime));
          byDate.set(date, group.result);
        }
      } catch (err) {
        console.warn(
          `[HealthSync] ${recordType} grouped aggregate failed — falling back to per-day`,
          err instanceof Error ? err.message : 'error',
        );
        byType.delete(recordType);
      }
    }),
  );

  return byType;
}

export async function readHealthConnectWellness(
  window: HealthReadWindow = { lookbackDays: LOOKBACK_DAYS },
): Promise<DailyWellnessSample[]> {
  if (Platform.OS !== 'android') return [];

  const HC = await import('react-native-health-connect');
  const status = await HC.getSdkStatus();
  if (status !== HC.SdkAvailabilityStatus.SDK_AVAILABLE) return [];
  await HC.initialize();

  const today = new Date();
  const from = resolveFrom(window, today);
  const dates = eachLocalDateYmd(from, today);
  const rangeStart = new Date(from);
  rangeStart.setDate(rangeStart.getDate() - 1);
  rangeStart.setHours(12, 0, 0, 0);

  const [sleepRecs, weightRecs, rhrRecs, hrvRecs, bodyFatRecs, spo2Recs, respRecs, vo2Recs] =
    await Promise.all([
      readHcRecords(HC, 'SleepSession', rangeStart, today, 40),
      readHcRecords(HC, 'Weight', rangeStart, today, 40),
      readHcRecords(HC, 'RestingHeartRate', rangeStart, today, 40),
      readHcRecords(HC, 'HeartRateVariabilityRmssd', rangeStart, today, 40),
      readHcRecords(HC, 'BodyFat', rangeStart, today, 40),
      readHcRecords(HC, 'OxygenSaturation', rangeStart, today, 40),
      readHcRecords(HC, 'RespiratoryRate', rangeStart, today, 40),
      readHcRecords(HC, 'Vo2Max', rangeStart, today, 20),
    ]);

  // One grouped call per aggregate type for the whole window, instead of one
  // per type per day — see readHcDailyAggregates (CW-481).
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const dailyAggregates: HcDailyAggregates =
    firstDate && lastDate
      ? await readHcDailyAggregates(
          HC,
          dayWindowLocal(firstDate).start,
          dayWindowLocal(lastDate).end,
        )
      : new Map();

  const samples: DailyWellnessSample[] = [];

  for (const date of dates) {
    const sample: DailyWellnessSample = { date, platform: 'health_connect' };
    const { start: dayStart, end: dayEnd } = dayWindowLocal(date);
    const sleepWin = sleepWindowForDate(date);

    const sleepIntervals: HcSleepSession[] = [];
    for (const rec of sleepRecs) {
      const r = rec as {
        startTime?: string;
        endTime?: string;
        stages?: { startTime?: string; endTime?: string; stage?: number }[];
      };
      if (!r.startTime || !r.endTime) continue;
      const start = new Date(r.startTime).getTime();
      const end = new Date(r.endTime).getTime();
      // Clipped, not just filtered: a session crossing the noon boundary is
      // split between the two dates instead of counted in full on both (CW-480).
      const clipped = clipHcSleepSessionToWindow(
        { start, end, stages: r.stages },
        sleepWin.start.getTime(),
        sleepWin.end.getTime(),
      );
      if (clipped) sleepIntervals.push(clipped);
    }

    const sleepBucket = bucketHealthConnectSleep(sleepIntervals);
    if (sleepBucket) {
      sample.sleepSecs = sleepBucket.sleepSecs;
      sample.sleepHours = Math.round((sleepBucket.sleepSecs / 3600) * 10) / 10;
      sample.sleepDeepSecs = sleepBucket.sleepDeepSecs;
      sample.sleepRemSecs = sleepBucket.sleepRemSecs;
      sample.sleepLightSecs = sleepBucket.sleepLightSecs;
      sample.sleepAwakeSecs = sleepBucket.sleepAwakeSecs;
    }

    const inDay = (iso?: string) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
    };

    const rhrVals = rhrRecs
      .map((rec) => {
        const r = rec as { time?: string; beatsPerMinute?: number };
        if (!inDay(r.time) || r.beatsPerMinute == null) return null;
        return r.beatsPerMinute;
      })
      .filter((n): n is number => n != null);
    const rhr = avg(rhrVals);
    if (rhr != null) sample.restingHr = Math.round(rhr);

    const hrvVals = hrvRecs
      .map((rec) => {
        const r = rec as { time?: string; heartRateVariabilityMillis?: number };
        if (!inDay(r.time) || r.heartRateVariabilityMillis == null) return null;
        return r.heartRateVariabilityMillis;
      })
      .filter((n): n is number => n != null);
    const hrv = avg(hrvVals);
    if (hrv != null) sample.hrv = Math.round(hrv * 10) / 10;

    const weights = weightRecs
      .map((rec) => {
        const r = rec as { time?: string; weight?: { inKilograms?: number } };
        if (!inDay(r.time) || r.weight?.inKilograms == null) return null;
        return { t: new Date(r.time!).getTime(), v: r.weight.inKilograms };
      })
      .filter((x): x is { t: number; v: number } => x != null);
    const w = latest(weights);
    if (w != null) sample.weight = Math.round(w * 10) / 10;

    const fats = bodyFatRecs
      .map((rec) => {
        const r = rec as { time?: string; percentage?: number };
        if (!inDay(r.time) || r.percentage == null) return null;
        return { t: new Date(r.time!).getTime(), v: r.percentage };
      })
      .filter((x): x is { t: number; v: number } => x != null);
    const bf = latest(fats);
    if (bf != null) sample.bodyFat = Math.round(bf * 10) / 10;

    const spo2Vals = spo2Recs
      .map((rec) => {
        const r = rec as { time?: string; percentage?: number };
        if (!inDay(r.time) || r.percentage == null) return null;
        return r.percentage;
      })
      .filter((n): n is number => n != null);
    const spo2 = avg(spo2Vals);
    if (spo2 != null) sample.spO2 = Math.round(spo2 * 10) / 10;

    const respVals = respRecs
      .map((rec) => {
        const r = rec as { time?: string; rate?: number };
        if (!inDay(r.time) || r.rate == null) return null;
        return r.rate;
      })
      .filter((n): n is number => n != null);
    const resp = avg(respVals);
    if (resp != null) sample.respiration = Math.round(resp * 10) / 10;

    const vo2s = vo2Recs
      .map((rec) => {
        const r = rec as { time?: string; vo2MillilitersPerMinuteKilogram?: number };
        if (!inDay(r.time) || r.vo2MillilitersPerMinuteKilogram == null) return null;
        return { t: new Date(r.time!).getTime(), v: r.vo2MillilitersPerMinuteKilogram };
      })
      .filter((x): x is { t: number; v: number } => x != null);
    const vo2 = latest(vo2s);
    if (vo2 != null) sample.vo2max = Math.round(vo2 * 10) / 10;

    // Grouped result when the batched call worked; per-day call only for types
    // it rejected (a type absent from the map, not merely absent for this day).
    const dailyAggregate = async (recordType: HcDailyAggregateType): Promise<HcAggregateRow> => {
      const grouped = dailyAggregates.get(recordType);
      if (grouped) return grouped.get(date);
      return readHcAggregate(HC, recordType, dayStart, dayEnd);
    };

    const [stepsAgg, distanceAgg, floorsAgg, activeAgg, totalAgg, basalAgg, exerciseAgg] =
      await Promise.all([
        dailyAggregate('Steps'),
        dailyAggregate('Distance'),
        dailyAggregate('FloorsClimbed'),
        dailyAggregate('ActiveCaloriesBurned'),
        dailyAggregate('TotalCaloriesBurned'),
        dailyAggregate('BasalMetabolicRate'),
        dailyAggregate('ExerciseSession'),
      ]);

    const steps = stepsAgg?.COUNT_TOTAL;
    if (typeof steps === 'number' && steps > 0) sample.steps = Math.round(steps);
    const distance = (distanceAgg?.DISTANCE as { inMeters?: number } | undefined)?.inMeters;
    if (typeof distance === 'number' && distance > 0) sample.distanceMeters = Math.round(distance);
    const floors = floorsAgg?.FLOORS_CLIMBED_TOTAL;
    if (typeof floors === 'number' && floors > 0) sample.floors = Math.round(floors);
    const active = (activeAgg?.ACTIVE_CALORIES_TOTAL as { inKilocalories?: number } | undefined)
      ?.inKilocalories;
    if (typeof active === 'number' && active > 0) sample.activeCaloriesBurned = Math.round(active);
    const total = (totalAgg?.ENERGY_TOTAL as { inKilocalories?: number } | undefined)
      ?.inKilocalories;
    if (typeof total === 'number' && total > 0) sample.totalCaloriesBurned = Math.round(total);
    const basal = (basalAgg?.BASAL_CALORIES_TOTAL as { inKilocalories?: number } | undefined)
      ?.inKilocalories;
    if (typeof basal === 'number' && basal > 0) sample.restingCaloriesBurned = Math.round(basal);
    const exerciseSeconds = (
      exerciseAgg?.EXERCISE_DURATION_TOTAL as { inSeconds?: number } | undefined
    )?.inSeconds;
    if (typeof exerciseSeconds === 'number' && exerciseSeconds > 0) {
      sample.exerciseMinutes = Math.round(exerciseSeconds / 60);
    }

    samples.push(sample);
  }

  return samples;
}

export async function readHealthConnectWorkouts(
  window: HealthReadWindow = { lookbackDays: LOOKBACK_DAYS },
): Promise<PlatformWorkoutSession[]> {
  if (Platform.OS !== 'android') return [];

  const HC = await import('react-native-health-connect');
  const status = await HC.getSdkStatus();
  if (status !== HC.SdkAvailabilityStatus.SDK_AVAILABLE) return [];
  await HC.initialize();

  const today = new Date();
  const from = resolveFrom(window, today);
  const [recs, hrRecs, powerRecs, speedRecs, cadenceRecs, stepsCadenceRecs] = await Promise.all([
    readHcRecords(HC, 'ExerciseSession', from, today, 50),
    readHcRecords(HC, 'HeartRate', from, today, 500),
    readHcRecords(HC, 'Power', from, today, 500),
    readHcRecords(HC, 'Speed', from, today, 500),
    readHcRecords(HC, 'CyclingPedalingCadence', from, today, 500),
    readHcRecords(HC, 'StepsCadence', from, today, 500),
  ]);

  const hrSamples: { t: number; bpm: number }[] = [];
  for (const rec of hrRecs) {
    const r = rec as { samples?: { time?: string; beatsPerMinute?: number }[] };
    for (const s of r.samples ?? []) {
      if (!s.time || s.beatsPerMinute == null) continue;
      hrSamples.push({ t: new Date(s.time).getTime(), bpm: s.beatsPerMinute });
    }
  }

  const powerSamples: { t: number; watts: number }[] = [];
  for (const rec of powerRecs) {
    const r = rec as {
      samples?: { time?: string; power?: { inWatts?: number } }[];
      startTime?: string;
      power?: { inWatts?: number };
    };
    if (r.samples?.length) {
      for (const s of r.samples) {
        if (!s.time || s.power?.inWatts == null) continue;
        powerSamples.push({ t: new Date(s.time).getTime(), watts: s.power.inWatts });
      }
    } else if (r.startTime && r.power?.inWatts != null) {
      powerSamples.push({ t: new Date(r.startTime).getTime(), watts: r.power.inWatts });
    }
  }

  const speedSamples: { t: number; mps: number }[] = [];
  for (const rec of speedRecs) {
    const r = rec as {
      samples?: { time?: string; speed?: { inMetersPerSecond?: number } }[];
    };
    for (const s of r.samples ?? []) {
      if (!s.time || s.speed?.inMetersPerSecond == null) continue;
      speedSamples.push({ t: new Date(s.time).getTime(), mps: s.speed.inMetersPerSecond });
    }
  }

  // Kept apart, not concatenated: CyclingPedalingCadence is crank rpm and
  // StepsCadence is steps/min. Merging them puts two different units in one
  // series, so a session covered by both sources reports nonsense (CW-481).
  // Per session, cycling cadence wins and steps cadence is the fallback.
  const cyclingCadenceSamples: { t: number; rpm: number }[] = [];
  for (const rec of cadenceRecs) {
    const r = rec as { samples?: { time?: string; revolutionsPerMinute?: number }[] };
    for (const s of r.samples ?? []) {
      if (!s.time || s.revolutionsPerMinute == null) continue;
      cyclingCadenceSamples.push({ t: new Date(s.time).getTime(), rpm: s.revolutionsPerMinute });
    }
  }
  const stepsCadenceSamples: { t: number; rpm: number }[] = [];
  for (const rec of stepsCadenceRecs) {
    const r = rec as { samples?: { time?: string; rate?: number }[] };
    for (const s of r.samples ?? []) {
      if (!s.time || s.rate == null) continue;
      stepsCadenceSamples.push({ t: new Date(s.time).getTime(), rpm: s.rate });
    }
  }

  const out: PlatformWorkoutSession[] = [];
  for (const rec of recs) {
    const r = rec as {
      startTime?: string;
      endTime?: string;
      metadata?: { id?: string };
      exerciseType?: number;
      title?: string;
      laps?: { startTime?: string; endTime?: string; length?: { inMeters?: number } }[];
      exerciseRoute?: {
        type?: number;
        route?: {
          time?: string;
          latitude?: number;
          longitude?: number;
          altitude?: { inMeters?: number };
        }[];
      };
    };
    if (!r.startTime) continue;
    const start = new Date(r.startTime);
    const end = r.endTime ? new Date(r.endTime) : undefined;
    const durationSec =
      end != null ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)) : undefined;
    const platformSessionId =
      r.metadata?.id ?? `hc-${start.toISOString()}-${r.exerciseType ?? 'ex'}`;
    const canonical = canonicalSportFromHealthConnect(r.exerciseType);
    const windowEnd = end?.getTime() ?? start.getTime();
    // Aggregate through Health Connect so overlapping device/app records use
    // the platform's de-duplication rules rather than a raw-record sum.
    const [distanceAgg, calorieAgg] = await Promise.all([
      readHcAggregate(HC, 'Distance', start, end ?? start),
      readHcAggregate(HC, 'ActiveCaloriesBurned', start, end ?? start),
    ]);
    const distanceMeters = (distanceAgg?.DISTANCE as { inMeters?: number } | undefined)?.inMeters;
    const activeCalories = (
      calorieAgg?.ACTIVE_CALORIES_TOTAL as { inKilocalories?: number } | undefined
    )?.inKilocalories;
    const sessionHr = summarizeHeartRate(
      hrSamples.filter((s) => s.t >= start.getTime() && s.t <= windowEnd),
    );
    const sessionPower = summarizePower(
      powerSamples.filter((s) => s.t >= start.getTime() && s.t <= windowEnd),
    );
    const inSession = (s: { t: number }) => s.t >= start.getTime() && s.t <= windowEnd;
    const sessionCyclingCadence = cyclingCadenceSamples.filter(inSession);
    const sessionCadence = summarizeCadence(
      sessionCyclingCadence.length ? sessionCyclingCadence : stepsCadenceSamples.filter(inSession),
    );
    const sessionSpeed = summarizeSpeed(
      speedSamples.filter((s) => s.t >= start.getTime() && s.t <= windowEnd),
    );

    // Bulk route read via READ_EXERCISE_ROUTES, declared in app.json and granted
    // from the Health Connect settings screen — react-native-health-connect has no
    // read-route permission to request in-app. Deliberately no
    // `requestExerciseRoute` fallback: that API prompts per record, which would
    // mean one system dialog per workout during a pass (and always fails in the
    // background). Without the grant, routes are simply omitted.
    let routeLocs: { t: number; lat: number; lon: number; altitudeMeters?: number }[] = [];
    if (r.exerciseRoute?.route?.length) {
      routeLocs = r.exerciseRoute.route
        .filter((p) => p.time != null && p.latitude != null && p.longitude != null)
        .map((p) => ({
          t: new Date(p.time!).getTime(),
          lat: p.latitude!,
          lon: p.longitude!,
          altitudeMeters: p.altitude?.inMeters,
        }));
    }

    const laps = (r.laps ?? [])
      .filter((l) => l.startTime && l.endTime)
      .map((l) => ({
        startedAt: new Date(l.startTime!).toISOString(),
        endedAt: new Date(l.endTime!).toISOString(),
        distanceMeters: l.length?.inMeters != null ? Math.round(l.length.inMeters) : undefined,
      }));

    out.push({
      platformSessionId,
      platform: 'health_connect',
      startedAt: start.toISOString(),
      endedAt: end?.toISOString(),
      durationSec,
      sportType: canonical ?? (r.exerciseType != null ? String(r.exerciseType) : undefined),
      title: r.title ?? sportLabel(canonical),
      activeCalories: activeCalories != null ? Math.round(activeCalories) : undefined,
      distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : undefined,
      avgHeartRate: sessionHr.avg,
      maxHeartRate: sessionHr.max,
      avgPower: sessionPower.avg,
      heartRateSamples: sessionHr.samples,
      powerSamples: sessionPower.samples,
      cadenceSamples: sessionCadence.samples,
      speedSamples: sessionSpeed.samples,
      routePoints: summarizeRoute(routeLocs).samples,
      laps: laps.length ? laps : undefined,
    });
  }
  return out;
}

export function healthConnectTodayLabel(): string {
  return localDateYmd();
}
