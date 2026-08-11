import { dateKeysInRange, localDateKey } from '@/src/lib/date';

import type {
  GroceryItemView,
  NutritionPlanApi,
  NutritionPlanDayView,
  NutritionPlanMealApi,
  NutritionPlanMealView,
  NutritionPlanWindowView,
} from './types';

/** True when the plan meal has a catalog/selection payload (not just an empty fueling window). */
export function mealHasSelection(meal: NutritionPlanMealApi): boolean {
  const json = meal.mealJson;
  if (!json || typeof json !== 'object') return false;
  const o = json as Record<string, unknown>;
  if (typeof o.title === 'string' && o.title.trim()) return true;
  if (typeof o.name === 'string' && o.name.trim()) return true;
  if (Array.isArray(o.ingredients) && o.ingredients.length > 0) return true;
  return false;
}

function mealTitle(meal: NutritionPlanMealApi): string {
  const json = meal.mealJson;
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (typeof o.title === 'string' && o.title.trim()) return o.title.trim();
    if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
  }
  return meal.windowType ? String(meal.windowType).replace(/_/g, ' ') : 'Meal';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(value as string | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function scheduledLabelFrom(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(value as string | Date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function mapNutritionMeal(meal: NutritionPlanMealApi): NutritionPlanMealView | null {
  if (!meal?.id) return null;
  if (!mealHasSelection(meal)) return null;
  const dateKey = localDateKey(meal.date ?? meal.scheduledAt);
  if (!dateKey) return null;
  return {
    id: meal.id,
    dateKey,
    windowType: meal.windowType ? String(meal.windowType) : 'MEAL',
    status: meal.status ? String(meal.status) : 'PLANNED',
    title: mealTitle(meal),
    scheduledLabel: scheduledLabelFrom(meal.scheduledAt),
    mealPayload: meal.mealJson ?? undefined,
  };
}

function weekdayLabelForKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function toDailyBaseKey(slotName?: string | null): string {
  const normalized = (slotName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return normalized ? `DAILY_BASE:${normalized}` : 'DAILY_BASE';
}

function slotNameFromWindow(window: Record<string, unknown>): string {
  const slot =
    (typeof window.slotName === 'string' && window.slotName) ||
    (typeof window.label === 'string' && window.label) ||
    '';
  if (slot) return slot;
  return String(window.type ?? '') === 'DAILY_BASE' ? 'Meal' : '';
}

/**
 * Stable per-day identity for a fueling window.
 *
 * The API stamps every window with a `windowKey`, because a day can hold more than one window of
 * the same type (two sessions produce two PRE_WORKOUT windows). Older payloads carry no key, in
 * which case the bare type addresses the first window of that type.
 */
export function resolveWindowKey(window: Record<string, unknown>): string {
  const explicit = typeof window.windowKey === 'string' ? window.windowKey.trim() : '';
  if (explicit) return explicit;

  const type = String(window.type ?? '');
  if (!type) return '';
  if (type === 'DAILY_BASE') return toDailyBaseKey(slotNameFromWindow(window));
  return `${type}#1`;
}

/** Strips the per-day ordinal from a window key: `PRE_WORKOUT#2` -> `PRE_WORKOUT`. */
function baseWindowType(value: string): string {
  const hash = value.indexOf('#');
  return hash >= 0 ? value.slice(0, hash) : value;
}

/** Match a plan meal row to a fueling-plan window (web WeeklyPlanDashboard parity). */
export function matchesMealToWindow(
  meal: NutritionPlanMealApi,
  window: Record<string, unknown>,
): boolean {
  const windowType = String(window.type ?? '');
  const mealType = String(meal.windowType ?? '');
  if (!windowType || !mealType) return false;

  const key = resolveWindowKey(window);
  if (mealType === key) return true;

  // Meals locked before windows had stable keys stored the bare type. Those can only have referred
  // to the first window of that type on the day, so match them there and nowhere else.
  if (mealType === windowType && key === `${windowType}#1`) return true;
  if (windowType === 'DAILY_BASE' && mealType === 'DAILY_BASE') return true;

  return false;
}

function windowOrder(type: string): number {
  const normalized = baseWindowType(String(type || '')).toUpperCase();
  if (normalized.startsWith('DAILY_BASE')) return 10;
  if (normalized === 'PRE_WORKOUT') return 20;
  if (normalized === 'INTRA_WORKOUT') return 30;
  if (normalized === 'POST_WORKOUT') return 40;
  if (normalized === 'REFILL') return 50;
  return 60;
}

function startTimeMs(window: NutritionPlanWindowView): number {
  if (!window.startTime) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(window.startTime);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

/**
 * Orders a day the way it is eaten. Ordering by type instead rendered a two-session day as
 * meals, then every pre-workout, then every intra — which reads nothing like the actual day.
 */
function compareWindows(a: NutritionPlanWindowView, b: NutritionPlanWindowView): number {
  const byTime = startTimeMs(a) - startTimeMs(b);
  if (byTime !== 0) return byTime;
  return windowOrder(a.windowType) - windowOrder(b.windowType);
}

function humanizeWindowTypeLabel(type: string, slotName?: string | null): string {
  if (slotName?.trim()) return slotName.trim();
  if (type.startsWith('DAILY_BASE:')) {
    return type
      .slice('DAILY_BASE:'.length)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function targetsFromMeal(meal: NutritionPlanMealApi): {
  carbs: number;
  protein: number;
  kcal: number;
} {
  const target =
    meal.targetJson && typeof meal.targetJson === 'object'
      ? (meal.targetJson as Record<string, unknown>)
      : {};
  const mealJson =
    meal.mealJson && typeof meal.mealJson === 'object'
      ? (meal.mealJson as Record<string, unknown>)
      : {};
  const totals =
    mealJson.totals && typeof mealJson.totals === 'object'
      ? (mealJson.totals as Record<string, unknown>)
      : {};
  return {
    carbs: asNumber(target.carbs ?? totals.carbs),
    protein: asNumber(target.protein ?? totals.protein),
    kcal: asNumber(target.kcal ?? totals.kcal ?? totals.calories),
  };
}

function mealViewFromApi(
  meal: NutritionPlanMealApi,
  dateKey: string,
): NutritionPlanMealView | null {
  if (!meal?.id || !mealHasSelection(meal)) return null;
  return {
    id: meal.id,
    dateKey,
    windowType: meal.windowType ? String(meal.windowType) : 'MEAL',
    status: meal.status ? String(meal.status) : 'PLANNED',
    title: mealTitle(meal),
    scheduledLabel: scheduledLabelFrom(meal.scheduledAt),
    mealPayload: meal.mealJson ?? undefined,
  };
}

function summaryDays(plan: NutritionPlanApi | null | undefined): unknown[] {
  const summary = plan?.summaryJson;
  if (!summary || typeof summary !== 'object') return [];
  const days = (summary as { days?: unknown }).days;
  return Array.isArray(days) ? days : [];
}

function windowsForDay(
  dateKey: string,
  dayMeals: NutritionPlanMealApi[],
  plan: NutritionPlanApi | null | undefined,
): NutritionPlanWindowView[] {
  const daySummary = summaryDays(plan).find(
    (d) =>
      d &&
      typeof d === 'object' &&
      String((d as { date?: unknown }).date ?? '').slice(0, 10) === dateKey,
  ) as { fuelingPlan?: { windows?: unknown } } | undefined;

  const summaryWindowsRaw = daySummary?.fuelingPlan?.windows;
  const summaryWindows: NutritionPlanWindowView[] = Array.isArray(summaryWindowsRaw)
    ? summaryWindowsRaw
        .map((raw, index): NutritionPlanWindowView | null => {
          if (!raw || typeof raw !== 'object') return null;
          const window = raw as Record<string, unknown>;
          const type = String(window.type ?? 'MEAL');
          const slotName = slotNameFromWindow(window) || null;
          const matching = dayMeals.find((meal) => matchesMealToWindow(meal, window));
          const fromMeal = matching ? targetsFromMeal(matching) : null;
          const targets = {
            carbs: fromMeal?.carbs || asNumber(window.targetCarbs),
            protein: fromMeal?.protein || asNumber(window.targetProtein),
            kcal: fromMeal?.kcal || asNumber(window.targetKcal),
          };
          const label =
            (typeof window.label === 'string' && window.label.trim()) ||
            humanizeWindowTypeLabel(type, slotName);
          const windowKey = resolveWindowKey(window) || `${type}#${index + 1}`;
          const startTime =
            typeof window.startTime === 'string' && window.startTime.trim()
              ? window.startTime
              : null;
          return {
            key: `${dateKey}:${windowKey}`,
            windowType: baseWindowType(type),
            windowKey,
            label,
            slotName,
            startTime,
            scheduledLabel:
              scheduledLabelFrom(matching?.scheduledAt) ?? scheduledLabelFrom(window.startTime),
            targetCarbs: Math.round(targets.carbs),
            targetProtein: Math.round(targets.protein),
            targetKcal: Math.round(targets.kcal),
            meal: matching ? mealViewFromApi(matching, dateKey) : null,
          };
        })
        .filter((w): w is NutritionPlanWindowView => Boolean(w))
    : [];

  const fallbackWindows: NutritionPlanWindowView[] = dayMeals.map((meal, index) => {
    const type = String(meal.windowType ?? 'MEAL');
    const slotName = type.startsWith('DAILY_BASE:')
      ? type.slice('DAILY_BASE:'.length).replace(/-/g, ' ')
      : null;
    const targets = targetsFromMeal(meal);
    return {
      key: `${dateKey}:meal:${meal.id ?? index}`,
      windowType: baseWindowType(type),
      windowKey: type,
      label: humanizeWindowTypeLabel(type, slotName),
      slotName,
      startTime: isoOrNull(meal.scheduledAt),
      scheduledLabel: scheduledLabelFrom(meal.scheduledAt),
      targetCarbs: Math.round(targets.carbs),
      targetProtein: Math.round(targets.protein),
      targetKcal: Math.round(targets.kcal),
      meal: mealViewFromApi(meal, dateKey),
    };
  });

  const base = summaryWindows.length > 0 ? summaryWindows : fallbackWindows;

  const unmatched = dayMeals.filter(
    (meal) =>
      !base.some((window) =>
        matchesMealToWindow(meal, {
          type: window.windowType.startsWith('DAILY_BASE') ? 'DAILY_BASE' : window.windowType,
          // Without the key a keyed meal matches nothing here and gets appended a second time.
          windowKey: window.windowKey,
          slotName: window.slotName,
          label: window.label,
        }),
      ),
  );

  const appended: NutritionPlanWindowView[] = unmatched.map((meal, index) => {
    const type = String(meal.windowType ?? 'MEAL');
    const slotName = type.startsWith('DAILY_BASE:')
      ? type.slice('DAILY_BASE:'.length).replace(/-/g, ' ')
      : null;
    const targets = targetsFromMeal(meal);
    return {
      key: `${dateKey}:extra:${meal.id ?? index}`,
      windowType: baseWindowType(type),
      windowKey: type,
      label: humanizeWindowTypeLabel(type, slotName),
      slotName,
      startTime: isoOrNull(meal.scheduledAt),
      scheduledLabel: scheduledLabelFrom(meal.scheduledAt),
      targetCarbs: Math.round(targets.carbs),
      targetProtein: Math.round(targets.protein),
      targetKcal: Math.round(targets.kcal),
      meal: mealViewFromApi(meal, dateKey),
    };
  });

  return [...base, ...appended].sort(compareWindows);
}

function toDayView(
  dateKey: string,
  dayMeals: NutritionPlanMealApi[],
  plan: NutritionPlanApi | null | undefined,
): NutritionPlanDayView {
  const windows = windowsForDay(dateKey, dayMeals, plan);
  const meals = windows.map((w) => w.meal).filter((m): m is NutritionPlanMealView => Boolean(m));

  const daySummary = summaryDays(plan).find(
    (d) =>
      d &&
      typeof d === 'object' &&
      String((d as { date?: unknown }).date ?? '').slice(0, 10) === dateKey,
  ) as
    | { fuelingPlan?: { windows?: unknown; workouts?: unknown }; targets?: { carbs?: number } }
    | undefined;

  const targetCarbsTotal =
    typeof daySummary?.targets?.carbs === 'number' && daySummary.targets.carbs > 0
      ? Math.round(daySummary.targets.carbs)
      : windows.reduce((sum, w) => sum + (w.targetCarbs || 0), 0);

  const plannedCarbsTotal = windows
    .filter((w) => w.meal && w.meal.status !== 'SKIPPED')
    .reduce((sum, w) => sum + (w.targetCarbs || 0), 0);

  const rawWorkouts = daySummary?.fuelingPlan?.workouts;
  const workoutTitles = Array.isArray(rawWorkouts)
    ? rawWorkouts
        .map((w) =>
          w && typeof w === 'object' ? String((w as { title?: unknown }).title || '') : '',
        )
        .filter(Boolean)
    : [];

  return {
    dateKey,
    weekdayLabel: weekdayLabelForKey(dateKey),
    windows,
    meals,
    plannedCount: meals.filter((x) => x.status === 'PLANNED').length,
    doneCount: meals.filter((x) => x.status === 'DONE').length,
    skippedCount: meals.filter((x) => x.status === 'SKIPPED').length,
    targetCarbsTotal,
    plannedCarbsTotal,
    workoutTitles,
  };
}

/**
 * Group fueling windows (and their locked meals) by day. When `range` is provided,
 * emit every day in the week so empty fueling stays visible.
 */
export function mapNutritionPlanDays(
  plan: NutritionPlanApi | null | undefined,
  range?: { start: string; end: string },
): NutritionPlanDayView[] {
  const apiMeals = plan?.meals ?? [];
  const byDay = new Map<string, NutritionPlanMealApi[]>();
  for (const meal of apiMeals) {
    const dateKey = localDateKey(meal.date ?? meal.scheduledAt);
    if (!dateKey) continue;
    const list = byDay.get(dateKey) ?? [];
    list.push(meal);
    byDay.set(dateKey, list);
  }

  if (range?.start && range?.end) {
    return dateKeysInRange(range.start, range.end).map((dateKey) =>
      toDayView(dateKey, byDay.get(dateKey) ?? [], plan),
    );
  }

  // Without an explicit range, only surface days that already have a locked meal
  // (week list empty-state parity). Empty windows need a date range to appear.
  return [...byDay.keys()]
    .sort()
    .map((dateKey) => toDayView(dateKey, byDay.get(dateKey) ?? [], plan))
    .filter((day) => day.meals.length > 0);
}

export function weekHasSelectedMeals(days: NutritionPlanDayView[]): boolean {
  return days.some((day) => day.meals.length > 0);
}

export function mapGroceryItems(json: unknown): GroceryItemView[] {
  if (!json || typeof json !== 'object') return [];
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((row): GroceryItemView | null => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const ingredient = typeof r.ingredient === 'string' ? r.ingredient : null;
      if (!ingredient) return null;
      const sources = Array.isArray(r.sourceMeals)
        ? r.sourceMeals
            .map((s) => {
              if (!s || typeof s !== 'object') return null;
              const o = s as { date?: string; title?: string };
              return [o.date?.slice?.(0, 10), o.title].filter(Boolean).join(' · ') || null;
            })
            .filter((x): x is string => Boolean(x))
        : [];
      return {
        ingredient,
        quantity: typeof r.quantity === 'number' ? r.quantity : null,
        unit: typeof r.unit === 'string' ? r.unit : null,
        category: typeof r.category === 'string' ? r.category : null,
        sourceLabels: sources,
      };
    })
    .filter((x): x is GroceryItemView => Boolean(x));
}
