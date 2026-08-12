import { localDateYmd } from '@/src/lib/date';
import { parseDecimal } from '@/src/lib/parseDecimal';

import { EDIT_ITEM_INVALID_NUMBER, EDIT_ITEM_NEGATIVE } from './editNutritionItemForm';
import type {
  ApiMealType,
  FuelingPlanAnalysis,
  FuelingPlanDailyTotals,
  FuelingPlanWindow,
  FuelingPlanWorkoutCalories,
  MacroExplainLabel,
  MealSlot,
  NextFuelingWindow,
  NutritionDayTotals,
  NutritionItemPayload,
  NutritionLoggedItem,
  NutritionQuickLogForm,
  NutritionUploadPayload,
} from './types';

const API_MEAL_TYPES: ApiMealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export function mealSlotToApiMealType(slot: MealSlot): ApiMealType {
  switch (slot) {
    case 'BREAKFAST':
      return 'breakfast';
    case 'LUNCH':
      return 'lunch';
    case 'DINNER':
      return 'dinner';
    case 'SNACK':
    case 'OTHER':
    default:
      return 'snacks';
  }
}

export function apiMealTypeToMealSlot(mealType: ApiMealType): MealSlot {
  switch (mealType) {
    case 'breakfast':
      return 'BREAKFAST';
    case 'lunch':
      return 'LUNCH';
    case 'dinner':
      return 'DINNER';
    case 'snacks':
      return 'SNACK';
  }
}

export function apiMealTypeLabel(mealType: ApiMealType): string {
  switch (mealType) {
    case 'breakfast':
      return 'Breakfast';
    case 'lunch':
      return 'Lunch';
    case 'dinner':
      return 'Dinner';
    case 'snacks':
      return 'Snack';
  }
}

function mapLoggedItem(raw: unknown, mealType: ApiMealType): NutritionLoggedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Untitled item';
  return {
    id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null,
    name,
    calories: Math.round(asNumber(r.calories)),
    protein: roundMacro(asNumber(r.protein)),
    carbs: roundMacro(asNumber(r.carbs)),
    fat: roundMacro(asNumber(r.fat)),
    mealType,
    amount:
      r.amount != null && Number.isFinite(asNumber(r.amount)) ? asNumber(r.amount) : undefined,
    unit: typeof r.unit === 'string' && r.unit.trim() ? r.unit.trim() : undefined,
    loggedAt:
      typeof r.logged_at === 'string' && r.logged_at.trim()
        ? r.logged_at.trim()
        : typeof r.loggedAt === 'string' && r.loggedAt.trim()
          ? r.loggedAt.trim()
          : null,
  };
}

/** Flatten breakfast/lunch/dinner/snacks arrays from a nutrition day row. */
export function mapNutritionLoggedItems(row: Record<string, unknown>): NutritionLoggedItem[] {
  const items: NutritionLoggedItem[] = [];
  for (const mealType of API_MEAL_TYPES) {
    const bucket = row[mealType];
    if (!Array.isArray(bucket)) continue;
    for (const raw of bucket) {
      const item = mapLoggedItem(raw, mealType);
      if (item) items.push(item);
    }
  }
  return items;
}

/** Optimistic helper: remove one item by id from a day totals snapshot. */
export function removeItemFromDay(day: NutritionDayTotals, itemId: string): NutritionDayTotals {
  const items = day.items.filter((item) => item.id !== itemId);
  return { ...day, items, isEmpty: items.length === 0 && day.waterMl === 0 };
}

export function emptyNutritionDay(date = localDateYmd()): NutritionDayTotals {
  return {
    id: null,
    date,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    waterMl: 0,
    isEmpty: true,
    items: [],
    notes: null,
    caloriesGoal: null,
    proteinGoal: null,
    carbsGoal: null,
    fatGoal: null,
    fluidGoalMl: null,
    hasGoals: false,
    fuelState: null,
    fuelingPlan: null,
  };
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asGoal(value: unknown): number | null {
  const n = asNumber(value);
  return n > 0 ? n : null;
}

function planDailyTotals(plan: unknown): Record<string, unknown> | null {
  if (!plan || typeof plan !== 'object') return null;
  const totals = (plan as Record<string, unknown>).dailyTotals;
  if (!totals || typeof totals !== 'object') return null;
  return totals as Record<string, unknown>;
}

/** Daily fluid target lives inside the row's fuelingPlan JSON (dailyTotals.fluid, ml). */
function fluidGoalFromPlan(plan: unknown): number | null {
  return asGoal(planDailyTotals(plan)?.fluid);
}

function fuelStateFromPlan(plan: unknown): 1 | 2 | 3 | null {
  const n = asNumber(planDailyTotals(plan)?.fuelState);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

function asOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = asNumber(value);
  return Number.isFinite(n) ? n : null;
}

function mapWorkoutCalories(raw: unknown): FuelingPlanWorkoutCalories[] {
  if (!Array.isArray(raw)) return [];
  const out: FuelingPlanWorkoutCalories[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Record<string, unknown>;
    const calories = asNumber(w.calories);
    if (!(calories > 0)) continue;
    out.push({
      title: typeof w.title === 'string' && w.title.trim() ? w.title.trim() : 'Training Demand',
      calories,
      sourceType: w.sourceType === 'actual' ? 'actual' : 'estimated',
    });
  }
  return out;
}

function mapPlanWindows(raw: unknown): FuelingPlanWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: FuelingPlanWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Record<string, unknown>;
    out.push({
      type: String(w.type ?? ''),
      targetCarbs: Math.max(0, roundMacro(asNumber(w.targetCarbs))),
      targetProtein: Math.max(0, roundMacro(asNumber(w.targetProtein))),
      targetFat: Math.max(0, roundMacro(asNumber(w.targetFat))),
    });
  }
  return out;
}

/** Retain the fueling-plan subset needed for calorie/macro analysis sheets. */
export function mapFuelingPlanAnalysis(plan: unknown): FuelingPlanAnalysis | null {
  if (!plan || typeof plan !== 'object') return null;
  const root = plan as Record<string, unknown>;
  const totalsRaw = planDailyTotals(plan);
  if (!totalsRaw && !Array.isArray(root.windows)) return null;

  const modeRaw = totalsRaw?.baseCaloriesMode;
  const baseCaloriesMode = modeRaw === 'MANUAL_NON_EXERCISE' || modeRaw === 'AUTO' ? modeRaw : null;

  const dailyTotals: FuelingPlanDailyTotals = {
    calories: asOptionalNumber(totalsRaw?.calories),
    carbs: asOptionalNumber(totalsRaw?.carbs),
    protein: asOptionalNumber(totalsRaw?.protein),
    fat: asOptionalNumber(totalsRaw?.fat),
    fluid: asOptionalNumber(totalsRaw?.fluid),
    baseCalories: asOptionalNumber(totalsRaw?.baseCalories),
    baseCaloriesMode,
    activityCalories: asOptionalNumber(totalsRaw?.activityCalories),
    adjustmentCalories: asOptionalNumber(totalsRaw?.adjustmentCalories),
    fuelState: fuelStateFromPlan(plan),
    workoutCalories: mapWorkoutCalories(totalsRaw?.workoutCalories),
  };

  return {
    dailyTotals,
    windows: mapPlanWindows(root.windows),
  };
}

export function fuelStateLabel(state: 1 | 2 | 3): string {
  return state === 3 ? 'Performance day' : state === 2 ? 'Steady day' : 'Eco day';
}

/** True when the metric can open an analysis sheet (goal and/or fueling plan). */
export function canExplainMetric(day: NutritionDayTotals, label: MacroExplainLabel): boolean {
  if (day.fuelingPlan != null) return true;
  switch (label) {
    case 'Calories':
      return day.caloriesGoal != null;
    case 'Carbs':
      return day.carbsGoal != null;
    case 'Protein':
      return day.proteinGoal != null;
    case 'Fat':
      return day.fatGoal != null;
  }
}

/** Pick today’s row from GET /api/nutrition response. */
export function pickTodayNutrition(payload: unknown, today = localDateYmd()): NutritionDayTotals {
  const empty = emptyNutritionDay(today);
  if (!payload || typeof payload !== 'object') return empty;

  const root = payload as Record<string, unknown>;
  const rows = Array.isArray(root.nutrition)
    ? root.nutrition
    : Array.isArray(payload)
      ? payload
      : null;
  if (!rows) return empty;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const date = r.date != null ? String(r.date).slice(0, 10) : '';
    if (date !== today) continue;

    const calories = Math.round(asNumber(r.calories));
    const protein = roundMacro(asNumber(r.protein));
    const carbs = roundMacro(asNumber(r.carbs));
    const fat = roundMacro(asNumber(r.fat));
    const waterMl = Math.round(asNumber(r.waterMl));
    const isEmpty = calories === 0 && protein === 0 && carbs === 0 && fat === 0 && waterMl === 0;

    const caloriesGoal =
      asGoal(r.caloriesGoal) != null ? Math.round(asGoal(r.caloriesGoal)!) : null;
    const proteinGoal = asGoal(r.proteinGoal) != null ? roundMacro(asGoal(r.proteinGoal)!) : null;
    const carbsGoal = asGoal(r.carbsGoal) != null ? roundMacro(asGoal(r.carbsGoal)!) : null;
    const fatGoal = asGoal(r.fatGoal) != null ? roundMacro(asGoal(r.fatGoal)!) : null;
    const fluidGoalMl =
      fluidGoalFromPlan(r.fuelingPlan) != null
        ? Math.round(fluidGoalFromPlan(r.fuelingPlan)!)
        : null;

    const fuelingPlan = mapFuelingPlanAnalysis(r.fuelingPlan);
    const items = mapNutritionLoggedItems(r);
    const notes = typeof r.notes === 'string' ? r.notes : r.notes == null ? null : String(r.notes);

    return {
      id: r.id != null ? String(r.id) : null,
      date,
      calories,
      protein,
      carbs,
      fat,
      waterMl,
      isEmpty,
      items,
      notes,
      caloriesGoal,
      proteinGoal,
      carbsGoal,
      fatGoal,
      fluidGoalMl,
      hasGoals: caloriesGoal != null || proteinGoal != null || carbsGoal != null || fatGoal != null,
      fuelState: fuelStateFromPlan(r.fuelingPlan),
      fuelingPlan,
    };
  }

  return empty;
}

/**
 * Parse an optional quick-log numeric field. Comma decimals are accepted
 * (CW-484) — `Number("27,5")` was NaN, so the item logged with calories but no
 * carbs/protein/fat.
 */
function parseOptionalNumber(value: string): number | undefined {
  const n = parseDecimal(value);
  return n == null ? undefined : n;
}

export type QuickLogNumericField = 'calories' | 'protein' | 'carbs' | 'fat';

const QUICK_LOG_NUMERIC_FIELDS = ['calories', 'protein', 'carbs', 'fat'] as const;

/**
 * Add and edit must agree on the rules for the same data (CW-349), so the quick-log
 * messages are the edit sheet's constants rather than a second copy of the wording —
 * changing one can no longer leave the other behind.
 */
export const QUICK_LOG_INVALID_NUMBER = EDIT_ITEM_INVALID_NUMBER;
export const QUICK_LOG_NEGATIVE = EDIT_ITEM_NEGATIVE;

/**
 * Quick-log fields that were filled in but cannot be parsed. Callers should block
 * the save and surface these rather than posting an item with missing macros.
 */
export function quickLogInvalidFields(form: NutritionQuickLogForm): QuickLogNumericField[] {
  return QUICK_LOG_NUMERIC_FIELDS.filter(
    (key) => form[key].trim() && parseOptionalNumber(form[key]) === undefined,
  );
}

/**
 * Quick-log fields that parse fine but are negative. Kept separate from
 * {@link quickLogInvalidFields} so callers can tell "I could not read this" from
 * "I read it and it cannot be negative" and show the right message.
 */
export function quickLogNegativeFields(form: NutritionQuickLogForm): QuickLogNumericField[] {
  return QUICK_LOG_NUMERIC_FIELDS.filter((key) => {
    const parsed = parseOptionalNumber(form[key]);
    return parsed != null && parsed < 0;
  });
}

/**
 * The single validation gate for both quick-log save paths (`LogMealSheet.onSubmit`
 * and `NutritionSection.onLogItem`). Returns the message to surface, or null when
 * the form is safe to upload. A blank optional macro is "not provided", not an error.
 *
 * Unparseable is reported ahead of negative: it is the more fundamental problem, and
 * a value we could not read has no sign to complain about.
 */
export function quickLogValidationError(form: NutritionQuickLogForm): string | null {
  if (quickLogInvalidFields(form).length > 0) return QUICK_LOG_INVALID_NUMBER;
  if (quickLogNegativeFields(form).length > 0) return QUICK_LOG_NEGATIVE;
  return null;
}

export function emptyQuickLogForm(meal: MealSlot = 'SNACK'): NutritionQuickLogForm {
  return {
    meal,
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  };
}

export function quickLogHasContent(form: NutritionQuickLogForm): boolean {
  return Boolean(
    form.name.trim() ||
    form.calories.trim() ||
    form.protein.trim() ||
    form.carbs.trim() ||
    form.fat.trim(),
  );
}

export function toNutritionUploadPayload(
  form: NutritionQuickLogForm,
  date = localDateYmd(),
  loggedAt = new Date(),
): NutritionUploadPayload {
  const item: NutritionItemPayload = {
    meal: form.meal,
    logged_at: loggedAt.toISOString(),
  };

  const name = form.name.trim();
  if (name) item.name = name;

  const calories = parseOptionalNumber(form.calories);
  const protein = parseOptionalNumber(form.protein);
  const carbs = parseOptionalNumber(form.carbs);
  const fat = parseOptionalNumber(form.fat);

  // Defence in depth (CW-349): callers gate on quickLogValidationError first, but a
  // negative macro must never reach the server — it silently decrements the day's
  // totals, which is worse than a rejected save.
  if (calories != null) item.calories = Math.max(0, Math.round(calories));
  if (protein != null) item.protein = Math.max(0, roundMacro(protein));
  if (carbs != null) item.carbs = Math.max(0, roundMacro(carbs));
  if (fat != null) item.fat = Math.max(0, roundMacro(fat));

  return { date, items: [item] };
}

export type MealHistoryEntry = {
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

/**
 * Build the meal-history record for a quick-log form.
 *
 * Extracted from `LogMealSheet.onSubmit` (CW-519): the history write still used raw
 * `Number(form.protein)`, so on a comma-decimal device — where the decimal-pad's only
 * separator key emits ',' — `Number('27,5')` was NaN and the macro was silently
 * dropped from the saved entry. The upload alongside it parsed correctly (CW-349), so
 * the day's totals looked right and nothing warned the user; the loss only surfaced
 * later, when re-picking the meal from history prefilled a short form.
 *
 * Parsing goes through the same `parseOptionalNumber` → `parseDecimal` path as
 * `toNutritionUploadPayload` so the two writes cannot drift apart again. Only the
 * parser changed: a macro is still recorded only when it is strictly greater than
 * zero, and blank, zero, negative and unparseable values all stay `undefined`.
 */
export function toMealHistoryEntry(form: NutritionQuickLogForm): MealHistoryEntry {
  const positive = (value: string): number | undefined => {
    const n = parseOptionalNumber(value);
    return n != null && n > 0 ? n : undefined;
  };

  return {
    // Left untrimmed on purpose — `saveMealToHistory` trims and dedupes the name itself.
    name: form.name,
    calories: positive(form.calories),
    protein: positive(form.protein),
    carbs: positive(form.carbs),
    fat: positive(form.fat),
  };
}

export function nutritionWebPath(): string {
  return '/nutrition';
}

export function roundMacro(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function formatMacroGrams(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = roundMacro(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const WINDOW_TYPE_LABELS: Record<string, string> = {
  PRE_WORKOUT: 'Pre-workout',
  INTRA_WORKOUT: 'Intra-workout',
  POST_WORKOUT: 'Post-workout',
  WORKOUT_EVENT: 'Workout',
  TRANSITION: 'Transition',
  DAILY_BASE: 'Meal',
  general_day: 'Meal',
};

/** Pick the next upcoming window from GET /api/nutrition/upcoming-plan. */
export function pickNextFuelingWindow(
  payload: unknown,
  now = new Date(),
): NextFuelingWindow | null {
  if (!payload || typeof payload !== 'object') return null;
  const windows = (payload as Record<string, unknown>).windows;
  if (!Array.isArray(windows)) return null;

  let best: NextFuelingWindow | null = null;
  let bestStart = Infinity;
  for (const w of windows) {
    if (!w || typeof w !== 'object') continue;
    const r = w as Record<string, unknown>;
    const start = Date.parse(String(r.startTime ?? ''));
    const end = Date.parse(String(r.endTime ?? ''));
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end <= now.getTime()) continue;
    if (start >= bestStart) continue;

    const slotName = typeof r.slotName === 'string' && r.slotName.trim() ? r.slotName.trim() : null;
    const type = String(r.type ?? '');
    bestStart = start;
    best = {
      label: slotName ?? WINDOW_TYPE_LABELS[type] ?? 'Fueling window',
      startTime: new Date(start).toISOString(),
      targetCarbs: Math.round(asNumber(r.targetCarbs)),
      targetProtein: Math.round(asNumber(r.targetProtein)),
      workoutTitle:
        typeof r.workoutTitle === 'string' && r.workoutTitle.trim() ? r.workoutTitle.trim() : null,
    };
  }
  return best;
}

export function formatWindowTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Progress toward a goal as 0–100, clamped; null when there is no goal. */
export function goalProgressPct(value: number, goal: number | null): number | null {
  if (goal == null || goal <= 0 || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round((value / goal) * 100)));
}
