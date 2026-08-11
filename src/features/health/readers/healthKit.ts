import type {
  FilterForSamples,
  QuantityTypeIdentifier,
  UnitForIdentifier,
  WorkoutProxyTyped,
} from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';

import { eachLocalDateYmd, lookbackStartDate } from '../mapToWellnessPayload';
import { canonicalSportFromHealthKit, sportLabel } from '../sportTypes';
import type { DailyWellnessSample, HealthReadWindow, PlatformWorkoutSession } from '../types';
import { LOOKBACK_DAYS } from '../types';
import { kilocalories, lapsFromWorkout, meters, seconds } from './healthKitShape';
import { bucketHealthKitSleep, dayWindowLocal, sleepWindowForDate } from './sleepShared';
import {
  summarizeCadence,
  summarizeHeartRate,
  summarizePower,
  summarizeRoute,
  summarizeSpeed,
} from './workoutStreams';

type HK = typeof import('@kingstinct/react-native-healthkit');
/** The untyped proxy the sample filter expects — not re-exported by name. */
type WorkoutFilterRef = NonNullable<FilterForSamples['workout']>;

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

async function avgQuantityForDay<T extends QuantityTypeIdentifier>(
  HK: HK,
  identifier: T,
  dayStart: Date,
  dayEnd: Date,
  unit: UnitForIdentifier<T>,
): Promise<number | undefined> {
  try {
    const result = await HK.queryStatisticsForQuantity(identifier, ['discreteAverage'], {
      unit,
      filter: {
        date: {
          startDate: dayStart,
          endDate: dayEnd,
        },
      },
    });
    const value = result.averageQuantity?.quantity;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Incremental samples (e.g. energy burned) must be summed, never averaged. */
async function sumQuantityForDay<T extends QuantityTypeIdentifier>(
  HK: HK,
  identifier: T,
  dayStart: Date,
  dayEnd: Date,
  unit: UnitForIdentifier<T>,
): Promise<number | undefined> {
  try {
    // HealthKit statistics apply its source de-duplication rules. Summing raw
    // samples can double-count overlapping phone/watch/app contributions.
    const result = await HK.queryStatisticsForQuantity(identifier, ['cumulativeSum'], {
      unit,
      filter: {
        date: {
          startDate: dayStart,
          endDate: dayEnd,
        },
      },
    });
    const value = result.sumQuantity?.quantity;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function latestQuantityForDay<T extends QuantityTypeIdentifier>(
  HK: HK,
  identifier: T,
  dayStart: Date,
  dayEnd: Date,
  unit: UnitForIdentifier<T>,
): Promise<number | undefined> {
  try {
    const samples = await HK.queryQuantitySamples(identifier, {
      limit: 1,
      ascending: false,
      unit,
      filter: {
        date: {
          startDate: dayStart,
          endDate: dayEnd,
        },
      },
    });
    const q = samples?.[0]?.quantity;
    return typeof q === 'number' && Number.isFinite(q) ? q : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Daily movement distance across every modality Apple tracks separately.
 * Walking/running alone under-reports a cyclist's day by the whole ride.
 */
const DAILY_DISTANCE_TYPES = [
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierDistanceSwimming',
  'HKQuantityTypeIdentifierDistanceWheelchair',
] as const satisfies readonly QuantityTypeIdentifier[];

async function readDailyWellness(HK: HK, date: string): Promise<DailyWellnessSample> {
  const sample: DailyWellnessSample = { date, platform: 'healthkit' };
  const { start: dayStart, end: dayEnd } = dayWindowLocal(date);
  const sleepWin = sleepWindowForDate(date);

  const sleepPromise = (async () => {
    try {
      const sleepSamples = await HK.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
        // A watch emits one sample per stage segment; a restless night plus a nap
        // can run to several hundred. The 26h date predicate is the real bound.
        limit: 0,
        ascending: true,
        filter: {
          date: {
            startDate: sleepWin.start,
            endDate: sleepWin.end,
          },
        },
      });
      return (sleepSamples ?? []).map((s) => ({
        value: typeof s.value === 'number' ? s.value : Number(s.value),
        start: new Date(s.startDate).getTime(),
        end: new Date(s.endDate).getTime(),
      }));
    } catch {
      return [];
    }
  })();

  // One round trip per metric, all in flight together — a serial day loop runs
  // ~14 awaits x lookback days and is the first thing a background budget kills.
  const [
    parsedSleep,
    rhr,
    hrvSdnn,
    weight,
    bodyFat,
    spo2,
    resp,
    vo2,
    basal,
    active,
    steps,
    distances,
    exercise,
    floors,
  ] = await Promise.all([
    sleepPromise,
    avgQuantityForDay(
      HK,
      'HKQuantityTypeIdentifierRestingHeartRate',
      dayStart,
      dayEnd,
      'count/min',
    ),
    avgQuantityForDay(
      HK,
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      dayStart,
      dayEnd,
      'ms',
    ),
    latestQuantityForDay(HK, 'HKQuantityTypeIdentifierBodyMass', dayStart, dayEnd, 'kg'),
    latestQuantityForDay(HK, 'HKQuantityTypeIdentifierBodyFatPercentage', dayStart, dayEnd, '%'),
    avgQuantityForDay(HK, 'HKQuantityTypeIdentifierOxygenSaturation', dayStart, dayEnd, '%'),
    avgQuantityForDay(HK, 'HKQuantityTypeIdentifierRespiratoryRate', dayStart, dayEnd, 'count/min'),
    latestQuantityForDay(HK, 'HKQuantityTypeIdentifierVO2Max', dayStart, dayEnd, 'ml/(kg*min)'),
    sumQuantityForDay(HK, 'HKQuantityTypeIdentifierBasalEnergyBurned', dayStart, dayEnd, 'kcal'),
    sumQuantityForDay(HK, 'HKQuantityTypeIdentifierActiveEnergyBurned', dayStart, dayEnd, 'kcal'),
    sumQuantityForDay(HK, 'HKQuantityTypeIdentifierStepCount', dayStart, dayEnd, 'count'),
    Promise.all(
      DAILY_DISTANCE_TYPES.map((identifier) =>
        sumQuantityForDay(HK, identifier, dayStart, dayEnd, 'm'),
      ),
    ),
    // Apple Exercise Time is already in minutes.
    sumQuantityForDay(HK, 'HKQuantityTypeIdentifierAppleExerciseTime', dayStart, dayEnd, 'min'),
    sumQuantityForDay(HK, 'HKQuantityTypeIdentifierFlightsClimbed', dayStart, dayEnd, 'count'),
  ]);

  const bucket = bucketHealthKitSleep(parsedSleep);
  if (bucket) {
    sample.sleepSecs = bucket.sleepSecs;
    sample.sleepHours = Math.round((bucket.sleepSecs / 3600) * 10) / 10;
    sample.sleepDeepSecs = bucket.sleepDeepSecs;
    sample.sleepRemSecs = bucket.sleepRemSecs;
    sample.sleepLightSecs = bucket.sleepLightSecs;
    sample.sleepAwakeSecs = bucket.sleepAwakeSecs;
  }

  if (rhr != null) sample.restingHr = Math.round(rhr);
  if (hrvSdnn != null) sample.hrvSdnn = Math.round(hrvSdnn * 10) / 10;
  if (weight != null) sample.weight = Math.round(weight * 10) / 10;
  if (bodyFat != null) {
    sample.bodyFat = bodyFat <= 1 ? Math.round(bodyFat * 1000) / 10 : Math.round(bodyFat * 10) / 10;
  }
  if (spo2 != null) {
    sample.spO2 = spo2 <= 1 ? Math.round(spo2 * 1000) / 10 : Math.round(spo2 * 10) / 10;
  }
  if (resp != null) sample.respiration = Math.round(resp * 10) / 10;
  if (vo2 != null) sample.vo2max = Math.round(vo2 * 10) / 10;
  if (basal != null) sample.restingCaloriesBurned = Math.round(basal);
  if (active != null) sample.activeCaloriesBurned = Math.round(active);
  if (basal != null || active != null) {
    sample.totalCaloriesBurned = Math.round((basal ?? 0) + (active ?? 0));
  }
  if (steps != null) sample.steps = Math.round(steps);

  const distanceTotal = distances.reduce<number | undefined>(
    (total, value) => (value != null ? (total ?? 0) + value : total),
    undefined,
  );
  if (distanceTotal != null && distanceTotal > 0) {
    sample.distanceMeters = Math.round(distanceTotal);
  }
  if (exercise != null && exercise > 0) sample.exerciseMinutes = Math.round(exercise);
  if (floors != null && floors > 0) sample.floors = Math.round(floors);

  return sample;
}

export async function readHealthKitWellness(
  window: HealthReadWindow = { lookbackDays: LOOKBACK_DAYS },
): Promise<DailyWellnessSample[]> {
  if (Platform.OS !== 'ios') return [];

  const HK = await import('@kingstinct/react-native-healthkit');
  const available = await HK.isHealthDataAvailable();
  if (!available) return [];

  const today = new Date();
  const from = resolveFrom(window, today);
  const dates = eachLocalDateYmd(from, today);

  // Days run in sequence so a long lookback does not open the whole window's
  // worth of HealthKit queries at once; the per-day fan-out is the parallelism.
  const samples: DailyWellnessSample[] = [];
  for (const date of dates) {
    samples.push(await readDailyWellness(HK, date));
  }
  return samples;
}

async function readHkQuantitySeries<T extends QuantityTypeIdentifier>(
  HK: HK,
  identifier: T,
  workout: WorkoutProxyTyped,
  start: Date,
  end: Date,
  unit: UnitForIdentifier<T>,
): Promise<{ t: number; v: number }[]> {
  const query = async (scoped: boolean) => {
    const samples = await HK.queryQuantitySamples(identifier, {
      // Unbounded: the workout/date predicate is the bound. A capped read
      // would silently truncate long sessions and skew the avg/max computed
      // from the full stream before downsampling.
      limit: 0,
      ascending: true,
      unit,
      filter: scoped
        ? // The typed proxy differs from the plain one only in its metadata
          // generics; the native side takes the same object either way.
          { workout: workout as unknown as WorkoutFilterRef }
        : { date: { startDate: start, endDate: end } },
    });
    return (samples ?? []).map((s) => ({
      t: new Date(s.startDate).getTime(),
      v: typeof s.quantity === 'number' ? s.quantity : NaN,
    }));
  };

  try {
    // Samples HealthKit associated with this workout — excludes background
    // readings and a concurrently-recording app that a date window would sweep in.
    const scoped = await query(true);
    if (scoped.length) return scoped;
  } catch {
    // fall through to the time window
  }

  try {
    // Some third-party apps save the workout without associating its samples;
    // the time window is the only way to recover a stream for those.
    return await query(false);
  } catch {
    return [];
  }
}

type WorkoutStatistic = {
  sum?: number;
  avg?: number;
  max?: number;
};

/**
 * HealthKit's own statistic for a type within a workout. This is the
 * replacement for the deprecated `totalEnergyBurned` / `totalDistance`
 * properties, and its discrete average is temporally weighted rather than a
 * plain mean over however densely the sensor happened to sample.
 */
async function statisticFor(
  workout: WorkoutProxyTyped,
  identifier: QuantityTypeIdentifier,
  unit: string,
): Promise<WorkoutStatistic> {
  const finite = (value?: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  try {
    const stats = await workout.getStatistic(identifier, unit);
    return {
      sum: finite(stats?.sumQuantity?.quantity),
      avg: finite(stats?.averageQuantity?.quantity),
      max: finite(stats?.maximumQuantity?.quantity),
    };
  } catch {
    return {};
  }
}

/** Distance types a workout may carry, ordered so the sport-specific one wins. */
const WORKOUT_DISTANCE_TYPES = [
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceSwimming',
  'HKQuantityTypeIdentifierDistanceWheelchair',
] as const satisfies readonly QuantityTypeIdentifier[];

export async function readHealthKitWorkouts(
  window: HealthReadWindow = { lookbackDays: LOOKBACK_DAYS },
): Promise<PlatformWorkoutSession[]> {
  if (Platform.OS !== 'ios') return [];

  const HK = await import('@kingstinct/react-native-healthkit');
  const available = await HK.isHealthDataAvailable();
  if (!available) return [];

  const today = new Date();
  const from = resolveFrom(window, today);

  try {
    const workouts = await HK.queryWorkoutSamples({
      // HealthKit treats a non-positive limit as "all". The date predicate
      // still bounds this to the configured sync lookback.
      limit: 0,
      ascending: false,
      filter: {
        date: {
          startDate: from,
          endDate: today,
        },
      },
    });

    const out: PlatformWorkoutSession[] = [];
    for (const w of workouts ?? []) {
      const start = new Date(w.startDate);
      if (!Number.isFinite(start.getTime())) continue;
      const end = w.endDate ? new Date(w.endDate) : undefined;
      const elapsedSec = end
        ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
        : undefined;
      // HealthKit's own duration excludes paused time; elapsed wall-clock is
      // only the fallback when the workout does not report one.
      const reportedSec = seconds(w.duration);
      const durationSec = reportedSec != null ? Math.round(reportedSec) : elapsedSec;
      const platformSessionId = w.uuid ?? `hk-${start.toISOString()}`;
      const activityCode =
        typeof w.workoutActivityType === 'number' ? w.workoutActivityType : undefined;
      const canonical = canonicalSportFromHealthKit(activityCode);
      const sportType = canonical ?? (activityCode != null ? String(activityCode) : undefined);

      const windowEnd = end ?? start;
      const [
        hrRaw,
        cyclingPower,
        runningPower,
        cadenceRaw,
        runSpeed,
        cycleSpeed,
        energyStat,
        hrStat,
        distanceStats,
      ] = await Promise.all([
        readHkQuantitySeries(
          HK,
          'HKQuantityTypeIdentifierHeartRate',
          w,
          start,
          windowEnd,
          'count/min',
        ),
        readHkQuantitySeries(HK, 'HKQuantityTypeIdentifierCyclingPower', w, start, windowEnd, 'W'),
        readHkQuantitySeries(HK, 'HKQuantityTypeIdentifierRunningPower', w, start, windowEnd, 'W'),
        readHkQuantitySeries(
          HK,
          'HKQuantityTypeIdentifierCyclingCadence',
          w,
          start,
          windowEnd,
          'count/min',
        ),
        readHkQuantitySeries(
          HK,
          'HKQuantityTypeIdentifierRunningSpeed',
          w,
          start,
          windowEnd,
          'm/s',
        ),
        readHkQuantitySeries(
          HK,
          'HKQuantityTypeIdentifierCyclingSpeed',
          w,
          start,
          windowEnd,
          'm/s',
        ),
        // `totalEnergyBurned` / `totalDistance` are deprecated in favour of the
        // workout's statistics; keep them only as the fallback.
        statisticFor(w, 'HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal'),
        statisticFor(w, 'HKQuantityTypeIdentifierHeartRate', 'count/min'),
        Promise.all(WORKOUT_DISTANCE_TYPES.map((identifier) => statisticFor(w, identifier, 'm'))),
      ]);

      const activeCalories = energyStat.sum ?? kilocalories(w.totalEnergyBurned);
      const distanceMeters =
        distanceStats.map((stat) => stat.sum).find((value) => value != null && value > 0) ??
        meters(w.totalDistance);

      const hr = summarizeHeartRate(hrRaw.map((s) => ({ t: s.t, bpm: s.v })));
      const power = summarizePower(
        [...cyclingPower, ...runningPower].map((s) => ({ t: s.t, watts: s.v })),
      );
      const cadence = summarizeCadence(cadenceRaw.map((s) => ({ t: s.t, rpm: s.v })));
      const speed = summarizeSpeed([...runSpeed, ...cycleSpeed].map((s) => ({ t: s.t, mps: s.v })));

      let routePoints = summarizeRoute([]).samples;
      try {
        if (typeof w.getWorkoutRoutes === 'function') {
          const routes = await w.getWorkoutRoutes();
          const locs: { t: number; lat: number; lon: number; altitudeMeters?: number }[] = [];
          for (const route of routes ?? []) {
            for (const loc of route.locations ?? []) {
              locs.push({
                t: new Date(loc.date).getTime(),
                lat: loc.latitude,
                lon: loc.longitude,
                altitudeMeters: loc.altitude,
              });
            }
          }
          routePoints = summarizeRoute(locs).samples;
        }
      } catch {
        // Route optional — summary FIT still valid.
      }

      out.push({
        platformSessionId,
        platform: 'healthkit',
        startedAt: start.toISOString(),
        endedAt: end?.toISOString(),
        durationSec,
        sportType,
        title: sportLabel(canonical),
        activeCalories: activeCalories != null ? Math.round(activeCalories) : undefined,
        distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : undefined,
        avgHeartRate: hrStat.avg != null ? Math.round(hrStat.avg) : hr.avg,
        maxHeartRate: hrStat.max != null ? Math.round(hrStat.max) : hr.max,
        avgPower: power.avg,
        heartRateSamples: hr.samples,
        powerSamples: power.samples,
        cadenceSamples: cadence.samples,
        speedSamples: speed.samples,
        routePoints,
        laps: lapsFromWorkout(w, start, end ?? start),
      });
    }
    return out;
  } catch (err) {
    // Never swallow a query failure into an empty result: "HealthKit threw" and
    // "this device has no workouts" would be indistinguishable, the pass would
    // report Success, and nothing would reach Sentry or the ledger (CW-465).
    // runHealthSyncPass has a pass-level catch that sets workoutPassError.
    throw err instanceof Error ? err : new Error('HealthKit workout query failed');
  }
}
