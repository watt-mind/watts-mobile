export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'OTHER';

/** Metric keys for the web-aligned MacroExplain analysis sheet. */
export type MacroExplainLabel = 'Calories' | 'Carbs' | 'Protein' | 'Fat';

/**
 * Typed subset of fuelingPlan used for target analysis sheets.
 * Mirrors fields consumed by coach-wattz MacroExplainModal.
 */
export type FuelingPlanWorkoutCalories = {
  title: string;
  calories: number;
  sourceType: 'actual' | 'estimated';
};

export type FuelingPlanWindow = {
  type: string;
  targetCarbs: number;
  targetProtein: number;
  targetFat: number;
};

export type FuelingPlanDailyTotals = {
  calories: number | null;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  fluid: number | null;
  baseCalories: number | null;
  baseCaloriesMode: 'AUTO' | 'MANUAL_NON_EXERCISE' | null;
  activityCalories: number | null;
  adjustmentCalories: number | null;
  fuelState: 1 | 2 | 3 | null;
  workoutCalories: FuelingPlanWorkoutCalories[];
};

export type FuelingPlanAnalysis = {
  dailyTotals: FuelingPlanDailyTotals;
  windows: FuelingPlanWindow[];
};

/** API meal bucket keys used by PATCH /api/nutrition/{id}/items. */
export type ApiMealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

/** One logged food item from a nutrition day row (breakfast/lunch/dinner/snacks). */
export type NutritionLoggedItem = {
  id: string | null;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: ApiMealType;
  amount?: number;
  unit?: string;
  loggedAt: string | null;
};

export type NutritionDayTotals = {
  id: string | null;
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  isEmpty: boolean;
  /** Individual logged items for the day (flattened meal buckets). */
  items: NutritionLoggedItem[];
  /** Free-text day note from the nutrition row. */
  notes: string | null;
  /** Canonical fueling-plan targets from GET /api/nutrition; null when no plan for the day. */
  caloriesGoal: number | null;
  proteinGoal: number | null;
  carbsGoal: number | null;
  fatGoal: number | null;
  fluidGoalMl: number | null;
  hasGoals: boolean;
  /** Fueling periodization state for the day: 1 = Eco, 2 = Steady, 3 = Performance. */
  fuelState: 1 | 2 | 3 | null;
  /** Breakdown fields for analysis sheets; null when the row has no plan. */
  fuelingPlan: FuelingPlanAnalysis | null;
};

export type NextFuelingWindow = {
  /** e.g. "Dinner", "Pre-workout", "Intra-workout" */
  label: string;
  startTime: string; // ISO
  targetCarbs: number;
  targetProtein: number;
  workoutTitle: string | null;
};

export type NutritionItemPayload = {
  name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  meal?: MealSlot;
  logged_at: string;
};

export type NutritionUploadPayload = {
  date: string;
  items: NutritionItemPayload[];
};

export type HydrationQuickAddPayload = {
  date: string;
  volumeMl: number;
};

export type NutritionQuickLogForm = {
  meal: MealSlot;
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

export const MEAL_OPTIONS: { value: MealSlot; label: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'DINNER', label: 'Dinner' },
  { value: 'SNACK', label: 'Snack' },
  { value: 'OTHER', label: 'Other' },
];
