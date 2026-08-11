import { localDateYmd } from '@/src/lib/date';

import type { DailyWellnessSample, HealthWellnessUploadPayload } from './types';

/** True when the sample has at least one objective metric to upload. */
export function sampleHasMetrics(sample: DailyWellnessSample): boolean {
  return (
    sample.sleepSecs != null ||
    sample.sleepHours != null ||
    sample.restingHr != null ||
    sample.hrv != null ||
    sample.hrvSdnn != null ||
    sample.weight != null ||
    sample.bodyFat != null ||
    sample.spO2 != null ||
    sample.respiration != null ||
    sample.vo2max != null ||
    sample.steps != null ||
    sample.distanceMeters != null ||
    sample.exerciseMinutes != null ||
    sample.floors != null ||
    sample.restingCaloriesBurned != null ||
    sample.activeCaloriesBurned != null ||
    sample.totalCaloriesBurned != null
  );
}

/**
 * Stable fingerprint of objective metrics for skip-unchanged logic.
 * Omits provenance / titles — only values that affect coaching data.
 */
export function wellnessContentFingerprint(sample: DailyWellnessSample): string {
  const keys: (keyof DailyWellnessSample)[] = [
    'sleepSecs',
    'sleepHours',
    'sleepDeepSecs',
    'sleepRemSecs',
    'sleepLightSecs',
    'sleepAwakeSecs',
    'restingHr',
    'hrv',
    'hrvSdnn',
    'weight',
    'bodyFat',
    'spO2',
    'respiration',
    'vo2max',
    'steps',
    'distanceMeters',
    'exerciseMinutes',
    'floors',
    'restingCaloriesBurned',
    'activeCaloriesBurned',
    'totalCaloriesBurned',
  ];
  const parts: string[] = [];
  for (const key of keys) {
    const v = sample[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      parts.push(`${key}:${v}`);
    }
  }
  return parts.join('|');
}

export function mapSampleToWellnessPayload(
  sample: DailyWellnessSample,
): HealthWellnessUploadPayload {
  const activity: Record<string, number> = {};
  if (sample.steps != null) activity.steps = Math.round(sample.steps);
  if (sample.distanceMeters != null) activity.distanceMeters = Math.round(sample.distanceMeters);
  if (sample.exerciseMinutes != null) activity.exerciseMinutes = Math.round(sample.exerciseMinutes);
  if (sample.floors != null) activity.floors = Math.round(sample.floors);

  const payload: HealthWellnessUploadPayload = {
    date: sample.date,
    // Provenance + activity mirror — coach-wattz currently strips unknown top-level
    // keys (steps/distance/etc.); keep them in rawJson until schema lands (issue 064).
    rawJson: {
      source: sample.platform,
      platform: sample.platform,
      ...(Object.keys(activity).length ? { activity } : {}),
    },
  };

  if (sample.sleepSecs != null) payload.sleepSecs = Math.round(sample.sleepSecs);
  if (sample.sleepHours != null) payload.sleepHours = sample.sleepHours;
  if (sample.sleepDeepSecs != null) payload.sleepDeepSecs = Math.round(sample.sleepDeepSecs);
  if (sample.sleepRemSecs != null) payload.sleepRemSecs = Math.round(sample.sleepRemSecs);
  if (sample.sleepLightSecs != null) payload.sleepLightSecs = Math.round(sample.sleepLightSecs);
  if (sample.sleepAwakeSecs != null) payload.sleepAwakeSecs = Math.round(sample.sleepAwakeSecs);
  if (sample.restingHr != null) payload.restingHr = Math.round(sample.restingHr);
  if (sample.hrv != null) payload.hrv = sample.hrv;
  if (sample.hrvSdnn != null) payload.hrvSdnn = sample.hrvSdnn;
  if (sample.weight != null) payload.weight = sample.weight;
  if (sample.bodyFat != null) payload.bodyFat = sample.bodyFat;
  if (sample.spO2 != null) payload.spO2 = sample.spO2;
  if (sample.respiration != null) payload.respiration = sample.respiration;
  if (sample.vo2max != null) payload.vo2max = sample.vo2max;
  if (sample.steps != null) payload.steps = Math.round(sample.steps);
  if (sample.distanceMeters != null) payload.distanceMeters = Math.round(sample.distanceMeters);
  if (sample.exerciseMinutes != null) payload.exerciseMinutes = Math.round(sample.exerciseMinutes);
  if (sample.floors != null) payload.floors = Math.round(sample.floors);
  if (sample.restingCaloriesBurned != null) {
    payload.restingCaloriesBurned = Math.round(sample.restingCaloriesBurned);
  }
  if (sample.activeCaloriesBurned != null) {
    payload.activeCaloriesBurned = Math.round(sample.activeCaloriesBurned);
  }
  if (sample.totalCaloriesBurned != null) {
    payload.totalCaloriesBurned = Math.round(sample.totalCaloriesBurned);
  }

  return payload;
}

export function lookbackStartDate(days: number, from: Date = new Date()): Date {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export function eachLocalDateYmd(from: Date, to: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(localDateYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function wellnessHistoryTitle(date: string): string {
  try {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return `Wellness · ${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  } catch {
    return `Wellness · ${date}`;
  }
}
