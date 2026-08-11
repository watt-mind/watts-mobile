/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SectionHeader } from '@/src/components/SectionHeader';

import { AppSymbol } from '@/src/components/AppSymbol';
import { Skeleton } from '@/src/components/Skeleton';
import { isNutritionTrackingEnabled } from '@/src/features/profile/mapProfile';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { hapticLight } from '@/src/lib/haptics';
import { NutritionAccents } from '@/src/theme/nutritionAccents';
import { useThemeColors } from '@/src/theme/useThemeColors';

import { NutritionMacroExplainSheet } from './NutritionMacroExplainSheet';
import {
  canExplainMetric,
  formatMacroGrams,
  formatWindowTime,
  fuelStateLabel,
  goalProgressPct,
  localDateYmd,
} from './mapNutrition';
import { hydrationPresetVolumes } from './mapNutritionSettings';
import { DEFAULT_QUICK_ADD_VOLUMES } from './nutritionSettingsTypes';
import { type MacroExplainLabel } from './types';
import {
  useNextFuelingWindowQuery,
  useQuickAddHydration,
  useTodayNutritionQuery,
} from './useNutrition';
import { useNutritionSettingsQuery } from './useNutritionSettings';

function openNutritionLog() {
  router.push('/(app)/(tabs)/log?section=nutrition' as Href);
}

function openMealLogSheet() {
  router.push('/(app)/(tabs)/log?section=nutrition&action=meal' as Href);
}

function GoalBar({ pct, color }: { pct: number | null; color: string }) {
  if (pct == null) return null;
  return (
    <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
      <View
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
        className="h-full rounded-full"
      />
    </View>
  );
}

function MacroColumn({
  label,
  value,
  goal,
  color,
  onPress,
}: {
  label: MacroExplainLabel;
  value: number;
  goal: number | null;
  color: string;
  onPress?: () => void;
}) {
  const pct = goalProgressPct(value, goal);
  const Container = onPress ? Pressable : View;

  return (
    <Container
      {...(onPress
        ? {
            accessibilityRole: 'button',
            accessibilityLabel: `${label} breakdown analysis`,
            onPress: () => {
              hapticLight();
              onPress();
            },
          }
        : {})}
      className={`flex-1 ${onPress ? 'active:opacity-70' : ''}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold text-text-muted">{label}</Text>
        {pct != null ? <Text className="text-xs font-medium text-text-muted">{pct}%</Text> : null}
      </View>
      <Text className="mt-1 text-sm font-bold text-text-primary">
        {formatMacroGrams(value)}
        <Text className="text-xs font-normal text-text-muted">
          {goal != null ? ` / ${formatMacroGrams(goal)} g` : ' g'}
        </Text>
      </Text>
      <GoalBar pct={pct} color={color} />
    </Container>
  );
}

/** Today fueling glance when nutrition tracking is enabled. Writes stay on Log. */
export function NutritionGlance() {
  const theme = useThemeColors();
  const profileQuery = useAthleteProfileQuery();
  const trackingEnabled = isNutritionTrackingEnabled(profileQuery.data);
  const {
    data: today,
    isLoading,
    isError,
  } = useTodayNutritionQuery({
    enabled: trackingEnabled,
  });
  const { data: nextWindow } = useNextFuelingWindowQuery({ enabled: trackingEnabled });
  const hydrationAdd = useQuickAddHydration();
  const { data: nutritionSettings } = useNutritionSettingsQuery({ enabled: trackingEnabled });

  // Same source of truth as HydrationQuickAddSheet, so both surfaces agree (CW-342).
  // While settings load or the request fails, this falls back to 250/500/750 rather
  // than rendering an empty row.
  const hydrationVolumes = useMemo(
    () => hydrationPresetVolumes(nutritionSettings?.quickAddVolumes, DEFAULT_QUICK_ADD_VOLUMES),
    [nutritionSettings?.quickAddVolumes],
  );

  const [explainLabel, setExplainLabel] = useState<MacroExplainLabel | null>(null);

  if (!trackingEnabled) return null;
  if (isError) return null;

  const hasGoals = today?.hasGoals ?? false;

  const openExplain = (label: MacroExplainLabel) => {
    if (!today || !canExplainMetric(today, label)) return;
    setExplainLabel(label);
  };

  return (
    <View className="mt-8">
      <View className="flex-row items-baseline justify-between">
        <SectionHeader title="Nutrition" />
        <Pressable hitSlop={8} className="py-1 active:opacity-70" onPress={openMealLogSheet}>
          <Text className="text-sm font-semibold text-brand">Log meal</Text>
        </Pressable>
      </View>

      {isLoading && !today ? (
        <View className="mt-3 rounded-2xl border border-border bg-card/60 p-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          <View className="mt-4 flex-row gap-3">
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-12 flex-1" />
          </View>
        </View>
      ) : (
        <View className="mt-3 rounded-2xl border border-border bg-card/60 p-4">
          {!today || (today.isEmpty && !hasGoals) ? (
            <Pressable className="active:opacity-70" onPress={openNutritionLog}>
              <Text className="text-sm text-text-muted">No meals logged yet today.</Text>
            </Pressable>
          ) : (
            <>
              {/* Calories Header (Tappable for breakdown) */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Calories breakdown analysis"
                disabled={!canExplainMetric(today, 'Calories')}
                className="flex-row items-center justify-between gap-2 active:opacity-70"
                onPress={() => openExplain('Calories')}
              >
                <Text className="text-2xl font-semibold text-text-primary">
                  {today.calories}
                  <Text className="text-base font-normal text-text-muted">
                    {today.caloriesGoal != null ? ` / ${today.caloriesGoal} kcal` : ' kcal'}
                  </Text>
                </Text>

                <View className="flex-row items-center gap-2.5">
                  {today.caloriesGoal != null ? (
                    <Text className="text-xs font-medium text-text-muted">
                      {Math.max(0, today.caloriesGoal - today.calories)} left
                    </Text>
                  ) : null}

                  {today.fuelState != null ? (
                    <View className="rounded-full bg-tint-success px-2.5 py-0.5">
                      <Text className="text-xs font-semibold text-success">
                        {fuelStateLabel(today.fuelState)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>

              {/* Main Calorie Progress Bar */}
              <GoalBar
                pct={goalProgressPct(today.calories, today.caloriesGoal)}
                color={theme.brandOnSurface}
              />

              {/* Macros Breakdown Row (Tappable for Carbs, Protein, Fat) */}
              <View className="mt-4 flex-row gap-3">
                <MacroColumn
                  label="Carbs"
                  value={today.carbs}
                  goal={today.carbsGoal}
                  color={NutritionAccents.carbs}
                  onPress={
                    canExplainMetric(today, 'Carbs') ? () => openExplain('Carbs') : undefined
                  }
                />
                <MacroColumn
                  label="Protein"
                  value={today.protein}
                  goal={today.proteinGoal}
                  color={NutritionAccents.protein}
                  onPress={
                    canExplainMetric(today, 'Protein') ? () => openExplain('Protein') : undefined
                  }
                />
                <MacroColumn
                  label="Fat"
                  value={today.fat}
                  goal={today.fatGoal}
                  color={NutritionAccents.fat}
                  onPress={canExplainMetric(today, 'Fat') ? () => openExplain('Fat') : undefined}
                />
              </View>

              {/* Hydration Row */}
              <View className="mt-3.5 flex-row items-center gap-2">
                <AppSymbol
                  sf="drop.fill"
                  size={13}
                  tintColor={NutritionAccents.hydration}
                  fallback="ml"
                />
                <Text className="text-sm font-semibold text-text-primary">
                  {today.waterMl}
                  <Text className="text-sm font-normal text-text-muted">
                    {today.fluidGoalMl != null ? ` / ${today.fluidGoalMl} ml` : ' ml'}
                  </Text>
                </Text>
                <View className="flex-1">
                  <GoalBar
                    pct={goalProgressPct(today.waterMl, today.fluidGoalMl)}
                    color={NutritionAccents.hydration}
                  />
                </View>
              </View>

              {/* Hydration quick-add — athlete's configured preset volumes (CW-304, CW-342) */}
              <View className="mt-2.5 flex-row items-center gap-2">
                {hydrationVolumes.map((ml, index) => (
                  <Pressable
                    key={`${ml}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${ml} milliliters of fluid`}
                    disabled={hydrationAdd.isPending}
                    className={`rounded-full border border-border bg-surface px-3 py-1.5 active:opacity-70 ${
                      hydrationAdd.isPending ? 'opacity-50' : ''
                    }`}
                    onPress={() => {
                      hapticLight();
                      hydrationAdd.mutate({ date: localDateYmd(), volumeMl: ml });
                    }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: NutritionAccents.hydration }}
                    >
                      +{ml} ml
                    </Text>
                  </Pressable>
                ))}
                {hydrationAdd.isError ? (
                  <Text className="flex-1 text-xs text-danger" numberOfLines={1}>
                    Couldn’t log fluid
                  </Text>
                ) : null}
              </View>
            </>
          )}

          {/* Next Window Section */}
          {nextWindow ? (
            <Pressable
              className="mt-3.5 flex-row items-center border-t border-border pt-3 active:opacity-70"
              onPress={openNutritionLog}
            >
              <AppSymbol sf="clock.fill" size={14} tintColor={theme.textMuted} fallback="⏱" />
              <View className="ml-2 flex-1">
                <Text className="text-xs text-text-muted">
                  Next window · {nextWindow.label} {formatWindowTime(nextWindow.startTime)}
                </Text>
                <Text className="mt-0.5 text-sm font-semibold text-text-primary">
                  {nextWindow.targetCarbs} g carbs · {nextWindow.targetProtein} g protein
                </Text>
              </View>
              <AppSymbol sf="chevron.right" size={12} tintColor={theme.textMuted} fallback="›" />
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Macro Analysis Breakdown Sheet */}
      <NutritionMacroExplainSheet
        visible={explainLabel != null}
        label={explainLabel}
        day={today ?? null}
        weightKg={profileQuery.data?.weightKg ?? null}
        onClose={() => setExplainLabel(null)}
      />
    </View>
  );
}
