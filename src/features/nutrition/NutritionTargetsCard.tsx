/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useMemo, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';

import { AppSymbol } from '@/src/components/AppSymbol';
import { Spinner } from '@/src/components/Spinner';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { hapticLight } from '@/src/lib/haptics';
import { NutritionAccents } from '@/src/theme/nutritionAccents';
import { useThemeColors } from '@/src/theme/useThemeColors';

import { NutritionMacroExplainSheet } from './NutritionMacroExplainSheet';
import {
  canExplainMetric,
  formatMacroGrams,
  fuelStateLabel,
  goalProgressPct,
  localDateYmd,
} from './mapNutrition';
import type { MacroExplainLabel, NutritionDayTotals } from './types';

function getYesterdayYmd(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return localDateYmd(yesterday);
}

function formatDateLabel(dateYmd?: string): string {
  if (!dateYmd) return '';
  const today = localDateYmd();
  if (dateYmd === today) return 'Today';
  if (dateYmd === getYesterdayYmd()) return 'Yesterday';
  return dateYmd;
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
        {pct != null ? (
          <Text className="text-[10px] font-semibold text-text-muted">{pct}%</Text>
        ) : null}
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

export interface NutritionTargetsCardProps {
  day: NutritionDayTotals | null | undefined;
  isLoading?: boolean;
  onPress?: () => void;
  className?: string;
  showHydration?: boolean;
  selectedDate?: string;
  onPrevDate?: () => void;
  onNextDate?: () => void;
  canGoNext?: boolean;
  showDateHeader?: boolean;
}

/**
 * Reusable daily target progress summary card displaying calories, macros, and hydration.
 * Supports touch interactions on calories and macro tiles to open the calculation breakdown sheet.
 */
export function NutritionTargetsCard({
  day,
  isLoading = false,
  onPress,
  className = '',
  showHydration = true,
  selectedDate,
  onPrevDate,
  onNextDate,
  canGoNext = false,
  showDateHeader = false,
}: NutritionTargetsCardProps) {
  const theme = useThemeColors();
  const profileQuery = useAthleteProfileQuery();
  const [explainLabel, setExplainLabel] = useState<MacroExplainLabel | null>(null);

  const openExplain = (label: MacroExplainLabel) => {
    if (!day || !canExplainMetric(day, label)) return;
    setExplainLabel(label);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > 35) {
            hapticLight();
            onPrevDate?.();
          } else if (gestureState.dx < -35 && canGoNext) {
            hapticLight();
            onNextDate?.();
          }
        },
      }),
    [canGoNext, onNextDate, onPrevDate],
  );

  const isSwipeable = Boolean(onPrevDate || onNextDate);
  const dateLabel = formatDateLabel(selectedDate);

  if (isLoading && !day) {
    return (
      <View
        className={`items-center justify-center rounded-xl border border-border bg-card p-4 ${className}`}
      >
        <Spinner />
      </View>
    );
  }

  if (!day && !showDateHeader) return null;

  const cardContent = (
    <View
      {...(isSwipeable ? panResponder.panHandlers : {})}
      className={`rounded-xl border border-border bg-card p-4 ${className}`}
    >
      {/* Date Header with Swipe/Paging Controls */}
      {showDateHeader && selectedDate ? (
        <View className="mb-3 flex-row items-center justify-between border-b border-border/60 pb-2.5">
          <Pressable
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Previous date"
            className="flex-row items-center gap-1 p-1 active:opacity-70"
            onPress={() => {
              hapticLight();
              onPrevDate?.();
            }}
          >
            <AppSymbol sf="chevron.left" size={13} tintColor={theme.brandOnSurface} fallback="‹" />
            <Text className="text-xs font-semibold text-brand">Prev</Text>
          </Pressable>

          <View className="flex-row items-center gap-1.5">
            <AppSymbol sf="calendar" size={13} tintColor={theme.brandOnSurface} fallback="📅" />
            <Text className="text-sm font-bold text-text-primary">{dateLabel}</Text>
          </View>

          <Pressable
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Next date"
            disabled={!canGoNext}
            className={`flex-row items-center gap-1 p-1 ${canGoNext ? 'active:opacity-70' : 'opacity-20'}`}
            onPress={() => {
              if (!canGoNext) return;
              hapticLight();
              onNextDate?.();
            }}
          >
            <Text
              className={`text-xs font-semibold ${canGoNext ? 'text-brand' : 'text-text-muted'}`}
            >
              Next
            </Text>
            <AppSymbol
              sf="chevron.right"
              size={13}
              tintColor={canGoNext ? theme.brandOnSurface : theme.textMuted}
              fallback="›"
            />
          </Pressable>
        </View>
      ) : null}

      {!day ? (
        <View className="items-center py-4">
          <Text className="text-xs text-text-muted">No nutrition data for this date.</Text>
        </View>
      ) : (
        <>
          {/* Calories & Goal Header (Tappable for Calories Analysis) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Calories breakdown analysis"
            disabled={!canExplainMetric(day, 'Calories')}
            className="flex-row items-center justify-between gap-2 active:opacity-70"
            onPress={() => {
              hapticLight();
              openExplain('Calories');
            }}
          >
            <Text className="text-2xl font-extrabold text-text-primary">
              {day.calories}
              <Text className="text-base font-normal text-text-muted">
                {day.caloriesGoal != null ? ` / ${day.caloriesGoal} kcal` : ' kcal'}
              </Text>
            </Text>

            <View className="flex-row items-center gap-2">
              {day.caloriesGoal != null ? (
                <Text className="text-xs font-semibold text-text-muted">
                  {Math.max(0, day.caloriesGoal - day.calories)} left
                </Text>
              ) : null}

              {day.fuelState != null ? (
                <View className="rounded-full bg-tint-success px-2.5 py-1">
                  <Text className="text-xs font-semibold text-success">
                    {fuelStateLabel(day.fuelState)}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          {/* Main Calorie Bar */}
          <GoalBar
            pct={goalProgressPct(day.calories, day.caloriesGoal)}
            color={theme.brandOnSurface}
          />

          {/* Macros Row (Tappable for Carbs, Protein, Fat Analysis) */}
          <View className="mt-4 flex-row gap-3">
            <MacroColumn
              label="Carbs"
              value={day.carbs}
              goal={day.carbsGoal}
              color={NutritionAccents.carbs}
              onPress={canExplainMetric(day, 'Carbs') ? () => openExplain('Carbs') : undefined}
            />
            <MacroColumn
              label="Protein"
              value={day.protein}
              goal={day.proteinGoal}
              color={NutritionAccents.protein}
              onPress={canExplainMetric(day, 'Protein') ? () => openExplain('Protein') : undefined}
            />
            <MacroColumn
              label="Fat"
              value={day.fat}
              goal={day.fatGoal}
              color={NutritionAccents.fat}
              onPress={canExplainMetric(day, 'Fat') ? () => openExplain('Fat') : undefined}
            />
          </View>

          {/* Hydration Row */}
          {showHydration && (day.waterMl > 0 || day.fluidGoalMl != null) ? (
            <View className="mt-3.5 flex-row items-center gap-2.5">
              <AppSymbol
                sf="drop.fill"
                size={13}
                tintColor={NutritionAccents.hydration}
                fallback="ml"
              />
              <Text className="text-xs font-bold text-text-primary">
                {day.waterMl}
                <Text className="text-xs font-normal text-text-muted">
                  {day.fluidGoalMl != null ? ` / ${day.fluidGoalMl} ml` : ' ml'}
                </Text>
              </Text>
              <View className="flex-1">
                <GoalBar
                  pct={goalProgressPct(day.waterMl, day.fluidGoalMl)}
                  color={NutritionAccents.hydration}
                />
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <>
      {onPress ? (
        <Pressable className="active:opacity-80" onPress={onPress}>
          {cardContent}
        </Pressable>
      ) : (
        cardContent
      )}

      {/* Macro Analysis Breakdown Sheet */}
      <NutritionMacroExplainSheet
        visible={explainLabel != null}
        label={explainLabel}
        day={day ?? null}
        weightKg={profileQuery.data?.weightKg ?? null}
        onClose={() => setExplainLabel(null)}
      />
    </>
  );
}
