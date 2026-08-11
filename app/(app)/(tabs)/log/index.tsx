/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { router, useLocalSearchParams, usePathname, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { Button } from '@/src/components/Button';
import { Skeleton } from '@/src/components/Skeleton';
import { WellnessCheckinSheet } from '@/src/features/log/WellnessCheckinSheet';
import { isDailyCheckinCompleted } from '@/src/features/log/isDailyCheckinCompleted';
import { resolveLogScreenIntent } from '@/src/features/log/logScreenIntent';
import { formFromWellness, formHasContent } from '@/src/features/log/mapLogForm';
import { useDailyCheckinQuery } from '@/src/features/log/useDailyCheckin';
import { useLogTabPreference } from '@/src/features/log/useLogTabPreference';
import { useTodayWellnessQuery } from '@/src/features/log/useLog';
import { MeasurementSheet } from '@/src/features/measurements/MeasurementSheet';
import { MeasurementsDetailSheet } from '@/src/features/measurements/MeasurementsDetailSheet';
import { useBodyMeasurementsQuery } from '@/src/features/measurements/useMeasurements';
import { HydrationQuickAddSheet } from '@/src/features/nutrition/HydrationQuickAddSheet';
import { LogMealSheet } from '@/src/features/nutrition/LogMealSheet';
import { NutritionDetailSheet } from '@/src/features/nutrition/NutritionDetailSheet';
import { formatMacroGrams, goalProgressPct } from '@/src/features/nutrition/mapNutrition';
import { useTodayNutritionQuery } from '@/src/features/nutrition/useNutrition';
import { isNutritionTrackingEnabled, weightUnit } from '@/src/features/profile/mapProfile';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { filterActiveToday } from '@/src/features/recovery/mapRecovery';
import { useRecoveryContextQuery } from '@/src/features/recovery/useRecovery';
import { useKeyboardOverlap } from '@/src/hooks/useKeyboardOverlap';
import { useTabScrollPadding } from '@/src/hooks/useTabScrollPadding';
import { hapticLight } from '@/src/lib/haptics';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { Colors } from '@/src/theme/colors';
import { useThemeColors } from '@/src/theme/useThemeColors';

export default function LogScreen() {
  const theme = useThemeColors();
  const params = useLocalSearchParams<{ section?: string; action?: string; t?: string }>();
  const pathname = usePathname();
  const { containerRef, overlap } = useKeyboardOverlap();
  const tabBottomPad = useTabScrollPadding(overlap);

  // Queries
  const { data: athleteProfile } = useAthleteProfileQuery();
  const nutritionEnabled = isNutritionTrackingEnabled(athleteProfile);
  const weightUnitLabel = weightUnit(athleteProfile);

  const { data: todayWellness, isLoading: wellnessLoading } = useTodayWellnessQuery();
  const { data: dailyCheckin, isLoading: dailyCheckinLoading } = useDailyCheckinQuery();
  const { data: todayNutrition } = useTodayNutritionQuery();
  const { data: recoveryItems } = useRecoveryContextQuery();
  const { data: measurementsData } = useBodyMeasurementsQuery();
  const checkinCompleted = isDailyCheckinCompleted(dailyCheckin);
  const showCoachCheckinPending = !dailyCheckinLoading && !checkinCompleted;

  // Active recovery items for today
  const activeTodayRecovery = useMemo(
    () => (recoveryItems ? filterActiveToday(recoveryItems) : []),
    [recoveryItems],
  );

  // Modal Sheet States
  const [mealSheetOpen, setMealSheetOpen] = useState(false);
  const [hydrationSheetOpen, setHydrationSheetOpen] = useState(false);
  const [wellnessSheetOpen, setWellnessSheetOpen] = useState(false);
  const [measurementSheetOpen, setMeasurementSheetOpen] = useState(false);
  const launchedPhotoTokenRef = useRef<string | null>(null);
  const untokenedCameraBusyRef = useRef(false);
  // The default-log-view preference opens its sheet once per screen instance,
  // and only when the athlete did not arrive through a deep link.
  const defaultViewAppliedRef = useRef(false);
  const { preference: logTabPreference, ready: logTabPreferenceReady } = useLogTabPreference();

  // Detail Sheet States
  const [nutritionDetailSheetOpen, setNutritionDetailSheetOpen] = useState(false);
  const [measurementsDetailSheetOpen, setMeasurementsDetailSheetOpen] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      // Single param-consumption mechanism: decide, act, then strip the params
      // so a still-mounted Log tab cannot re-open a sheet on the next switch.
      const intent = resolveLogScreenIntent({
        action: params.action,
        section: params.section,
        token: params.t,
        nutritionEnabled,
        onPhotoMealRoute: pathname.includes('photo-meal'),
        handledPhotoToken: launchedPhotoTokenRef.current,
        untokenedCameraBusy: untokenedCameraBusyRef.current,
        preference: logTabPreference,
        preferenceReady: logTabPreferenceReady,
        defaultViewApplied: defaultViewAppliedRef.current,
      });

      if (intent.markDefaultViewApplied) {
        defaultViewAppliedRef.current = true;
      }

      if (intent.handledPhotoToken != null) {
        launchedPhotoTokenRef.current = intent.handledPhotoToken;
      }
      if (intent.claimUntokenedCamera) {
        untokenedCameraBusyRef.current = true;
      }

      if (intent.clearParams.length > 0) {
        const next: Record<string, undefined> = {};
        for (const key of intent.clearParams) next[key] = undefined;
        router.setParams(next);
      }

      switch (intent.open) {
        case 'meal':
          setMealSheetOpen(true);
          break;
        case 'water':
          setHydrationSheetOpen(true);
          break;
        case 'wellness':
          setWellnessSheetOpen(true);
          break;
        case 'measurement':
          setMeasurementSheetOpen(true);
          break;
        case 'nutritionDetail':
          setNutritionDetailSheetOpen(true);
          break;
        case 'measurementsDetail':
          setMeasurementsDetailSheetOpen(true);
          break;
        case 'photoMealRoute':
          router.push('/(app)/(tabs)/log/photo-meal' as Href);
          break;
        default:
          break;
      }

      if (intent.releaseUntokenedCamera) {
        untokenedCameraBusyRef.current = false;
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [
    params.action,
    params.section,
    params.t,
    nutritionEnabled,
    pathname,
    logTabPreference,
    logTabPreferenceReady,
  ]);

  const wellnessInitialValues = useMemo(
    () =>
      todayWellness ? formFromWellness(todayWellness, athleteProfile?.weightUnits) : undefined,
    [todayWellness, athleteProfile?.weightUnits],
  );

  const isWellnessDone = todayWellness != null && formHasContent(formFromWellness(todayWellness));
  const todayDateStr = useMemo(
    () =>
      new Date().toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  // Today's Entries Feed Items
  const todayEntries = useMemo(() => {
    const entries: {
      id: string;
      time: string;
      title: string;
      sub: string;
      type: 'wellness' | 'meal' | 'hydration' | 'recovery' | 'measurement';
      actionLabel: string;
      onAction: () => void;
    }[] = [];

    if (isWellnessDone && todayWellness) {
      entries.push({
        id: 'wellness-today',
        time: 'Today',
        title: 'Daily Wellness Check-in',
        sub: `Mood ${todayWellness.mood ?? '—'} · Sleep ${todayWellness.sleepHours ?? '—'}h`,
        type: 'wellness',
        actionLabel: 'Edit',
        onAction: () => setWellnessSheetOpen(true),
      });
    }

    if (todayNutrition && todayNutrition.waterMl > 0) {
      entries.push({
        id: 'hydration-today',
        time: 'Today',
        title: 'Water Hydration',
        sub: `${todayNutrition.waterMl} ml logged`,
        type: 'hydration',
        actionLabel: 'Add More',
        onAction: () => setHydrationSheetOpen(true),
      });
    }

    if (activeTodayRecovery.length > 0) {
      activeTodayRecovery.forEach((item) => {
        entries.push({
          id: `recovery-${item.id}`,
          time: 'Active',
          title: `Recovery: ${item.label}`,
          sub: `Severity ${item.severity ?? 5}/10`,
          type: 'recovery',
          actionLabel: 'View',
          onAction: () =>
            router.push(
              `/(app)/recovery-event?id=${encodeURIComponent(item.sourceRecordId)}` as Href,
            ),
        });
      });
    }

    if (measurementsData && measurementsData.latestByMetric.length > 0) {
      const topMeasurement = measurementsData.latestByMetric[0];
      entries.push({
        id: `measurement-${topMeasurement.id}`,
        time: 'Latest',
        title: `Measurement: ${topMeasurement.metricKey}`,
        sub: `${topMeasurement.value} ${topMeasurement.unit}`,
        type: 'measurement',
        actionLabel: 'View',
        onAction: () => setMeasurementsDetailSheetOpen(true),
      });
    }

    return entries;
  }, [isWellnessDone, todayWellness, todayNutrition, activeTodayRecovery, measurementsData]);

  return (
    <SafeAreaView
      testID="log-screen"
      edges={{ top: true }}
      style={{ flex: 1, backgroundColor: theme.surface }}
    >
      <View ref={containerRef} className="flex-1 bg-surface">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pt-4"
          contentContainerStyle={{ paddingBottom: tabBottomPad }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Header */}
          <View className="mb-1 flex-row items-baseline justify-between">
            <Text className="text-2xl font-semibold text-text-primary">Today’s Log</Text>
            <Text className="text-sm font-semibold text-text-muted">{todayDateStr}</Text>
          </View>

          {/* Primary status — first-viewport decision */}
          {wellnessLoading && !todayWellness ? (
            <Skeleton className="mt-2 h-14 w-full rounded-xl" />
          ) : (
            <View className="mt-2 rounded-xl border border-border bg-card p-3.5">
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
                  <View
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: isWellnessDone ? Colors.brand : Colors.modify,
                    }}
                  />
                  <Text className="text-sm font-medium text-text-primary">
                    {isWellnessDone ? 'Wellness completed' : 'Wellness pending'}
                    {activeTodayRecovery.length > 0
                      ? ` · ${activeTodayRecovery.length} recovery`
                      : ''}
                  </Text>
                </View>
                <Pressable
                  testID="wellness-checkin"
                  accessibilityRole="button"
                  accessibilityLabel={
                    isWellnessDone ? 'Update wellness check-in' : 'Wellness check-in'
                  }
                  hitSlop={8}
                  onPress={() => {
                    hapticLight();
                    setWellnessSheetOpen(true);
                  }}
                >
                  <Text className="text-sm font-semibold text-brand">
                    {isWellnessDone ? 'Update' : 'Check in'}
                  </Text>
                </Pressable>
              </View>
              {!isWellnessDone ? (
                <Button
                  className="mt-3"
                  label="Start wellness check-in"
                  onPress={() => {
                    hapticLight();
                    setWellnessSheetOpen(true);
                  }}
                />
              ) : null}
              {showCoachCheckinPending ? (
                <View className="mt-3 border-t border-border/80 pt-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
                      <View
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: Colors.modify }}
                      />
                      <Text className="text-sm font-medium text-text-primary">
                        Coach check-in pending
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start coach check-in"
                      hitSlop={8}
                      onPress={() => {
                        hapticLight();
                        router.push(APP_HREFS.dailyCheckin as Href);
                      }}
                    >
                      <Text className="text-sm font-semibold text-brand">Start</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          )}

          {/* Text-first write list (replaces icon grid) */}
          <Text className="mb-2.5 mt-6 text-xs font-semibold uppercase tracking-widest text-text-muted">
            Log
          </Text>
          <View className="overflow-hidden rounded-xl border border-border bg-card">
            {(
              [
                nutritionEnabled
                  ? {
                      testID: 'log-meal',
                      label: 'Log meal',
                      detail: 'Food & macros',
                      onPress: () => setMealSheetOpen(true),
                    }
                  : null,
                {
                  label: 'Add water',
                  detail: 'Hydration presets',
                  onPress: () => setHydrationSheetOpen(true),
                },
                {
                  label: 'Recovery event',
                  detail: 'Illness, stress, injury',
                  onPress: () => router.push('/(app)/recovery-event' as Href),
                },
                {
                  label: 'Measurement',
                  detail: 'Weight, HR, body comp',
                  onPress: () => setMeasurementSheetOpen(true),
                },
                {
                  label: 'Coach check-in',
                  detail: 'Tailored readiness questions',
                  onPress: () => router.push('/(app)/daily-checkin' as Href),
                },
              ] as ({
                testID?: string;
                label: string;
                detail: string;
                onPress: () => void;
              } | null)[]
            )
              .filter((row): row is NonNullable<typeof row> => row != null)
              .map((row, index, rows) => (
                <AnimatedPressable
                  key={row.label}
                  testID={row.testID}
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                  className={`flex-row items-center px-4 py-3.5 ${
                    index < rows.length - 1 ? 'border-b border-border/80' : ''
                  }`}
                  onPress={() => {
                    hapticLight();
                    row.onPress();
                  }}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-medium text-text-primary">{row.label}</Text>
                    <Text className="mt-0.5 text-sm text-text-muted">{row.detail}</Text>
                  </View>
                  <Text className="ml-2 text-sm font-semibold text-brand">Add</Text>
                </AnimatedPressable>
              ))}
          </View>

          {/* Today's Entries Timeline Feed */}
          <Text className="mb-2.5 mt-6 text-xs font-semibold uppercase tracking-widest text-text-muted">
            Today’s Entries
          </Text>

          {todayEntries.length === 0 ? (
            <View className="rounded-xl border border-border bg-card p-4">
              <Text className="text-sm text-text-muted">
                No entries logged yet today. Use Log above to start.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {todayEntries.map((entry) => (
                <View
                  key={entry.id}
                  className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3.5"
                >
                  <View className="flex-row items-center gap-3">
                    <View className="rounded bg-border px-2 py-1">
                      <Text className="text-[10px] font-bold text-text-muted">{entry.time}</Text>
                    </View>
                    <View>
                      <Text className="text-sm font-semibold text-text-primary">{entry.title}</Text>
                      <Text className="text-xs text-text-muted">{entry.sub}</Text>
                    </View>
                  </View>

                  <Pressable
                    hitSlop={8}
                    onPress={entry.onAction}
                    className="py-1 active:opacity-70"
                  >
                    <Text className="text-xs font-semibold text-brand">{entry.actionLabel}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Secondary Summary Cards */}
          <Text className="mb-2.5 mt-8 text-xs font-semibold uppercase tracking-widest text-text-muted">
            Nutrition & Metrics Summary
          </Text>

          {/* Nutrition Summary Card */}
          {nutritionEnabled && todayNutrition ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nutrition & Hydration Summary"
              className="mb-3 rounded-xl border border-border bg-card p-4 active:opacity-80"
              onPress={() => {
                hapticLight();
                setNutritionDetailSheetOpen(true);
              }}
            >
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-text-primary">
                  Nutrition & Hydration
                </Text>
                <Text className="text-xs font-semibold text-brand">View Details ›</Text>
              </View>

              <View className="flex-row items-baseline gap-2">
                <Text className="text-xl font-extrabold text-text-primary">
                  {todayNutrition.calories}
                  <Text className="text-xs font-semibold text-text-muted">
                    {todayNutrition.caloriesGoal != null
                      ? ` / ${todayNutrition.caloriesGoal} kcal`
                      : ' kcal'}
                  </Text>
                </Text>
                {todayNutrition.caloriesGoal != null ? (
                  <Text className="text-xs font-semibold text-brand">
                    ({goalProgressPct(todayNutrition.calories, todayNutrition.caloriesGoal)}%)
                  </Text>
                ) : null}
              </View>

              <Text className="mt-1 text-xs text-text-muted">
                Carbs {formatMacroGrams(todayNutrition.carbs)}g · Protein{' '}
                {formatMacroGrams(todayNutrition.protein)}g · Fat{' '}
                {formatMacroGrams(todayNutrition.fat)}g
              </Text>
            </Pressable>
          ) : null}

          {/* Body Measurements Summary Card */}
          {measurementsData ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Body Measurements Summary"
              className="mb-3 rounded-xl border border-border bg-card p-4 active:opacity-80"
              onPress={() => {
                hapticLight();
                setMeasurementsDetailSheetOpen(true);
              }}
            >
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-text-primary">Body Measurements</Text>
                <Text className="text-xs font-semibold text-brand">View Details ›</Text>
              </View>

              {measurementsData.latestByMetric.length > 0 ? (
                <View className="flex-row flex-wrap gap-3">
                  {measurementsData.latestByMetric.slice(0, 3).map((m) => (
                    <View key={m.id} className="rounded-lg bg-surface px-3 py-2">
                      <Text className="text-[10px] font-bold uppercase text-text-muted">
                        {m.metricKey}
                      </Text>
                      <Text className="text-sm font-bold text-text-primary">
                        {m.value} {m.unit}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-xs text-text-muted">No measurements recorded yet.</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>

        {/* Modal Action Sheets */}
        <LogMealSheet
          visible={mealSheetOpen}
          onOpenPhotoFlow={() => {
            setMealSheetOpen(false);
            router.push('/(app)/(tabs)/log/photo-meal' as Href);
          }}
          onClose={() => {
            setMealSheetOpen(false);
            router.setParams({ action: undefined, t: undefined });
          }}
        />
        <HydrationQuickAddSheet
          visible={hydrationSheetOpen}
          onClose={() => setHydrationSheetOpen(false)}
          currentWaterMl={todayNutrition?.waterMl ?? 0}
          targetWaterMl={todayNutrition?.fluidGoalMl ?? null}
        />
        <WellnessCheckinSheet
          visible={wellnessSheetOpen}
          onClose={() => setWellnessSheetOpen(false)}
          initialValues={wellnessInitialValues}
          weightUnits={athleteProfile?.weightUnits}
          weightUnitLabel={weightUnitLabel}
        />
        <MeasurementSheet
          visible={measurementSheetOpen}
          onClose={() => setMeasurementSheetOpen(false)}
        />

        {/* Modal Detail Sheets */}
        <NutritionDetailSheet
          visible={nutritionDetailSheetOpen}
          onClose={() => setNutritionDetailSheetOpen(false)}
        />
        <MeasurementsDetailSheet
          visible={measurementsDetailSheetOpen}
          onClose={() => setMeasurementsDetailSheetOpen(false)}
        />
      </View>
    </SafeAreaView>
  );
}
