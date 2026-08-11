/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app
 * pre-emit critique: P4 H4 E4 S4 R5 V4 — empty week = one CTA, not seven hollow cards
 */
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { BottomSheet } from '@/src/components/BottomSheet';
import { Button } from '@/src/components/Button';
import { Skeleton } from '@/src/components/Skeleton';
import { PlanNutritionStrategySegment } from '@/src/features/nutrition/PlanNutritionStrategySegment';
import {
  useGenerateNutritionPlanDraft,
  useNutritionPlanQuery,
  usePatchNutritionPlanMeal,
  useRegenerateDayFuelingPlan,
} from '@/src/features/nutrition/useNutrition';
import { isNutritionTrackingEnabled } from '@/src/features/profile/mapProfile';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { APP_HREFS } from '@/src/linking/appHrefs';

import { formatWeekRangeLabel, humanizeMealStatus } from './formatPlanCopy';
import { MealRecommendationPickerSheet } from './MealRecommendationPickerSheet';
import { weekRangeFromOffset } from '@/src/lib/date';
import { mapNutritionPlanDays, weekHasSelectedMeals } from './mapNutritionPlan';
import type { NutritionPlanApi, NutritionPlanMealView, NutritionPlanWindowView } from './types';

type NutritionSubmode = 'strategy' | 'plan';

function NutritionSubmodeSegment({
  mode,
  onChange,
}: {
  mode: NutritionSubmode;
  onChange: (mode: NutritionSubmode) => void;
}) {
  return (
    <View testID="plan-nutrition-submode" className="mb-1 flex-row items-center gap-4">
      {(['strategy', 'plan'] as const).map((value) => {
        const selected = mode === value;
        const label = value === 'strategy' ? 'Strategy' : 'Plan';
        return (
          <AnimatedPressable
            key={value}
            testID={`plan-nutrition-submode-${value}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            hitSlop={8}
            onPress={() => {
              if (value === mode) return;
              hapticLight();
              onChange(value);
            }}
            className="py-1"
          >
            <Text
              className={`text-sm font-semibold ${
                selected ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {label}
            </Text>
            <View
              className={`mt-1 h-0.5 w-full rounded-full ${selected ? 'bg-brand' : 'bg-transparent'}`}
            />
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

export function PlanNutritionSegment() {
  const profile = useAthleteProfileQuery();
  const trackingOn = isNutritionTrackingEnabled(profile.data);
  const [submode, setSubmode] = useState<NutritionSubmode>('strategy');
  const [weekOffset, setWeekOffset] = useState(0);
  const range = useMemo(() => weekRangeFromOffset(weekOffset), [weekOffset]);
  const planQuery = useNutritionPlanQuery(range.start, range.end, {
    enabled: trackingOn && submode === 'plan',
  });
  const generate = useGenerateNutritionPlanDraft();
  const regenDay = useRegenerateDayFuelingPlan();
  const patchMeal = usePatchNutritionPlanMeal();
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [pickerWindow, setPickerWindow] = useState<NutritionPlanWindowView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = planQuery.data as NutritionPlanApi | null | undefined;
  const days = useMemo(() => mapNutritionPlanDays(plan ?? null, range), [plan, range]);
  const hasMeals = weekHasSelectedMeals(days);
  const selectedDay = useMemo(
    () => (selectedDateKey ? (days.find((d) => d.dateKey === selectedDateKey) ?? null) : null),
    [days, selectedDateKey],
  );
  const weekLabel = formatWeekRangeLabel(range.start, range.end) ?? `${range.start} – ${range.end}`;
  // Browsed off the current week with Previous/Next — offer a way back, mirroring
  // PlanTrainingSegment's `browsingAway` + `jumpToCurrentWeek` pattern (CW-285).
  const browsingAway = weekOffset !== 0;

  if (profile.isLoading) {
    return <PlanNutritionSkeleton />;
  }

  if (!trackingOn) {
    return (
      <View testID="plan-nutrition-tracking-off" className="gap-4 px-6 pt-6">
        <Text className="text-2xl font-semibold text-text-primary">Nutrition tracking is off</Text>
        <Text className="text-sm text-text-muted">
          Turn on tracking in Settings → Nutrition to see strategy and plan meals here.
        </Text>
        <Button
          label="Open Nutrition settings"
          onPress={() => router.push(APP_HREFS.settingsNutrition as Href)}
        />
      </View>
    );
  }

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
      hapticSuccess();
    } catch (err) {
      hapticError();
      setError(friendlyError(err, 'Something went wrong'));
    } finally {
      setBusy(null);
    }
  };

  const jumpToCurrentWeek = () => {
    if (!browsingAway) return;
    hapticLight();
    setWeekOffset(0);
  };

  const openGrocery = () => {
    hapticLight();
    router.push(`${APP_HREFS.planGrocery}?start=${range.start}&end=${range.end}` as Href);
  };

  const generateDraft = () =>
    void run('Generating meal plan', () =>
      generate.mutateAsync({ startDate: range.start, endDate: range.end }),
    );

  return (
    <View testID="plan-nutrition" className="gap-4 px-6 pb-10 pt-4">
      <NutritionSubmodeSegment mode={submode} onChange={setSubmode} />

      {submode === 'strategy' ? (
        <PlanNutritionStrategySegment enabled={trackingOn && submode === 'strategy'} />
      ) : null}

      {submode === 'plan' ? (
        <>
          {busy ? (
            <Text className="text-sm text-brand" testID="plan-nutrition-busy">
              {busy}…
            </Text>
          ) : null}
          {error ? (
            <View className="rounded-xl border border-danger/40 bg-tint-error p-3">
              <Text className="text-sm text-danger">{error}</Text>
            </View>
          ) : null}

          <View className="flex-row items-center justify-between">
            <AnimatedPressable
              hitSlop={8}
              disabled={Boolean(busy)}
              onPress={() => {
                hapticLight();
                setWeekOffset((o) => o - 1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Previous week"
            >
              <Text className="text-sm font-semibold text-brand">Previous</Text>
            </AnimatedPressable>
            <View className="items-center px-2">
              <Text className="text-sm font-semibold text-text-primary">{weekLabel}</Text>
              {browsingAway ? (
                <AnimatedPressable
                  hitSlop={8}
                  disabled={Boolean(busy)}
                  onPress={jumpToCurrentWeek}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to this week"
                  className="mt-1"
                  testID="plan-nutrition-this-week"
                >
                  <Text className="text-xs font-semibold text-brand">This week</Text>
                </AnimatedPressable>
              ) : null}
            </View>
            <AnimatedPressable
              hitSlop={8}
              disabled={Boolean(busy)}
              onPress={() => {
                hapticLight();
                setWeekOffset((o) => o + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Next week"
            >
              <Text className="text-sm font-semibold text-brand">Next</Text>
            </AnimatedPressable>
          </View>

          {planQuery.isLoading && !hasMeals && !plan ? (
            <PlanNutritionSkeleton compact />
          ) : (
            <>
              {!hasMeals ? (
                <View className="gap-3" testID="plan-nutrition-empty">
                  <Text className="text-sm text-text-muted">
                    No meals selected this week yet. Generate a draft to fill fueling windows from
                    your catalog.
                  </Text>
                  <Button
                    label="Generate draft"
                    onPress={generateDraft}
                    loading={Boolean(busy)}
                    disabled={Boolean(busy)}
                    testID="plan-nutrition-generate"
                  />
                  <AnimatedPressable
                    hitSlop={8}
                    disabled={Boolean(busy)}
                    onPress={openGrocery}
                    accessibilityRole="button"
                    accessibilityLabel="Grocery list"
                    className="self-start py-1"
                  >
                    <Text className="text-sm font-semibold text-brand">Grocery list</Text>
                  </AnimatedPressable>
                </View>
              ) : (
                <View className="flex-row items-center justify-between gap-3">
                  <Button
                    className="flex-1"
                    label="Regenerate draft"
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onPress={generateDraft}
                  />
                  <AnimatedPressable
                    hitSlop={8}
                    disabled={Boolean(busy)}
                    onPress={openGrocery}
                    accessibilityRole="button"
                    accessibilityLabel="Grocery list"
                    className="py-1"
                  >
                    <Text className="text-sm font-semibold text-brand">Grocery</Text>
                  </AnimatedPressable>
                </View>
              )}

              {days.length > 0 ? (
                <View className="mt-2">
                  {days.map((day) => (
                    <AnimatedPressable
                      key={day.dateKey}
                      onPress={() => {
                        hapticLight();
                        setSelectedDateKey(day.dateKey);
                      }}
                      hitSlop={8}
                      className="border-b border-border/80 py-3.5"
                      accessibilityRole="button"
                      accessibilityLabel={day.weekdayLabel}
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1">
                          <Text className="text-base font-semibold text-text-primary">
                            {day.weekdayLabel}
                          </Text>
                          {day.workoutTitles && day.workoutTitles.length > 0 ? (
                            <Text className="mt-0.5 text-xs text-text-muted">
                              {day.workoutTitles.join(' · ')}
                            </Text>
                          ) : (
                            <Text className="mt-0.5 text-xs text-text-muted">Rest day</Text>
                          )}
                        </View>

                        {day.targetCarbsTotal ? (
                          <View className="items-end">
                            <Text className="text-sm font-semibold text-text-primary">
                              {day.targetCarbsTotal}g carbs
                            </Text>
                            <Text className="text-xs text-text-muted">
                              {day.plannedCarbsTotal
                                ? `${day.plannedCarbsTotal}g planned`
                                : '0g planned'}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View className="mt-2 flex-row items-center justify-between gap-2">
                        <WindowCirclesIndicator windows={day.windows} />
                        <Text className="text-xs text-text-muted">
                          {day.meals.length === 0
                            ? day.windows.length > 0
                              ? `${day.windows.length} windows · no meals locked`
                              : 'No meals selected'
                            : `${day.meals.length} / ${day.windows.length} meals locked`}
                        </Text>
                      </View>
                    </AnimatedPressable>
                  ))}
                </View>
              ) : null}
            </>
          )}

          <BottomSheet
            visible={Boolean(selectedDateKey) && pickerWindow == null}
            onClose={() => setSelectedDateKey(null)}
            testID="plan-nutrition-day-sheet"
          >
            <Text className="mb-3 text-lg font-semibold text-text-primary">
              {selectedDay?.weekdayLabel}
            </Text>
            <Button
              label="Regenerate day fueling"
              variant="secondary"
              disabled={Boolean(busy)}
              onPress={() => {
                if (!selectedDateKey) return;
                void run('Regenerating day', () => regenDay.mutateAsync(selectedDateKey));
              }}
            />
            <View className="mt-3 gap-2">
              {(selectedDay?.windows ?? []).length === 0 ? (
                <Text className="text-sm text-text-muted">No fueling windows for this day.</Text>
              ) : (
                (selectedDay?.windows ?? []).map((window) => (
                  <WindowRow
                    key={window.key}
                    window={window}
                    busy={Boolean(busy)}
                    onPick={() => {
                      hapticLight();
                      setPickerWindow(window);
                    }}
                    onAction={(action) => {
                      if (!window.meal) return;
                      void run('Updating meal', () =>
                        patchMeal.mutateAsync({ mealId: window.meal!.id, action }),
                      );
                    }}
                  />
                ))
              )}
            </View>
            <View className="mt-4">
              <Button label="Close" variant="secondary" onPress={() => setSelectedDateKey(null)} />
            </View>
          </BottomSheet>

          <MealRecommendationPickerSheet
            visible={pickerWindow != null}
            dateKey={selectedDateKey ?? ''}
            window={pickerWindow}
            onClose={() => setPickerWindow(null)}
          />
        </>
      ) : null}
    </View>
  );
}

function WindowCirclesIndicator({ windows }: { windows: NutritionPlanWindowView[] }) {
  if (!windows.length) return null;

  return (
    <View className="flex-row items-center gap-1.5 py-0.5">
      {windows.map((w, index) => {
        const isLocked = Boolean(w.meal);
        const status = w.meal?.status?.toUpperCase() ?? 'UNLOCKED';
        const isDone = status === 'DONE';
        const isSkipped = status === 'SKIPPED';
        const isPrePost = w.windowType.includes('PRE') || w.windowType.includes('POST');

        if (isDone) {
          return <View key={`${w.key}-${index}`} className="h-2.5 w-2.5 rounded-full bg-success" />;
        }

        if (isSkipped) {
          return (
            <View
              key={`${w.key}-${index}`}
              className="h-2.5 w-2.5 rounded-full border border-text-muted/40 bg-surface"
            />
          );
        }

        if (isLocked) {
          return <View key={`${w.key}-${index}`} className="h-2.5 w-2.5 rounded-full bg-brand" />;
        }

        return (
          <View
            key={`${w.key}-${index}`}
            className={`h-2.5 w-2.5 rounded-full border ${
              isPrePost
                ? 'border-amber-400/80 bg-amber-400/10'
                : 'border-text-muted/60 bg-transparent'
            }`}
          />
        );
      })}
    </View>
  );
}

function PlanNutritionSkeleton({ compact = false }: { compact?: boolean } = {}) {
  return (
    <View className={compact ? 'gap-2' : 'gap-3 px-6 pt-6'} testID="plan-nutrition-skeleton">
      {!compact ? (
        <>
          <Skeleton className="h-4 w-1/2 self-center" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </>
      ) : null}
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
    </View>
  );
}

function WindowRow({
  window,
  busy,
  onPick,
  onAction,
}: {
  window: NutritionPlanWindowView;
  busy: boolean;
  onPick: () => void;
  onAction: (action: 'complete' | 'skip' | 'unlock') => void;
}) {
  const targets = [
    window.targetCarbs > 0 ? `${window.targetCarbs}g C` : null,
    window.targetProtein > 0 ? `${window.targetProtein}g P` : null,
    window.targetKcal > 0 ? `${window.targetKcal} kcal` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const meta = [window.scheduledLabel, targets].filter(Boolean).join(' · ');

  if (!window.meal) {
    return (
      <View
        className="rounded-xl border border-dashed border-border bg-card px-3 py-3"
        testID={`plan-nutrition-window-empty-${window.key}`}
      >
        <Text className="text-sm font-medium text-text-primary">{window.label}</Text>
        {meta ? <Text className="mt-0.5 text-xs text-text-muted">{meta}</Text> : null}
        <Text className="mt-1 text-xs text-text-muted">No meal locked</Text>
        <AnimatedPressable
          hitSlop={8}
          disabled={busy}
          onPress={onPick}
          className="mt-2 self-start"
          testID={`plan-nutrition-pick-${window.key}`}
          accessibilityRole="button"
          accessibilityLabel={`Choose meal for ${window.label}`}
        >
          <Text className="text-sm font-semibold text-brand">Choose meal</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View className="border-b border-border/80 py-3" testID={`plan-nutrition-window-${window.key}`}>
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {window.label}
      </Text>
      {meta ? <Text className="mt-0.5 text-xs text-text-muted">{meta}</Text> : null}
      <MealActions meal={window.meal} busy={busy} onAction={onAction} onReplace={onPick} />
    </View>
  );
}

function MealActions({
  meal,
  busy,
  onAction,
  onReplace,
}: {
  meal: NutritionPlanMealView;
  busy: boolean;
  onAction: (action: 'complete' | 'skip' | 'unlock') => void;
  onReplace: () => void;
}) {
  return (
    <View className="mt-1">
      <Text className="text-sm font-medium text-text-primary">{meal.title}</Text>
      <Text className="mt-0.5 text-xs text-text-muted">{humanizeMealStatus(meal.status)}</Text>
      <View className="mt-2 flex-row flex-wrap gap-4">
        <AnimatedPressable hitSlop={8} disabled={busy} onPress={() => onAction('complete')}>
          <Text className="text-sm font-semibold text-brand">Done</Text>
        </AnimatedPressable>
        <AnimatedPressable hitSlop={8} disabled={busy} onPress={() => onAction('skip')}>
          <Text className="text-sm font-semibold text-text-muted">Skip</Text>
        </AnimatedPressable>
        <AnimatedPressable hitSlop={8} disabled={busy} onPress={() => onAction('unlock')}>
          <Text className="text-sm font-semibold text-text-muted">Unlock</Text>
        </AnimatedPressable>
        <AnimatedPressable hitSlop={8} disabled={busy} onPress={onReplace}>
          <Text className="text-sm font-semibold text-brand">Replace</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
