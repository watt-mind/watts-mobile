import { localDateYmd } from '@/src/lib/date';

import { fuelStateLabel } from './mapNutrition';

export type FuelStateCode = 1 | 2 | 3;

export type HydrationRingStatus = 'green' | 'yellow' | 'red';

export type NutritionStrategyStanding = {
  hydrationDebtMl: number;
  hydrationStatus: HydrationRingStatus;
  /** Server advice fragment; null when debt is not noteworthy. */
  hydrationAdvice: string | null;
  showHydrationFlushPrompt: boolean;
  hydrationFlushPrompt: string | null;
  summary: string | null;
  /** Today's matrix row when present. */
  todayFuelState: FuelStateCode | null;
  todayFuelLabel: string | null;
  todayCarbsTarget: number | null;
  todayIsRest: boolean;
  matrix: {
    dateKey: string;
    state: FuelStateCode;
    label: string;
    carbsTarget: number | null;
    isRest: boolean;
  }[];
};

export type EnergyWavePoint = {
  timestampMs: number;
  level: number;
  /** Whether this point's intake was logged, assumed from the plan, or projected forward. */
  intakeProvenance?: 'logged' | 'assumed' | 'projected';
};

export type ActiveFuelFeedEntry = {
  kind: 'recommendation' | 'suggested' | 'recent';
  title: string;
  detail: string | null;
};

export type ActiveFuelFeedView = {
  entries: ActiveFuelFeedEntry[];
  empty: boolean;
};

const FUEL_EXPLAIN: Record<
  FuelStateCode | 'rest',
  { meaning: string; guidance: string; note: string }
> = {
  1: {
    meaning:
      'Lower-demand training day with conservative carb targets to reinforce metabolic efficiency.',
    guidance: 'Keep carbs closer to baseline, prioritize quality protein, and spread meals evenly.',
    note: 'Eco days are not under-fueling days. They are controlled intake days with enough energy for recovery.',
  },
  2: {
    meaning:
      'Moderate training demand day where carb intake should support session quality and next-day readiness.',
    guidance: 'Use normal pre/post workout carb timing and maintain your regular hydration rhythm.',
    note: 'Steady is your consistency zone. Hitting these days well keeps the full week stable.',
  },
  3: {
    meaning:
      'High-output day with aggressive fueling targets to protect quality and prevent late-session drop-off.',
    guidance:
      'Front-load carbs before key work, fuel during longer sessions, and recover quickly after.',
    note: 'Performance days are where strategic carbs matter most for adaptation and execution.',
  },
  rest: {
    meaning:
      'No workout-specific fueling windows were planned, so only base daily fueling targets apply.',
    guidance:
      'Focus on recovery habits, hydration, protein distribution, and micronutrient quality.',
    note: 'Rest-day fueling still matters for recovery even without a session.',
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asFuelState(value: unknown): FuelStateCode | null {
  const n = asNumber(value);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

export function mapNutritionStrategy(payload: unknown): NutritionStrategyStanding | null {
  const root = asRecord(payload);
  if (!root) return null;

  const matrixRaw = Array.isArray(root.fuelingMatrix) ? root.fuelingMatrix : [];
  const matrix = matrixRaw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      const state = asFuelState(r.state);
      if (!state) return null;
      const dateKey = typeof r.date === 'string' ? r.date.slice(0, 10) : '';
      if (!dateKey) return null;
      return {
        dateKey,
        state,
        label:
          typeof r.label === 'string' && r.label.trim()
            ? r.label.trim()
            : fuelStateLabel(state).replace(/ day$/, ''),
        carbsTarget: asNumber(r.carbsTarget),
        isRest: Boolean(r.isRest),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const todayKey = localDateYmd();
  const today = matrix.find((d) => d.dateKey === todayKey) ?? matrix[0] ?? null;

  const debt = Math.max(0, Math.round(asNumber(root.hydrationDebt) ?? 0));
  const statusRaw = String(root.hydrationStatus ?? 'green');
  const hydrationStatus: HydrationRingStatus =
    statusRaw === 'red' || statusRaw === 'yellow' || statusRaw === 'green' ? statusRaw : 'green';

  const adviceRaw = root.hydrationAdvice;
  const hydrationAdvice =
    typeof adviceRaw === 'string' && adviceRaw.trim() ? adviceRaw.trim() : null;

  const flushPrompt =
    typeof root.hydrationFlushPrompt === 'string' && root.hydrationFlushPrompt.trim()
      ? root.hydrationFlushPrompt.trim()
      : null;

  return {
    hydrationDebtMl: debt,
    hydrationStatus,
    hydrationAdvice,
    showHydrationFlushPrompt: Boolean(root.showHydrationFlushPrompt),
    hydrationFlushPrompt: flushPrompt,
    summary: typeof root.summary === 'string' && root.summary.trim() ? root.summary.trim() : null,
    todayFuelState: today?.state ?? null,
    todayFuelLabel: today ? (today.isRest ? 'Rest day' : today.label) : null,
    todayCarbsTarget: today?.carbsTarget ?? null,
    todayIsRest: today?.isRest ?? false,
    matrix,
  };
}

export function fuelStateExplanation(input: {
  state: FuelStateCode | null;
  isRest?: boolean;
}): { title: string; meaning: string; guidance: string; note: string } | null {
  if (input.isRest) {
    const copy = FUEL_EXPLAIN.rest;
    return { title: 'Rest day', ...copy };
  }
  if (input.state == null) return null;
  const copy = FUEL_EXPLAIN[input.state];
  const title = input.state === 3 ? 'Performance' : input.state === 2 ? 'Steady' : 'Eco';
  return { title, ...copy };
}

/** Downsample dense wave points for a phone sparkline (keeps first/last). */
export function mapEnergyHorizonPoints(payload: unknown, maxPoints = 72): EnergyWavePoint[] {
  const root = asRecord(payload);
  const raw = Array.isArray(root?.points) ? root!.points : Array.isArray(payload) ? payload : [];
  const points: EnergyWavePoint[] = [];
  for (const p of raw) {
    const r = asRecord(p);
    if (!r) continue;
    const level = asNumber(r.level);
    const ts =
      asNumber(r.timestamp) ?? (typeof r.time === 'string' ? Date.parse(r.time) : null) ?? null;
    if (level == null || ts == null || !Number.isFinite(ts)) continue;
    const provenance = r.intakeProvenance;
    points.push({
      timestampMs: ts,
      level,
      intakeProvenance:
        provenance === 'logged' || provenance === 'assumed' || provenance === 'projected'
          ? provenance
          : undefined,
    });
  }
  points.sort((a, b) => a.timestampMs - b.timestampMs);
  if (points.length <= maxPoints) return points;

  const out: EnergyWavePoint[] = [];
  const last = points.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * last);
    out.push(points[idx]!);
  }
  return out;
}

export function mapActiveFuelFeed(payload: unknown): ActiveFuelFeedView {
  const root = asRecord(payload);
  if (!root) return { entries: [], empty: true };

  const entries: ActiveFuelFeedEntry[] = [];

  const mealRec = asRecord(root.mealRecommendation);
  if (mealRec) {
    const timing =
      typeof mealRec.timing === 'string' && mealRec.timing.trim() ? mealRec.timing.trim() : null;
    const reasoning =
      typeof mealRec.reasoningText === 'string' && mealRec.reasoningText.trim()
        ? mealRec.reasoningText.trim()
        : null;
    const title =
      typeof mealRec.title === 'string' && mealRec.title.trim()
        ? mealRec.title.trim()
        : (timing ?? 'Fueling suggestion');
    const detail = [timing && timing !== title ? timing : null, reasoning]
      .filter(Boolean)
      .join(' — ');
    entries.push({
      kind: 'recommendation',
      title,
      detail: detail || null,
    });
  }

  const suggested = asRecord(root.suggestedIntake);
  if (suggested && !mealRec) {
    const carbs = asNumber(suggested.carbs) ?? asNumber(suggested.targetCarbs);
    const label =
      typeof suggested.label === 'string' && suggested.label.trim()
        ? suggested.label.trim()
        : 'Suggested intake now';
    entries.push({
      kind: 'suggested',
      title: label,
      detail: carbs != null ? `${Math.round(carbs)}g carbs` : null,
    });
  }

  const recent = Array.isArray(root.recentItems) ? root.recentItems : [];
  for (const item of recent.slice(0, 3)) {
    const r = asRecord(item);
    if (!r) continue;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Logged food';
    const carbs = asNumber(r.carbs);
    const absorption = asNumber(r.absorptionProgress);
    const detailParts = [
      carbs != null ? `${Math.round(carbs)}g carbs` : null,
      absorption != null ? `${Math.round(absorption)}% absorbed` : null,
      typeof r.profileLabel === 'string' ? r.profileLabel : null,
    ].filter(Boolean);
    entries.push({
      kind: 'recent',
      title: name,
      detail: detailParts.length ? detailParts.join(' · ') : null,
    });
  }

  return { entries, empty: entries.length === 0 };
}

export function formatHydrationDebtLiters(ml: number): string {
  return `${(Math.max(0, ml) / 1000).toFixed(1)}L`;
}

export function hydrationStatusLabel(status: HydrationRingStatus): string {
  if (status === 'red') return 'High debt';
  if (status === 'yellow') return 'Elevated';
  return 'On track';
}

/** Mobile default matches web Strategy tab (`daysAhead: 3`). */
export const MOBILE_ENERGY_HORIZON_DAYS_AHEAD = 3;

/** False when the series is too flat or short to read on a phone. */
export function isHorizonLegible(points: EnergyWavePoint[]): boolean {
  if (points.length < 4) return false;
  const levels = points.map((p) => p.level);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const span = max - min;
  const mid = (max + min) / 2 || 1;
  return span >= 3 || span / Math.abs(mid) >= 0.04;
}
