import { PAL_MULTIPLIERS } from './nutritionSettingsOptions';
import {
  DEFAULT_NUTRITION_SETTINGS_FORM,
  DEFAULT_QUICK_ADD_VOLUMES,
  type ActivityLevel,
  type BaseCaloriesMode,
  type GoalProfile,
  type MealPatternItem,
  type NutritionSettingsForm,
  type NutritionSettingsPayload,
  type NutritionSettingsState,
} from './nutritionSettingsTypes';

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asMealPattern(value: unknown): MealPatternItem[] {
  if (!Array.isArray(value)) return [...DEFAULT_NUTRITION_SETTINGS_FORM.mealPattern];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as { name?: unknown; time?: unknown };
      if (typeof row.name !== 'string' || typeof row.time !== 'string') return null;
      return { name: row.name, time: row.time };
    })
    .filter((item): item is MealPatternItem => item != null);
}

/**
 * User-facing message shown when the three quick-add volumes are not distinct.
 * Exported so the settings form and the test suite share one string (CW-542).
 */
export const QUICK_ADD_DUPLICATE_VOLUMES_ERROR =
  'Quick-add volumes must be three different values.';

/**
 * Pure validator for the quick-add volume fields. Returns a user-facing message
 * when the volumes are not distinct, `null` otherwise.
 *
 * Kept here (rather than inside the form component) so it stays reachable by the
 * vitest suite, which only collects pure `.test.ts` files under `src`.
 */
export function quickAddVolumesError(values: number[]): string | null {
  const rounded = values
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value));
  if (new Set(rounded).size !== rounded.length) return QUICK_ADD_DUPLICATE_VOLUMES_ERROR;
  return null;
}

export function normalizeQuickAddVolumes(values: unknown): [number, number, number] {
  const fallback = [...DEFAULT_QUICK_ADD_VOLUMES] as [number, number, number];
  if (!Array.isArray(values)) return fallback;

  const normalized = Array.from(
    new Set(
      values
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 50 && value <= 2000),
    ),
  )
    .slice(0, 3)
    .sort((a, b) => a - b);

  // Backfill with the first default NOT already present. Indexing the defaults by
  // position (the previous `fallback[normalized.length]`) reintroduced duplicates
  // for payloads such as [750] or [500, 750] (CW-542). Three distinct defaults
  // against fewer than three distinct kept values always leaves enough spares.
  for (const candidate of fallback) {
    if (normalized.length >= 3) break;
    if (!normalized.includes(candidate)) normalized.push(candidate);
  }
  normalized.sort((a, b) => a - b);

  return [normalized[0]!, normalized[1]!, normalized[2]!];
}

const ACTIVITY_LEVELS = new Set<ActivityLevel>([
  'SEDENTARY',
  'LIGHTLY_ACTIVE',
  'ACTIVE',
  'MODERATELY_ACTIVE',
  'VERY_ACTIVE',
  'EXTRA_ACTIVE',
]);

function asActivityLevel(value: unknown): ActivityLevel {
  return typeof value === 'string' && ACTIVITY_LEVELS.has(value as ActivityLevel)
    ? (value as ActivityLevel)
    : DEFAULT_NUTRITION_SETTINGS_FORM.activityLevel;
}

function asBaseMode(value: unknown): BaseCaloriesMode {
  return value === 'MANUAL_NON_EXERCISE' ? 'MANUAL_NON_EXERCISE' : 'AUTO';
}

function asGoalProfile(value: unknown): GoalProfile {
  if (value === 'LOSE' || value === 'GAIN' || value === 'MAINTAIN') return value;
  return 'MAINTAIN';
}

export function mapNutritionSettingsResponse(json: unknown): NutritionSettingsState {
  const root = (json && typeof json === 'object' ? json : {}) as {
    settings?: Record<string, unknown>;
  };
  const raw = (root.settings && typeof root.settings === 'object' ? root.settings : {}) as Record<
    string,
    unknown
  >;
  const user = (raw.user && typeof raw.user === 'object' ? raw.user : {}) as {
    weight?: unknown;
  };
  const d = DEFAULT_NUTRITION_SETTINGS_FORM;

  return {
    nutritionTrackingEnabled: Boolean(raw.nutritionTrackingEnabled),
    bmr: asNumber(raw.bmr, d.bmr),
    activityLevel: asActivityLevel(raw.activityLevel),
    baseCaloriesMode: asBaseMode(raw.baseCaloriesMode),
    nonExerciseBaseCalories:
      raw.nonExerciseBaseCalories == null
        ? null
        : asNumber(raw.nonExerciseBaseCalories, d.nonExerciseBaseCalories ?? 2000),
    currentCarbMax: asNumber(raw.currentCarbMax, d.currentCarbMax),
    ultimateCarbGoal: asNumber(raw.ultimateCarbGoal, d.ultimateCarbGoal),
    baseProteinPerKg: asNumber(raw.baseProteinPerKg, d.baseProteinPerKg),
    baseFatPerKg: asNumber(raw.baseFatPerKg, d.baseFatPerKg),
    sweatRate: asNumber(raw.sweatRate, d.sweatRate),
    sodiumTarget: asNumber(raw.sodiumTarget, d.sodiumTarget),
    quickAddVolumes: normalizeQuickAddVolumes(raw.quickAddVolumes),
    preWorkoutWindow: asNumber(raw.preWorkoutWindow, d.preWorkoutWindow),
    postWorkoutWindow: asNumber(raw.postWorkoutWindow, d.postWorkoutWindow),
    carbsPerHourLow: asNumber(raw.carbsPerHourLow, d.carbsPerHourLow),
    carbsPerHourMedium: asNumber(raw.carbsPerHourMedium, d.carbsPerHourMedium),
    carbsPerHourHigh: asNumber(raw.carbsPerHourHigh, d.carbsPerHourHigh),
    carbScalingFactor: asNumber(raw.carbScalingFactor, d.carbScalingFactor),
    fuelingSensitivity: asNumber(raw.fuelingSensitivity, d.fuelingSensitivity),
    fuelState1Trigger: asNumber(raw.fuelState1Trigger, d.fuelState1Trigger),
    fuelState1Min: asNumber(raw.fuelState1Min, d.fuelState1Min),
    fuelState1Max: asNumber(raw.fuelState1Max, d.fuelState1Max),
    fuelState2Trigger: asNumber(raw.fuelState2Trigger, d.fuelState2Trigger),
    fuelState2Min: asNumber(raw.fuelState2Min, d.fuelState2Min),
    fuelState2Max: asNumber(raw.fuelState2Max, d.fuelState2Max),
    fuelState3Min: asNumber(raw.fuelState3Min, d.fuelState3Min),
    fuelState3Max: asNumber(raw.fuelState3Max, d.fuelState3Max),
    metabolicFloor: asNumber(raw.metabolicFloor, d.metabolicFloor),
    enabledSupplements: asStringArray(raw.enabledSupplements),
    goalProfile: asGoalProfile(raw.goalProfile),
    targetAdjustmentPercent: asNumber(raw.targetAdjustmentPercent, d.targetAdjustmentPercent),
    mealPattern: asMealPattern(raw.mealPattern),
    dietaryProfile: asStringArray(raw.dietaryProfile),
    foodAllergies: asStringArray(raw.foodAllergies),
    foodIntolerances: asStringArray(raw.foodIntolerances),
    lifestyleExclusions: asStringArray(raw.lifestyleExclusions),
    weightKg: asNumber(user.weight, 75),
  };
}

export function toNutritionSettingsPayload(form: NutritionSettingsForm): NutritionSettingsPayload {
  return {
    ...form,
    quickAddVolumes: normalizeQuickAddVolumes(form.quickAddVolumes),
    mealPattern: form.mealPattern.map((m) => ({
      name: m.name.trim() || 'Meal',
      time: m.time.trim() || '08:00',
    })),
    nonExerciseBaseCalories:
      form.baseCaloriesMode === 'MANUAL_NON_EXERCISE'
        ? form.nonExerciseBaseCalories
        : form.nonExerciseBaseCalories,
  };
}

export function computeTdee(
  form: Pick<
    NutritionSettingsForm,
    'baseCaloriesMode' | 'nonExerciseBaseCalories' | 'bmr' | 'activityLevel'
  >,
): number {
  if (form.baseCaloriesMode === 'MANUAL_NON_EXERCISE') {
    return Math.round(form.nonExerciseBaseCalories || 0);
  }
  const pal = PAL_MULTIPLIERS[form.activityLevel] || 1.2;
  return Math.round(form.bmr * pal);
}

export function computeTargetCalories(form: NutritionSettingsForm): number {
  const adjustment = form.targetAdjustmentPercent || 0;
  return Math.round(computeTdee(form) * (1 + adjustment / 100));
}

export function defaultAdjustmentForGoal(goal: GoalProfile): number {
  if (goal === 'LOSE') return -15;
  if (goal === 'GAIN') return 10;
  return 0;
}

export function hydrationPresetVolumes(
  quickAddVolumes: unknown,
  fallback: [number, number, number] = DEFAULT_QUICK_ADD_VOLUMES,
): [number, number, number] {
  if (quickAddVolumes == null) return fallback;
  return normalizeQuickAddVolumes(quickAddVolumes);
}

export function settingsFormEquals(a: NutritionSettingsForm, b: NutritionSettingsForm): boolean {
  return (
    JSON.stringify(toNutritionSettingsPayload(a)) === JSON.stringify(toNutritionSettingsPayload(b))
  );
}
