import { distanceUnitLabel, temperatureUnitLabel } from '@/src/features/profile/mapProfile';

import type {
  ActivityAnalysis,
  ActivityListItem,
  ActivityRowStatus,
  ActivitySummary,
  AnalysisPhase,
  AnalysisRecommendation,
  AnalysisScore,
  AnalysisSection,
  CompletedExercise,
  FuelingPrepApi,
  FuelingPrepGlance,
  PlanAdherenceGlance,
  PlannedDetail,
  PlannedDetailApi,
  PlannedListItem,
  PlannedListItemApi,
  PlannedStructureStep,
  PlannedZoneBand,
  PlannedZoneSummary,
  SummaryMetric,
  WorkoutExerciseApi,
  WorkoutListItemApi,
  WorkoutSummaryApi,
} from './types';
import {
  buildStructureChartBlocks,
  emptyChartRefs,
  hasStructuredWorkoutPreviewData,
  resolveChartStepIntensity,
  unitsLookLikePercentFtp,
  zoneIndexFromIntensity,
  type ChartTargetRefs,
  type StructureChartBlock,
  type ZoneProfileSnapshot,
} from './structureIntensity';
import { mpsToPaceLabel } from '@/src/lib/pace';

export type { ChartTargetRefs, StructureChartBlock };
export {
  buildStructureChartBlocks,
  emptyChartRefs,
  hasStructuredWorkoutPreviewData,
  refsFromAthlete,
} from './structureIntensity';

const COACH_INSTRUCTIONS_MAX = 400;
const ZONE_BAND_MAX = 8;
const ANALYSIS_SECTION_MAX = 6;
const ANALYSIS_REC_MAX = 5;
const ANALYSIS_BULLET_MAX = 5;
const ANALYSIS_POINT_MAX = 4;
const COMPLETED_EXERCISE_MAX = 24;
const ADHERENCE_SUMMARY_MAX = 280;

export function formatDuration(durationSec: number | null | undefined): string | null {
  if (durationSec == null || durationSec <= 0) return null;
  const minutes = Math.round(durationSec / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export type StepIntensity = {
  /** 0-based zone index when confidently known */
  zoneIndex?: number;
  /** 0–1+ intensity fraction for profile height when known */
  fraction?: number;
};

/** Align %FTP label zones with chart default bands (`zoneIndexFromIntensity`). */
function zoneIndexFromFtpPercent(pct: number): number {
  return zoneIndexFromIntensity(pct / 100);
}

const NAMED_ZONE_INDEX: Record<string, number> = {
  recovery: 0,
  'active recovery': 0,
  endurance: 1,
  easy: 1,
  tempo: 2,
  'sweet spot': 2,
  sst: 2,
  threshold: 3,
  ftp: 3,
  lt: 3,
  vo2: 4,
  vo2max: 4,
  'vo2 max': 4,
  anaerobic: 5,
  neuromuscular: 6,
};

/**
 * Best-effort intensity from a structure step's label.
 * Only confident matches (`Z<n>`, `%FTP` / bare `%`, named zones) get color/height hints.
 */
export function stepIntensity(step: { intensityLabel?: string | null }): StepIntensity {
  const raw = step.intensityLabel?.trim();
  if (!raw) return {};

  const zoneMatch = /^Z\s*(\d+)\b/i.exec(raw);
  if (zoneMatch) {
    const n = Number(zoneMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 9) {
      const zoneIndex = n - 1;
      return { zoneIndex, fraction: Math.min(n / 7, 1) };
    }
  }

  const ftpMatch = /^(\d+(?:\.\d+)?)\s*%(?:\s*FTP)?(?:\b|$)/i.exec(raw);
  if (ftpMatch) {
    const pct = Number(ftpMatch[1]);
    if (Number.isFinite(pct) && pct > 0 && pct <= 250) {
      return {
        zoneIndex: zoneIndexFromFtpPercent(pct),
        fraction: Math.min(pct / 100, 1.2) / 1.2,
      };
    }
  }

  const named = NAMED_ZONE_INDEX[raw.toLowerCase()];
  if (named != null) {
    return { zoneIndex: named, fraction: Math.min((named + 1) / 7, 1) };
  }

  return {};
}

/** Resolve a 0-based zone index from a zone band name (`Z2`, `Zone 3`, etc.). */
export function zoneIndexFromBandName(name: string, fallbackIndex: number): number {
  const fromLabel = stepIntensity({ intensityLabel: name }).zoneIndex;
  if (fromLabel != null) return fromLabel;
  const digits = /(\d+)/.exec(name);
  if (digits) {
    const n = Number(digits[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 9) return n - 1;
  }
  return fallbackIndex;
}

/** Format IF-like intensity (workout `intensity` / planned `workIntensity`). */
export function formatIntensityFactor(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0.1 || value > 2) return null;
  return `IF ${value.toFixed(2)}`;
}

export type DistanceDisplayUnits = 'Kilometers' | 'Miles';
export type TemperatureDisplayUnits = 'Celsius' | 'Fahrenheit';

export const METERS_PER_MILE = 1609.344;
export const FEET_PER_METER = 3.28084;
export const KM_PER_MILE = METERS_PER_MILE / 1000;

export function formatDistanceMeters(
  meters: unknown,
  units: DistanceDisplayUnits = 'Kilometers',
): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return null;
  if (units === 'Miles') {
    const miles = meters / METERS_PER_MILE;
    if (miles >= 0.1) return `${miles.toFixed(1)} mi`;
    return `${Math.round(meters * FEET_PER_METER)} ft`;
  }
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

/** Kilometres in the athlete's chosen unit (source data is always metric). */
export function kmToDisplayDistance(km: number, units: DistanceDisplayUnits): number {
  if (!Number.isFinite(km)) return 0;
  return units === 'Miles' ? km / KM_PER_MILE : km;
}

/** Metres of climbing in the athlete's chosen unit. */
export function metersToDisplayElevation(meters: number, units: DistanceDisplayUnits): number {
  if (!Number.isFinite(meters)) return 0;
  return units === 'Miles' ? meters * FEET_PER_METER : meters;
}

export function elevationUnitLabel(units: DistanceDisplayUnits): string {
  return units === 'Miles' ? 'ft' : 'm';
}

export function celsiusToDisplayTemperature(
  celsius: number,
  units: TemperatureDisplayUnits,
): number {
  if (!Number.isFinite(celsius)) return 0;
  return units === 'Fahrenheit' ? celsius * 1.8 + 32 : celsius;
}

export function formatElevationMeters(
  meters: unknown,
  units: DistanceDisplayUnits = 'Kilometers',
): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return null;
  return `${Math.round(metersToDisplayElevation(meters, units)).toLocaleString()} ${elevationUnitLabel(units)}`;
}

/**
 * Activity-detail cache keys. They live in this (dependency-free) module rather than in
 * the hook file so they stay unit-testable in the node test env — `useActivity.ts` pulls
 * in the API client and its expo dependencies.
 *
 * The distance preference is part of the key: the summary payload is formatted per-unit
 * server-side, so a result fetched under one preference must not be served under another.
 */
export function activityDetailQueryPrefix(id: string) {
  return ['activity', 'detail', id] as const;
}

export function activityDetailQueryKey(
  id: string,
  distanceUnits: DistanceDisplayUnits = 'Kilometers',
) {
  return [...activityDetailQueryPrefix(id), distanceUnits] as const;
}

/* ---- Terrain / climb ledger display (CW-491) -------------------------------
 * Pure so the terrain component stays dumb and the unit decisions stay testable.
 * Source data is always metric (km, m, °C); every string below is a display concern.
 */

/** "3.2 km" / "2.0 mi" — one decimal, matching the climb ledger. */
export function formatClimbDistanceKm(km: number, units: DistanceDisplayUnits): string {
  return `${kmToDisplayDistance(km, units).toFixed(1)} ${distanceUnitLabel(units)}`;
}

/** "412 m" / "1,352 ft". */
export function formatClimbElevationM(meters: number, units: DistanceDisplayUnits): string {
  return `${Math.round(metersToDisplayElevation(meters, units)).toLocaleString()} ${elevationUnitLabel(units)}`;
}

/** Axis tick with unit, at a caller-chosen precision ("12.4 km" / "7 mi"). */
export function formatAxisDistanceKm(
  km: number,
  units: DistanceDisplayUnits,
  digits: number,
): string {
  return `${kmToDisplayDistance(km, units).toFixed(digits)} ${distanceUnitLabel(units)}`;
}

/** Bare axis number in the display unit, no unit suffix ("1352"). */
export function formatAltitudeAxisM(meters: number, units: DistanceDisplayUnits): string {
  return Math.round(metersToDisplayElevation(meters, units)).toLocaleString();
}

/** "18.5°C" / "65.3°F". */
export function formatTemperatureC(celsius: number, units: TemperatureDisplayUnits): string {
  return `${celsiusToDisplayTemperature(celsius, units).toFixed(1)}${temperatureUnitLabel(units)}`;
}

/** Screen-reader form: "18.5 degrees Celsius" / "65.3 degrees Fahrenheit". */
export function spokenTemperatureC(celsius: number, units: TemperatureDisplayUnits): string {
  const scale = units === 'Fahrenheit' ? 'Fahrenheit' : 'Celsius';
  return `${celsiusToDisplayTemperature(celsius, units).toFixed(1)} degrees ${scale}`;
}

/** Screen-reader form: "3.2 kilometres" / "2.0 miles". */
export function spokenDistanceKm(km: number, units: DistanceDisplayUnits): string {
  const value = kmToDisplayDistance(km, units).toFixed(1);
  return `${value} ${units === 'Miles' ? 'miles' : 'kilometres'}`;
}

/** Screen-reader form: "412 metres gained" / "1,352 feet gained". */
export function spokenElevationM(meters: number, units: DistanceDisplayUnits): string {
  const value = Math.round(metersToDisplayElevation(meters, units)).toLocaleString();
  return `${value} ${units === 'Miles' ? 'feet' : 'metres'}`;
}

function formatWatts(watts: unknown): string | null {
  if (typeof watts !== 'number' || !Number.isFinite(watts) || watts <= 0) return null;
  return `${Math.round(watts)} W`;
}

function formatHr(bpm: unknown): string | null {
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) return null;
  return `${Math.round(bpm)} bpm`;
}

function formatCadence(rpm: unknown): string | null {
  if (typeof rpm !== 'number' || !Number.isFinite(rpm) || rpm <= 0) return null;
  return `${Math.round(rpm)} rpm`;
}

function formatCalories(kcal: unknown): string | null {
  if (typeof kcal !== 'number' || !Number.isFinite(kcal) || kcal <= 0) return null;
  return `${Math.round(kcal)} kcal`;
}

function formatRatio(value: unknown, digits = 2): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value.toFixed(digits);
}

function truncateDisplay(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function titleCaseToken(raw: string): string {
  const lower = raw.toLowerCase().replace(/_/g, ' ');
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function mapCompletionLabel(status: string | null | undefined): string | null {
  if (typeof status !== 'string' || !status.trim()) return null;
  const upper = status.trim().toUpperCase();
  switch (upper) {
    case 'PENDING':
      return 'Not started';
    case 'COMPLETED':
      return 'Completed';
    case 'SKIPPED':
      return 'Skipped';
    case 'PARTIAL':
      return 'Partial';
    default:
      return titleCaseToken(status.trim());
  }
}

export function mapSyncLabel(status: string | null | undefined): string | null {
  if (typeof status !== 'string' || !status.trim()) return null;
  const upper = status.trim().toUpperCase();
  switch (upper) {
    case 'SYNCED':
      // Already on device — omit jargon from the athlete-facing status line.
      return null;
    case 'PENDING':
      return 'Awaiting sync to device';
    case 'ERROR':
    case 'FAILED':
      return 'Sync failed';
    default:
      return titleCaseToken(status.trim());
  }
}

export function mapWorkoutSummaryMetrics(
  raw: WorkoutSummaryApi,
  distanceUnits: DistanceDisplayUnits = 'Kilometers',
): SummaryMetric[] {
  const metrics: SummaryMetric[] = [];
  const distance = formatDistanceMeters(raw.distanceMeters, distanceUnits);
  if (distance) metrics.push({ key: 'distance', label: 'Distance', value: distance });

  const avgPower = formatWatts(raw.averageWatts);
  if (avgPower) metrics.push({ key: 'avgPower', label: 'Avg power', value: avgPower });

  const np = formatWatts(raw.normalizedPower);
  if (np) metrics.push({ key: 'np', label: 'NP', value: np });

  const hr = formatHr(raw.averageHr);
  if (hr) metrics.push({ key: 'avgHr', label: 'Avg HR', value: hr });

  const elev = formatElevationMeters(raw.elevationGain, distanceUnits);
  if (elev) metrics.push({ key: 'elevation', label: 'Elevation', value: elev });

  const intensity = formatIntensityFactor(raw.intensity);
  if (intensity) metrics.push({ key: 'intensity', label: 'Intensity', value: intensity });

  const cadence = formatCadence(raw.averageCadence);
  if (cadence) metrics.push({ key: 'cadence', label: 'Cadence', value: cadence });

  const calories = formatCalories(raw.calories);
  if (calories) metrics.push({ key: 'calories', label: 'Calories', value: calories });

  const maxHr = formatHr(raw.maxHr);
  if (maxHr) metrics.push({ key: 'maxHr', label: 'Max HR', value: maxHr });

  const maxPower = formatWatts(raw.maxWatts);
  if (maxPower) metrics.push({ key: 'maxPower', label: 'Max power', value: maxPower });

  const vi = formatRatio(raw.variabilityIndex);
  if (vi) metrics.push({ key: 'vi', label: 'VI', value: vi });

  const ef = formatRatio(raw.efficiencyFactor);
  if (ef) metrics.push({ key: 'ef', label: 'EF', value: ef });

  return metrics;
}

export function mapPlanAdherence(raw: WorkoutSummaryApi): PlanAdherenceGlance | null {
  const adherence = raw.planAdherence;
  if (!adherence || typeof adherence !== 'object') return null;

  const plannedWorkoutId =
    (typeof adherence.plannedWorkoutId === 'string' && adherence.plannedWorkoutId.trim()) ||
    (typeof raw.plannedWorkoutId === 'string' && raw.plannedWorkoutId.trim()) ||
    null;

  const overallScore =
    typeof adherence.overallScore === 'number' && Number.isFinite(adherence.overallScore)
      ? Math.round(adherence.overallScore)
      : null;
  const summary =
    typeof adherence.summary === 'string' && adherence.summary.trim()
      ? truncateDisplay(adherence.summary, ADHERENCE_SUMMARY_MAX)
      : null;

  const status =
    typeof adherence.analysisStatus === 'string'
      ? adherence.analysisStatus.trim().toUpperCase()
      : '';
  let phase: PlanAdherenceGlance['phase'] = 'unknown';
  let statusLabel: string | null = null;
  if (status === 'COMPLETED' || status === 'READY') {
    phase = 'ready';
  } else if (status === 'PENDING' || status === 'PROCESSING' || status === 'NOT_STARTED') {
    phase = 'pending';
    statusLabel = 'Adherence analyzing…';
  } else if (status === 'FAILED' || status === 'ERROR') {
    phase = 'failed';
    statusLabel = 'Adherence unavailable';
  }

  if (phase === 'ready' && overallScore == null && !summary) {
    // No athlete-facing content yet — still show link when we have a plan id.
    if (!plannedWorkoutId) return null;
  }
  if (phase === 'unknown' && overallScore == null && !summary && !plannedWorkoutId) {
    return null;
  }
  if (phase === 'unknown' && (overallScore != null || summary)) {
    phase = 'ready';
  }

  return {
    plannedWorkoutId,
    overallScore,
    summary,
    phase,
    statusLabel,
  };
}

function mapExercisePrescription(exercise: WorkoutExerciseApi): string | null {
  const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
  if (sets.length === 0) return null;

  const bits: string[] = [`${sets.length} set${sets.length === 1 ? '' : 's'}`];
  const reps = sets.map((s) => s.reps).filter((r): r is number => typeof r === 'number' && r > 0);
  if (reps.length > 0) {
    const same = reps.every((r) => r === reps[0]);
    bits.push(same ? `${reps[0]} reps` : `${Math.min(...reps)}–${Math.max(...reps)} reps`);
  }
  const weights = sets
    .map((s) => s.weight)
    .filter((w): w is number => typeof w === 'number' && w > 0);
  if (weights.length > 0) {
    const unit =
      typeof sets[0]?.weightUnit === 'string' && sets[0].weightUnit.trim()
        ? sets[0].weightUnit.trim()
        : 'kg';
    const same = weights.every((w) => w === weights[0]);
    bits.push(
      same ? `${weights[0]} ${unit}` : `${Math.min(...weights)}–${Math.max(...weights)} ${unit}`,
    );
  }
  const rpes = sets.map((s) => s.rpe).filter((r): r is number => typeof r === 'number' && r > 0);
  if (rpes.length > 0) {
    const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length;
    bits.push(`RPE ${avg.toFixed(1)}`);
  }
  return bits.join(' · ');
}

export function mapCompletedExercises(raw: WorkoutSummaryApi): CompletedExercise[] {
  const list = Array.isArray(raw.exercises) ? raw.exercises : [];
  const out: CompletedExercise[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const name =
      (typeof row.exercise?.title === 'string' && row.exercise.title.trim()) ||
      (typeof row.exercise?.name === 'string' && row.exercise.name.trim()) ||
      null;
    if (!name) continue;
    out.push({
      name,
      prescription: mapExercisePrescription(row),
    });
    if (out.length >= COMPLETED_EXERCISE_MAX) break;
  }
  return out;
}

const FUEL_STATE_LABELS: Record<number, string> = {
  1: 'Easy fuel day',
  2: 'Moderate fuel day',
  3: 'High fuel day',
};

export function mapFuelingPrepGlance(
  raw: FuelingPrepApi | null | undefined,
  strategy?: string | null,
): FuelingPrepGlance | null {
  const plan = raw?.fuelingPlan;
  if (!plan || typeof plan !== 'object') return null;
  const totals = plan.dailyTotals;
  if (!totals || typeof totals !== 'object') return null;

  const carbs =
    typeof totals.carbs === 'number' && Number.isFinite(totals.carbs) && totals.carbs > 0
      ? `${Math.round(totals.carbs)} g carbs`
      : null;
  const calories =
    typeof totals.calories === 'number' && Number.isFinite(totals.calories) && totals.calories > 0
      ? `${Math.round(totals.calories)} kcal`
      : null;
  const fuelState =
    typeof totals.fuelState === 'number' && Number.isFinite(totals.fuelState)
      ? FUEL_STATE_LABELS[totals.fuelState] || `Fuel state ${totals.fuelState}`
      : null;
  const strategyLabel =
    typeof strategy === 'string' && strategy.trim() && strategy.trim().toUpperCase() !== 'STANDARD'
      ? titleCaseToken(strategy.trim())
      : null;
  const note =
    Array.isArray(plan.notes) && typeof plan.notes[0] === 'string' && plan.notes[0].trim()
      ? truncateDisplay(plan.notes[0], 160)
      : null;

  if (!carbs && !calories && !fuelState && !strategyLabel && !note) return null;

  return {
    carbsLabel: carbs,
    caloriesLabel: calories,
    fuelStateLabel: fuelState,
    strategyLabel,
    note,
  };
}

export function mapCoachInstructions(structuredWorkout: unknown): string | null {
  if (!structuredWorkout || typeof structuredWorkout !== 'object') return null;
  const value = (structuredWorkout as { coachInstructions?: unknown }).coachInstructions;
  if (typeof value !== 'string' || !value.trim()) return null;
  return truncateDisplay(value, COACH_INSTRUCTIONS_MAX);
}

function formatPaceMps(mps: number): string {
  return mpsToPaceLabel(mps, '/km');
}

function mapZoneBands(ranges: unknown, formatBound: (n: number) => string): PlannedZoneBand[] {
  if (!Array.isArray(ranges)) return [];
  const bands: PlannedZoneBand[] = [];
  for (let i = 0; i < ranges.length && bands.length < ZONE_BAND_MAX; i++) {
    const row = ranges[i];
    if (!row || typeof row !== 'object') continue;
    const r = row as { min?: unknown; max?: unknown; name?: unknown };
    const min = typeof r.min === 'number' && Number.isFinite(r.min) ? r.min : null;
    const max = typeof r.max === 'number' && Number.isFinite(r.max) ? r.max : null;
    if (min == null && max == null) continue;
    const name =
      typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `Z${bands.length + 1}`;
    const lo = min != null ? formatBound(min) : '?';
    const hi = max != null ? formatBound(max) : '?';
    bands.push({ name, rangeLabel: `${lo}–${hi}` });
  }
  return bands;
}

/**
 * Compact zone summary from `structuredWorkout.zoneProfileSnapshot`.
 * Prefers power → heart rate → pace. Returns null when absent/empty.
 */
export function mapZoneSummary(structuredWorkout: unknown): PlannedZoneSummary | null {
  if (!structuredWorkout || typeof structuredWorkout !== 'object') return null;
  const snapshot = (structuredWorkout as { zoneProfileSnapshot?: unknown }).zoneProfileSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as {
    power?: { ranges?: unknown };
    heartRate?: { ranges?: unknown };
    pace?: { ranges?: unknown };
  };

  const powerBands = mapZoneBands(s.power?.ranges, (n) => `${Math.round(n)} W`);
  if (powerBands.length > 0) return { channelLabel: 'Power', bands: powerBands };

  const hrBands = mapZoneBands(s.heartRate?.ranges, (n) => `${Math.round(n)} bpm`);
  if (hrBands.length > 0) return { channelLabel: 'Heart rate', bands: hrBands };

  const paceBands = mapZoneBands(s.pace?.ranges, formatPaceMps);
  if (paceBands.length > 0) return { channelLabel: 'Pace', bands: paceBands };

  return null;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00:00(?:\.0+)?(?:Z|[+-]00:?00)?)?$/;

export function formatActivityDate(date: string | Date | null | undefined): string | null {
  if (date == null) return null;
  let d: Date;
  if (typeof date === 'string') {
    const trimmed = date.trim();
    const dateOnly = DATE_ONLY_RE.exec(trimmed);
    if (dateOnly) {
      d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    } else {
      d = new Date(trimmed);
    }
  } else {
    d = date;
  }
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Honest sync/analysis status from server fields only.
 * Workout list exposes `aiAnalysisStatus`; there is no workout `syncStatus` on the list DTO.
 */
export function mapWorkoutStatus(raw: {
  aiAnalysisStatus?: string | null;
  streams?: { id?: string } | null;
}): ActivityRowStatus {
  const status = (raw.aiAnalysisStatus || '').toUpperCase();

  switch (status) {
    case 'COMPLETED':
      return { kind: 'ready', label: 'Ready' };
    case 'PROCESSING':
    case 'PENDING':
      return { kind: 'processing', label: 'Processing…' };
    case 'FAILED':
      return { kind: 'failed', label: 'Analysis failed' };
    case 'NOT_STARTED':
      return { kind: 'uploaded', label: 'Uploaded' };
    default:
      if (raw.streams?.id) {
        return { kind: 'uploaded', label: 'Uploaded' };
      }
      if (!raw.aiAnalysisStatus) {
        return { kind: 'unknown', label: 'Uploaded' };
      }
      return { kind: 'unknown', label: 'Uploaded' };
  }
}

function loadLabel(tss: number | null, trainingLoad: number | null): string | null {
  if (tss != null && Number.isFinite(tss)) return `TSS ${Math.round(tss)}`;
  if (trainingLoad != null && Number.isFinite(trainingLoad)) {
    return `Load ${Math.round(trainingLoad)}`;
  }
  return null;
}

export function mapWorkoutListItem(raw: WorkoutListItemApi): ActivityListItem {
  const tss = typeof raw.tss === 'number' ? raw.tss : null;
  const trainingLoad = typeof raw.trainingLoad === 'number' ? raw.trainingLoad : null;
  return {
    id: raw.id,
    title: raw.title?.trim() || 'Workout',
    date: raw.date ? String(raw.date) : null,
    type: raw.type ?? null,
    durationSec: typeof raw.durationSec === 'number' ? raw.durationSec : null,
    tss,
    trainingLoad,
    status: mapWorkoutStatus(raw),
    summaryPolyline: raw.summaryPolyline ?? null,
  };
}

function scoreEntry(key: string, label: string, value: unknown): AnalysisScore | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 1 || n > 10) return null;
  return { key, label, value: n };
}

function mapAnalysisPhase(status: string | null | undefined): AnalysisPhase {
  const upper = (status || '').toUpperCase();
  switch (upper) {
    case 'COMPLETED':
      return 'ready';
    case 'PENDING':
    case 'PROCESSING':
      return 'analyzing';
    case 'FAILED':
      return 'failed';
    case 'QUOTA_EXCEEDED':
      return 'quota';
    case 'NOT_STARTED':
    case '':
      return 'not_started';
    default:
      return 'unknown';
  }
}

function analysisStatusLabel(phase: AnalysisPhase): string {
  switch (phase) {
    case 'ready':
      return 'Analysis ready';
    case 'analyzing':
      return 'Analyzing…';
    case 'failed':
      return 'Analysis failed';
    case 'quota':
      return 'Analysis quota exceeded';
    case 'not_started':
      return 'Not analyzed yet';
    default:
      return 'Analysis status unknown';
  }
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) continue;
    out.push(item.trim());
    if (out.length >= max) break;
  }
  return out;
}

export function mapActivityAnalysis(raw: WorkoutSummaryApi): ActivityAnalysis {
  const phase = mapAnalysisPhase(raw.aiAnalysisStatus);
  const scores: AnalysisScore[] = [];
  for (const entry of [
    scoreEntry('overall', 'Overall', raw.overallScore),
    scoreEntry('technical', 'Technical', raw.technicalScore),
    scoreEntry('effort', 'Effort', raw.effortScore),
    scoreEntry('pacing', 'Pacing', raw.pacingScore),
    scoreEntry('execution', 'Execution', raw.executionScore),
  ]) {
    if (entry) scores.push(entry);
  }

  let executiveSummary: string | null = null;
  const sections: AnalysisSection[] = [];
  const recommendations: AnalysisRecommendation[] = [];
  let strengths: string[] = [];
  let weaknesses: string[] = [];

  const json = raw.aiAnalysisJson;
  if (json && typeof json === 'object') {
    const body = json as Record<string, unknown>;
    if (typeof body.executive_summary === 'string' && body.executive_summary.trim()) {
      executiveSummary = body.executive_summary.trim();
    }

    if (Array.isArray(body.sections)) {
      for (const row of body.sections) {
        if (!row || typeof row !== 'object') continue;
        const s = row as Record<string, unknown>;
        const title = typeof s.title === 'string' ? s.title.trim() : '';
        if (!title) continue;
        const statusLabel =
          typeof s.status_label === 'string' && s.status_label.trim()
            ? s.status_label.trim()
            : typeof s.status === 'string' && s.status.trim()
              ? titleCaseToken(s.status)
              : null;
        const points = stringList(s.analysis_points, ANALYSIS_POINT_MAX);
        sections.push({ title, statusLabel, points });
        if (sections.length >= ANALYSIS_SECTION_MAX) break;
      }
    }

    if (Array.isArray(body.recommendations)) {
      for (const row of body.recommendations) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const title = typeof r.title === 'string' ? r.title.trim() : '';
        const description = typeof r.description === 'string' ? r.description.trim() : '';
        if (!title && !description) continue;
        recommendations.push({
          title: title || 'Recommendation',
          description,
          priority: typeof r.priority === 'string' ? r.priority : null,
        });
        if (recommendations.length >= ANALYSIS_REC_MAX) break;
      }
    }

    strengths = stringList(body.strengths, ANALYSIS_BULLET_MAX);
    weaknesses = stringList(body.weaknesses, ANALYSIS_BULLET_MAX);

    // Prefer top-level score columns; fill from JSON scores if missing.
    if (scores.length === 0 && body.scores && typeof body.scores === 'object') {
      const nested = body.scores as Record<string, unknown>;
      for (const entry of [
        scoreEntry('overall', 'Overall', nested.overall),
        scoreEntry('technical', 'Technical', nested.technical),
        scoreEntry('effort', 'Effort', nested.effort),
        scoreEntry('pacing', 'Pacing', nested.pacing),
        scoreEntry('execution', 'Execution', nested.execution),
      ]) {
        if (entry) scores.push(entry);
      }
    }
  }

  const markdownFallback =
    !executiveSummary && typeof raw.aiAnalysis === 'string' && raw.aiAnalysis.trim()
      ? truncateDisplay(raw.aiAnalysis, 1200)
      : null;

  const analyzedAt =
    raw.aiAnalyzedAt != null
      ? typeof raw.aiAnalyzedAt === 'string'
        ? raw.aiAnalyzedAt
        : raw.aiAnalyzedAt.toISOString()
      : null;

  const hasContent = Boolean(
    scores.length > 0 ||
    executiveSummary ||
    sections.length > 0 ||
    recommendations.length > 0 ||
    strengths.length > 0 ||
    weaknesses.length > 0 ||
    markdownFallback,
  );

  return {
    phase,
    statusLabel: analysisStatusLabel(phase),
    scores,
    executiveSummary,
    sections,
    recommendations,
    strengths,
    weaknesses,
    markdownFallback,
    analyzedAt,
    hasContent,
  };
}

export function mapWorkoutSummary(
  raw: WorkoutSummaryApi,
  distanceUnits: DistanceDisplayUnits = 'Kilometers',
): ActivitySummary {
  const base = mapWorkoutListItem(raw);
  const adherence = mapPlanAdherence(raw);
  const plannedWorkoutId =
    adherence?.plannedWorkoutId ||
    (typeof raw.plannedWorkoutId === 'string' && raw.plannedWorkoutId.trim()) ||
    null;
  return {
    ...base,
    description: typeof raw.description === 'string' ? raw.description : null,
    loadLabel: loadLabel(base.tss, base.trainingLoad),
    metrics: mapWorkoutSummaryMetrics(raw, distanceUnits),
    analysis: mapActivityAnalysis(raw),
    plannedWorkoutId,
    planAdherence: adherence,
    exercises: mapCompletedExercises(raw),
  };
}

export function mapPlannedListItem(
  raw: PlannedListItemApi,
  refs: ChartTargetRefs = emptyChartRefs(),
): PlannedListItem {
  const structuredWorkout = raw.structuredWorkout;
  const chartBlocks =
    hasStructuredWorkoutPreviewData(structuredWorkout) &&
    !Array.isArray((structuredWorkout as { blocks?: unknown[] })?.blocks) &&
    !Array.isArray((structuredWorkout as { exercises?: unknown[] })?.exercises)
      ? buildStructureChartBlocks(structuredWorkout, refs)
      : [];

  return {
    id: raw.id,
    title: raw.title?.trim() || 'Planned workout',
    date: raw.date ? String(raw.date) : null,
    type: raw.type ?? null,
    durationSec: typeof raw.durationSec === 'number' ? raw.durationSec : null,
    tss: typeof raw.tss === 'number' ? raw.tss : null,
    ...(chartBlocks.length >= 2 ? { structureChartBlocks: chartBlocks } : {}),
  };
}

type StepTarget = {
  value?: number;
  range?: { min?: number; max?: number; start?: number; end?: number };
  units?: string;
};

function unitsLookLikeZone(units: string | null | undefined): boolean {
  if (!units || typeof units !== 'string') return false;
  const u = units.toLowerCase().trim();
  return (
    u.includes('zone') ||
    u === 'z' ||
    /^z\d/.test(u) ||
    u.startsWith('hr_zone') ||
    u.startsWith('power_zone') ||
    u.startsWith('pace_zone')
  );
}

function targetRangeBounds(range: StepTarget['range']): { min: number | null; max: number | null } {
  if (!range) return { min: null, max: null };
  const min =
    typeof range.min === 'number'
      ? range.min
      : typeof range.start === 'number'
        ? range.start
        : null;
  const max =
    typeof range.max === 'number' ? range.max : typeof range.end === 'number' ? range.end : null;
  return { min, max };
}

function zoneLabelFromNumber(
  zoneNumber: number,
  bands: PlannedZoneBand[] | null | undefined,
): string | null {
  const n = Math.round(zoneNumber);
  if (!Number.isFinite(n) || n < 1 || n > 9) return null;
  const band = bands?.find((b) => {
    const match = /^Z\s*(\d+)\b/i.exec(b.name) || /(?:zone\s*)?(\d+)/i.exec(b.name);
    return match != null && Number(match[1]) === n;
  });
  if (band?.rangeLabel) return `Z${n} · ${band.rangeLabel}`;
  return `Z${n}`;
}

function intensityFromZoneTarget(
  target: StepTarget,
  bands: PlannedZoneBand[] | null | undefined,
): string | null {
  if (!unitsLookLikeZone(target.units)) return null;
  if (typeof target.value === 'number') {
    return zoneLabelFromNumber(target.value, bands);
  }
  const { min, max } = targetRangeBounds(target.range);
  if (min != null && max != null && min === max) {
    return zoneLabelFromNumber(min, bands);
  }
  if (min != null && max != null) {
    const lo = zoneLabelFromNumber(min, bands);
    const hi = zoneLabelFromNumber(max, bands);
    if (lo && hi) {
      // "Z2 · …" / "Z3 · …" → "Z2–Z3" when bands differ; keep first band detail if same zone.
      const loZone = /^Z(\d+)/.exec(lo)?.[1];
      const hiZone = /^Z(\d+)/.exec(hi)?.[1];
      if (loZone && hiZone && loZone !== hiZone) return `Z${loZone}–Z${hiZone}`;
      return lo;
    }
  }
  if (min != null) return zoneLabelFromNumber(min, bands);
  if (max != null) return zoneLabelFromNumber(max, bands);
  return null;
}

function formatPercentFtpLabel(raw: number): string {
  const pct = raw > 0 && raw <= 3 ? Math.round(raw * 100) : Math.round(raw);
  return `${pct}% FTP`;
}

function intensityFromStep(
  step: Record<string, unknown>,
  bands?: PlannedZoneBand[] | null,
): string | null {
  const rpe = step.rpe;
  if (typeof rpe === 'number') return `RPE ${rpe}`;

  const power = step.power as StepTarget | undefined;
  if (power) {
    const zoneLabel = intensityFromZoneTarget(power, bands);
    if (zoneLabel) return zoneLabel;
    if (unitsLookLikePercentFtp(power.units)) {
      if (typeof power.value === 'number') return formatPercentFtpLabel(power.value);
      const { min, max } = targetRangeBounds(power.range);
      if (min != null && max != null) {
        return `${formatPercentFtpLabel(min).replace(' FTP', '')}–${formatPercentFtpLabel(max)}`;
      }
      if (min != null) return formatPercentFtpLabel(min);
      if (max != null) return formatPercentFtpLabel(max);
    }
    // Bare fractional values (≤3) match chart relative-% semantics — not watts.
    if (
      typeof power.value === 'number' &&
      (!power.units || power.units === '') &&
      power.value > 0 &&
      power.value <= 3
    ) {
      return formatPercentFtpLabel(power.value);
    }
    if (typeof power.value === 'number') return `${Math.round(power.value)} W`;
    const { min, max } = targetRangeBounds(power.range);
    if (min != null || max != null) {
      const lo = min != null ? Math.round(min) : '?';
      const hi = max != null ? Math.round(max) : '?';
      return `${lo}–${hi} W`;
    }
  }

  const hr = step.heartRate as StepTarget | undefined;
  if (hr) {
    const zoneLabel = intensityFromZoneTarget(hr, bands);
    if (zoneLabel) return zoneLabel;
    if (typeof hr.value === 'number') return `${Math.round(hr.value)} bpm`;
    const { min, max } = targetRangeBounds(hr.range);
    if (min != null || max != null) {
      const lo = min != null ? Math.round(min) : '?';
      const hi = max != null ? Math.round(max) : '?';
      return `${lo}–${hi} bpm`;
    }
  }

  const pace = step.pace as StepTarget | undefined;
  if (pace) {
    const zoneLabel = intensityFromZoneTarget(pace, bands);
    if (zoneLabel) return zoneLabel;
    if (typeof pace.value === 'number') return `Pace ${pace.value}`;
  }

  const pct = step.intensity ?? step.percentFtp ?? step.ftpPercent;
  if (typeof pct === 'number') return `${Math.round(pct)}%`;

  return null;
}

/**
 * Cadence target label for a structured step ("90 rpm" / "85–95 rpm").
 * Cadence is a canonical editor target in coach-wattz's workout-support-matrix;
 * shown after intensity in the step meta line (CW-302).
 */
function cadenceFromStep(step: Record<string, unknown>): string | null {
  const cadence = step.cadence as StepTarget | number | undefined;
  if (cadence == null) return null;
  if (typeof cadence === 'number') {
    return Number.isFinite(cadence) && cadence > 0 ? `${Math.round(cadence)} rpm` : null;
  }
  if (typeof cadence !== 'object') return null;
  const rawUnits = typeof cadence.units === 'string' ? cadence.units.toLowerCase().trim() : '';
  const unit = rawUnits === 'spm' ? 'spm' : 'rpm';
  if (typeof cadence.value === 'number' && cadence.value > 0) {
    return `${Math.round(cadence.value)} ${unit}`;
  }
  const { min, max } = targetRangeBounds(cadence.range);
  if (min != null && max != null) {
    if (Math.round(min) === Math.round(max)) return `${Math.round(min)} ${unit}`;
    return `${Math.round(min)}–${Math.round(max)} ${unit}`;
  }
  if (min != null) return `${Math.round(min)}+ ${unit}`;
  if (max != null) return `≤${Math.round(max)} ${unit}`;
  return null;
}

function stepDurationSec(step: Record<string, unknown>): number | null {
  const sec = step.durationSeconds ?? step.durationSec ?? step.duration;
  if (typeof sec === 'number' && sec > 0) {
    // Some payloads store duration in minutes when < 1000 and labeled oddly; prefer seconds when large.
    return sec;
  }
  return null;
}

function stepName(step: Record<string, unknown>, index: number): string {
  const name = step.name ?? step.title ?? step.type ?? step.intent;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return `Step ${index + 1}`;
}

function flattenSteps(
  nodes: unknown[],
  out: PlannedStructureStep[],
  depth = 0,
  bands?: PlannedZoneBand[] | null,
  refs: ChartTargetRefs = emptyChartRefs(),
  snapshot?: ZoneProfileSnapshot,
): void {
  if (depth > 3) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const step = node as Record<string, unknown>;
    const nested = step.steps;
    if (Array.isArray(nested) && nested.length > 0) {
      const reps =
        typeof step.reps === 'number'
          ? step.reps
          : typeof step.repeat === 'number'
            ? step.repeat
            : null;
      if (reps != null && reps > 1) {
        out.push({
          name: `${stepName(step, out.length)} ×${reps}`,
          durationSec: null,
          intensityLabel: null,
        });
      }
      flattenSteps(nested, out, depth + 1, bands, refs, snapshot);
      continue;
    }
    const intensityLabel = intensityFromStep(step, bands);
    const fromLabel = stepIntensity({ intensityLabel });
    const chartIntensity = resolveChartStepIntensity(step, refs, snapshot);
    let zoneIndex: number | null = fromLabel.zoneIndex ?? null;
    if (chartIntensity != null) {
      const power = step.power as { units?: string; value?: number } | undefined;
      const hr = step.heartRate as { units?: string; value?: number } | undefined;
      if (power && unitsLookLikeZone(power.units) && typeof power.value === 'number') {
        zoneIndex = Math.max(0, Math.round(power.value) - 1);
      } else if (hr && unitsLookLikeZone(hr.units) && typeof hr.value === 'number') {
        zoneIndex = Math.max(0, Math.round(hr.value) - 1);
      } else {
        zoneIndex = zoneIndexFromIntensity(chartIntensity);
      }
    }
    out.push({
      name: stepName(step, out.length),
      durationSec: stepDurationSec(step),
      intensityLabel,
      cadenceLabel: cadenceFromStep(step),
      zoneIndex,
    });
  }
}

function summarizeSetRowField(
  setRows: Record<string, unknown>[],
  field: 'value' | 'loadValue',
): string | null {
  const values = setRows
    .map((row) => {
      const raw = row[field];
      return typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
    })
    .filter(Boolean);
  if (values.length === 0) return null;
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0]! : unique.join(', ');
}

function formatRestLabel(rest: string): string {
  const trimmed = rest.trim();
  if (!trimmed) return '';
  return /rest/i.test(trimmed) ? trimmed : `${trimmed} rest`;
}

/**
 * Compact strength prescription from setRows / legacy exercise fields.
 * Example: `3×5 · 80kg · 90s rest`
 */
export function strengthPrescriptionLabel(exercise: Record<string, unknown>): string | null {
  const setRows = Array.isArray(exercise.setRows)
    ? (exercise.setRows.filter((row) => row && typeof row === 'object') as Record<
        string,
        unknown
      >[])
    : [];
  const setsFromRows = setRows.length;
  const setsFromField = typeof exercise.sets === 'number' && exercise.sets > 0 ? exercise.sets : 0;
  const sets = setsFromRows || setsFromField;

  const prescriptionMode =
    typeof exercise.prescriptionMode === 'string' ? exercise.prescriptionMode : null;
  const valueSummary =
    summarizeSetRowField(setRows, 'value') ??
    (typeof exercise.reps === 'string' && exercise.reps.trim()
      ? exercise.reps.trim()
      : typeof exercise.reps === 'number'
        ? String(exercise.reps)
        : typeof exercise.value === 'string' && exercise.value.trim()
          ? exercise.value.trim()
          : typeof exercise.duration === 'number' && exercise.duration > 0
            ? String(exercise.duration)
            : null);
  const loadSummary =
    summarizeSetRowField(setRows, 'loadValue') ??
    (typeof exercise.weight === 'string' && exercise.weight.trim() ? exercise.weight.trim() : null);

  const restOverride = setRows.find((row) => {
    const rest = row.restOverride;
    return typeof rest === 'string' && rest.trim();
  })?.restOverride;
  const restRaw =
    (typeof exercise.defaultRest === 'string' && exercise.defaultRest.trim()
      ? exercise.defaultRest.trim()
      : null) ??
    (typeof restOverride === 'string' && restOverride.trim() ? restOverride.trim() : null) ??
    (typeof exercise.rest === 'string' && exercise.rest.trim() ? exercise.rest.trim() : null);

  const parts: string[] = [];

  if (prescriptionMode === 'duration' && valueSummary) {
    const durationLabel = /^\d+$/.test(valueSummary) ? `${valueSummary}s` : valueSummary;
    parts.push(sets > 0 ? `${sets}×${durationLabel}` : durationLabel);
  } else if (valueSummary) {
    const reps =
      prescriptionMode === 'reps_per_side' && !/\/side$/i.test(valueSummary)
        ? `${valueSummary}/side`
        : valueSummary;
    parts.push(sets > 0 ? `${sets}×${reps}` : reps);
  } else if (sets > 0) {
    parts.push(`${sets} sets`);
  }

  if (loadSummary) parts.push(loadSummary);
  if (restRaw) {
    const restLabel = formatRestLabel(restRaw);
    if (restLabel) parts.push(restLabel);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function strengthDurationSec(exercise: Record<string, unknown>): number | null {
  const mode = typeof exercise.prescriptionMode === 'string' ? exercise.prescriptionMode : null;
  if (mode !== 'duration') return null;

  const setRows = Array.isArray(exercise.setRows)
    ? (exercise.setRows.filter((row) => row && typeof row === 'object') as Record<
        string,
        unknown
      >[])
    : [];
  const valueSummary = summarizeSetRowField(setRows, 'value');
  if (valueSummary && /^\d+$/.test(valueSummary)) {
    const sec = Number(valueSummary);
    return sec > 0 ? sec : null;
  }
  if (typeof exercise.duration === 'number' && exercise.duration > 0) {
    return exercise.duration;
  }
  return null;
}

function strengthBlockTitle(block: Record<string, unknown>): string | null {
  if (typeof block.title === 'string' && block.title.trim()) return block.title.trim();
  const type = typeof block.type === 'string' ? block.type : null;
  if (type === 'warmup') return 'Warm-up';
  if (type === 'cooldown') return 'Cool-down';
  return null;
}

function mapStrengthExercise(
  exercise: Record<string, unknown>,
  index: number,
): PlannedStructureStep {
  return {
    name: stepName(exercise, index),
    durationSec: strengthDurationSec(exercise),
    intensityLabel: strengthPrescriptionLabel(exercise),
  };
}

function flattenStrengthBlocks(blocks: unknown[]): PlannedStructureStep[] {
  const out: PlannedStructureStep[] = [];
  for (const node of blocks) {
    if (!node || typeof node !== 'object') continue;
    const block = node as Record<string, unknown>;
    const title = strengthBlockTitle(block);
    const steps = Array.isArray(block.steps) ? block.steps : [];
    if (title) {
      out.push({ name: title, durationSec: null, intensityLabel: null, isSection: true });
    }
    for (const stepNode of steps) {
      if (!stepNode || typeof stepNode !== 'object') continue;
      out.push(mapStrengthExercise(stepNode as Record<string, unknown>, out.length));
    }
  }
  return out;
}

function flattenStrengthExercises(exercises: unknown[]): PlannedStructureStep[] {
  const out: PlannedStructureStep[] = [];
  for (const node of exercises) {
    if (!node || typeof node !== 'object') continue;
    out.push(mapStrengthExercise(node as Record<string, unknown>, out.length));
  }
  return out;
}

export type MappedPlannedStructure = {
  steps: PlannedStructureStep[];
  isStrength: boolean;
};

/**
 * Compact structure summary from `structuredWorkout`.
 * Prefers strength `blocks`, then legacy `exercises`, then endurance `steps`/`intervals`.
 * Returns empty steps when absent — never invents structure.
 */
export function mapPlannedStructure(
  structuredWorkout: unknown,
  refs: ChartTargetRefs = emptyChartRefs(),
): MappedPlannedStructure {
  if (!structuredWorkout || typeof structuredWorkout !== 'object') {
    return { steps: [], isStrength: false };
  }
  const root = structuredWorkout as {
    blocks?: unknown[];
    exercises?: unknown[];
    steps?: unknown[];
    intervals?: unknown[];
    zoneProfileSnapshot?: unknown;
  };

  if (Array.isArray(root.blocks) && root.blocks.length > 0) {
    return { steps: flattenStrengthBlocks(root.blocks).slice(0, 24), isStrength: true };
  }
  if (Array.isArray(root.exercises) && root.exercises.length > 0) {
    return { steps: flattenStrengthExercises(root.exercises).slice(0, 24), isStrength: true };
  }

  const bands = mapZoneSummary(structuredWorkout)?.bands ?? null;
  const snapshot =
    root.zoneProfileSnapshot && typeof root.zoneProfileSnapshot === 'object'
      ? (root.zoneProfileSnapshot as ZoneProfileSnapshot)
      : undefined;
  const out: PlannedStructureStep[] = [];
  if (Array.isArray(root.steps) && root.steps.length > 0) {
    flattenSteps(root.steps, out, 0, bands, refs, snapshot);
  } else if (Array.isArray(root.intervals) && root.intervals.length > 0) {
    flattenSteps(root.intervals, out, 0, bands, refs, snapshot);
  }
  return { steps: out.slice(0, 24), isStrength: false };
}

function mapLinkedCompleted(raw: PlannedDetailApi): PlannedDetail['linkedCompleted'] {
  const list = Array.isArray(raw.completedWorkouts) ? raw.completedWorkouts : [];
  const first = list.find((row) => row && typeof row.id === 'string' && row.id.trim());
  if (!first) return null;
  return {
    id: first.id,
    title: first.title?.trim() || 'Completed activity',
    date: first.date ? String(first.date) : null,
    type: first.type ?? null,
  };
}

export function mapPlannedDetail(
  raw: PlannedDetailApi,
  refs: ChartTargetRefs = emptyChartRefs(),
): PlannedDetail {
  const base = mapPlannedListItem(raw, refs);
  const structure = mapPlannedStructure(raw.structuredWorkout, refs);
  const structureSource = raw.structuredWorkout ?? null;
  const structureChartBlocks = structure.isStrength
    ? []
    : buildStructureChartBlocks(structureSource, refs);
  const completionStatus =
    typeof raw.completionStatus === 'string' && raw.completionStatus.trim()
      ? raw.completionStatus.trim().toUpperCase()
      : null;
  const terminal =
    completionStatus === 'COMPLETED' ||
    completionStatus === 'SKIPPED' ||
    completionStatus === 'MISSED';
  return {
    ...base,
    description: typeof raw.description === 'string' ? raw.description : null,
    structureSteps: structure.steps,
    structureIsStrength: structure.isStrength,
    structureChartBlocks,
    structureSource,
    workIntensityLabel: formatIntensityFactor(raw.workIntensity),
    completionLabel: mapCompletionLabel(raw.completionStatus),
    completionStatus,
    syncLabel: mapSyncLabel(raw.syncStatus),
    coachInstructions: mapCoachInstructions(raw.structuredWorkout),
    zoneSummary: mapZoneSummary(raw.structuredWorkout),
    fuelingStrategy:
      typeof raw.fuelingStrategy === 'string' && raw.fuelingStrategy.trim()
        ? raw.fuelingStrategy.trim()
        : null,
    linkedCompleted: mapLinkedCompleted(raw),
    complianceActionable: !terminal,
  };
}

export function workoutWebPath(id: string): string {
  return `/workouts/${id}`;
}

export function plannedWorkoutWebPath(id: string): string {
  return `/workouts/planned/${id}`;
}

export function absoluteInstanceUrl(instanceUrl: string, path: string): string {
  const base = instanceUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
