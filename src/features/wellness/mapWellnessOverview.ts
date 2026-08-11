import { kgToDisplayWeight, weightUnitLabel } from '@/src/features/profile/mapProfile';
import { calculateTrend } from '@/src/features/profile/trend';
import type { WeightUnits } from '@/src/features/profile/types';

import {
  isPlausibleRestingHr,
  isPlausibleSleepHours,
  isPlausibleWeightKg,
  plausibleRestingHrHistory,
  plausibleSleepHistory,
} from './plausibility';
import type {
  WellnessBarSeries,
  WellnessMetricTrend,
  WellnessOverview,
  WellnessOverviewMetric,
  WellnessTrendPoint,
} from './types';

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function localTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateKey(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseTrend(raw: unknown): WellnessMetricTrend | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const historyRaw = Array.isArray(obj.history) ? obj.history : [];
  const history: WellnessTrendPoint[] = historyRaw
    .map((entry) => {
      const row = asRecord(entry);
      if (!row) return null;
      const date = dateKey(row.date);
      if (!date) return null;
      return { date, value: asFiniteNumber(row.value) };
    })
    .filter((p): p is WellnessTrendPoint => p != null);

  return {
    value: asFiniteNumber(obj.value),
    previous: asFiniteNumber(obj.previous),
    avg7: asFiniteNumber(obj.avg7),
    avg30: asFiniteNumber(obj.avg30),
    history,
  };
}

function lastSevenDays(history: WellnessTrendPoint[]): WellnessTrendPoint[] {
  if (history.length === 0) return [];
  return history.slice(-7);
}

function priorValues(history: WellnessTrendPoint[], currentDate: string): number[] {
  return history
    .filter((p) => p.date !== currentDate)
    .map((p) => p.value)
    .filter((v): v is number => v != null && Number.isFinite(v));
}

function metric(
  key: WellnessOverviewMetric['key'],
  label: string,
  value: number | string | null,
  unit: string,
  trendPercent: number | null,
  lowerIsBetter = false,
): WellnessOverviewMetric | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return { key, label, value, unit, trendPercent, lowerIsBetter };
}

function aiCoachNote(root: Record<string, unknown>): string | null {
  const analysis = asRecord(root.aiAnalysisJson);
  if (!analysis) return null;
  const summary = analysis.executive_summary;
  if (typeof summary === 'string' && summary.trim()) return summary.trim();
  const recs = analysis.recommendations;
  if (Array.isArray(recs) && typeof recs[0] === 'string' && recs[0].trim()) {
    return recs[0].trim();
  }
  if (Array.isArray(recs) && recs[0] && typeof recs[0] === 'object') {
    const first = recs[0] as Record<string, unknown>;
    for (const key of ['text', 'recommendation', 'summary']) {
      const v = first[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

/** Port of web WellnessModal `getTrainingRecommendation` (heuristic fallback). */
export function heuristicCoachNote(input: {
  recoveryScore: number | null;
  hrv: number | null;
  sleepHours: number | null;
  restingHr: number | null;
  restingHrTrendPercent: number | null;
}): string {
  const { recoveryScore, hrv, sleepHours, restingHr, restingHrTrendPercent } = input;

  if (recoveryScore != null && recoveryScore >= 67) {
    return "You're well recovered! This is a great day for high-intensity training or hard workouts. Your body is ready to handle significant stress.";
  }
  if (hrv != null && hrv >= 60 && sleepHours != null && sleepHours >= 7.5) {
    return "Good recovery metrics indicate you're ready for challenging training. Consider intervals, tempo runs, or strength work.";
  }
  if ((recoveryScore != null && recoveryScore >= 34) || (hrv != null && hrv >= 40)) {
    return 'Moderate recovery suggests sticking to moderate-intensity training. Good day for aerobic base work, technique sessions, or moderate volume.';
  }
  if (
    (recoveryScore != null && recoveryScore < 34) ||
    (hrv != null && hrv < 40) ||
    (sleepHours != null && sleepHours < 6.5)
  ) {
    return 'Your body needs recovery. Focus on easy aerobic work, mobility, or consider a rest day. Quality recovery now will pay dividends later.';
  }
  if (restingHr != null && restingHrTrendPercent != null && restingHrTrendPercent > 3) {
    return 'Elevated resting heart rate suggests your body is under stress. Prioritize recovery activities like easy movement, stretching, or complete rest.';
  }
  return 'Listen to your body and adjust training intensity based on how you feel throughout your session.';
}

export type WellnessOverviewUnits = {
  /** Athlete display preference; the API always stores/returns kilograms. */
  weightUnits: WeightUnits;
};

export function mapWellnessOverview(
  json: unknown,
  units: WellnessOverviewUnits = { weightUnits: 'Kilograms' },
): WellnessOverview | null {
  if (json == null) return null;
  const root = asRecord(json);
  if (!root) return null;

  const date = dateKey(root.date) || dateKey(root.wellnessDate) || localTodayKey();

  const trendsRoot = asRecord(root.trends) || {};
  const hrvTrend = parseTrend(trendsRoot.hrv);
  const sleepTrend = parseTrend(trendsRoot.sleepHours);
  const rhrTrend = parseTrend(trendsRoot.restingHr);
  const recoveryTrend = parseTrend(trendsRoot.recoveryScore);

  const hrv = asFiniteNumber(root.hrv) ?? hrvTrend?.value ?? null;
  const rawSleepHours =
    asFiniteNumber(root.sleepHours) ?? asFiniteNumber(root.hoursSlept) ?? sleepTrend?.value ?? null;
  const sleepHours = isPlausibleSleepHours(rawSleepHours) ? rawSleepHours : null;
  const rawRestingHr = asFiniteNumber(root.restingHr) ?? rhrTrend?.value ?? null;
  const restingHr = isPlausibleRestingHr(rawRestingHr) ? rawRestingHr : null;
  const recoveryScore = asFiniteNumber(root.recoveryScore) ?? recoveryTrend?.value ?? null;
  const readiness = asFiniteNumber(root.readiness);
  const rawWeight = asFiniteNumber(root.weight);
  const weightTrend = parseTrend(trendsRoot.weight);
  const weightHistoryPrior = priorValues(weightTrend?.history ?? [], date);
  const weightPrevious =
    asFiniteNumber(root.previousWeight) ??
    weightTrend?.previous ??
    (weightHistoryPrior.length > 0 ? weightHistoryPrior[weightHistoryPrior.length - 1]! : null);
  const weight = isPlausibleWeightKg(rawWeight, weightPrevious) ? rawWeight : null;
  const stress = asFiniteNumber(root.stress);
  const mood = asFiniteNumber(root.mood);
  const spo2 = asFiniteNumber(root.spo2) ?? asFiniteNumber(root.spO2);
  const systolic = asFiniteNumber(root.systolic);
  const diastolic = asFiniteNumber(root.diastolic);
  const bloodPressure =
    systolic != null && diastolic != null
      ? `${Math.round(systolic)}/${Math.round(diastolic)}`
      : null;

  const hrvTrendPercent = calculateTrend(hrv, priorValues(hrvTrend?.history ?? [], date));
  const sleepTrendPercent =
    sleepHours != null
      ? calculateTrend(
          sleepHours,
          plausibleSleepHistory(priorValues(sleepTrend?.history ?? [], date)),
        )
      : null;
  const rhrTrendPercent =
    restingHr != null
      ? calculateTrend(
          restingHr,
          plausibleRestingHrHistory(priorValues(rhrTrend?.history ?? [], date)),
        )
      : null;
  const recoveryTrendPercent = calculateTrend(
    recoveryScore,
    priorValues(recoveryTrend?.history ?? [], date),
  );

  const metrics = [
    metric('hrv', 'HRV', hrv != null ? Math.round(hrv) : null, 'ms', hrvTrendPercent),
    metric(
      'sleep',
      'Sleep',
      sleepHours != null ? Number(sleepHours.toFixed(1)) : null,
      'hrs',
      sleepTrendPercent,
    ),
    metric(
      'restingHr',
      'Resting HR',
      restingHr != null ? Math.round(restingHr) : null,
      'bpm',
      rhrTrendPercent,
      true,
    ),
    metric(
      'recoveryScore',
      'Recovery',
      recoveryScore != null ? Math.round(recoveryScore) : null,
      '%',
      recoveryTrendPercent,
    ),
    metric('readiness', 'Readiness', readiness != null ? Math.round(readiness) : null, '', null),
    // Plausibility runs on kg (ratio comparison, unit-invariant); only display converts.
    metric(
      'weight',
      'Weight',
      kgToDisplayWeight(weight, units.weightUnits),
      weightUnitLabel(units.weightUnits),
      null,
    ),
    metric('stress', 'Stress', stress != null ? Math.round(stress) : null, '', null),
    metric('mood', 'Mood', mood != null ? Math.round(mood) : null, '', null),
    metric('spo2', 'SpO2', spo2 != null ? Math.round(spo2) : null, '%', null),
    metric('bloodPressure', 'Blood pressure', bloodPressure, 'mmHg', null),
  ].filter((m): m is WellnessOverviewMetric => m != null);

  const barSeries: WellnessBarSeries[] = [];
  const sleepBars = lastSevenDays(sleepTrend?.history ?? []);
  if (sleepBars.some((p) => p.value != null)) {
    barSeries.push({ key: 'sleep', label: 'Sleep', unit: 'hrs', points: sleepBars });
  }
  const hrvBars = lastSevenDays(hrvTrend?.history ?? []);
  if (hrvBars.some((p) => p.value != null)) {
    barSeries.push({ key: 'hrv', label: 'HRV', unit: 'ms', points: hrvBars });
  }
  const rhrBars = lastSevenDays(rhrTrend?.history ?? []);
  if (rhrBars.some((p) => p.value != null)) {
    barSeries.push({ key: 'restingHr', label: 'Resting HR', unit: 'bpm', points: rhrBars });
  }
  const recoveryBars = lastSevenDays(recoveryTrend?.history ?? []);
  if (recoveryBars.some((p) => p.value != null)) {
    barSeries.push({
      key: 'recoveryScore',
      label: 'Recovery',
      unit: '%',
      points: recoveryBars,
    });
  }

  const coachNote =
    aiCoachNote(root) ||
    heuristicCoachNote({
      recoveryScore,
      hrv,
      sleepHours,
      restingHr,
      restingHrTrendPercent: rhrTrendPercent,
    });

  return {
    id: typeof root.id === 'string' ? root.id : null,
    date,
    isStale: date !== localTodayKey(),
    metrics,
    barSeries,
    coachNote,
  };
}

export function wellnessDayWebPath(date: string): string {
  return `/dashboard?focus=wellness&date=${encodeURIComponent(date)}`;
}
