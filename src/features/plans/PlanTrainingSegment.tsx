/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app
 * pre-emit critique: P5 H4 E5 S4 R5 V4 — title → note → season → Adjust → week → sessions
 */
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { showActionSheet } from '@/src/components/ActionSheet';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { AppSymbol } from '@/src/components/AppSymbol';
import { BottomSheet } from '@/src/components/BottomSheet';
import { Button } from '@/src/components/Button';
import { Skeleton } from '@/src/components/Skeleton';
import { SportIcon } from '@/src/components/SportIcon';
import { StructureProfile } from '@/src/features/activity/charts/StructureProfile';
import { buildComplianceIndex, type ComplianceMark } from '@/src/features/activity/compliance';
import { ComplianceMarkView } from '@/src/features/activity/ComplianceMark';
import { formatDuration } from '@/src/features/activity/mapActivity';
import type { PlannedListItem } from '@/src/features/activity/types';
import { useActivityGlanceWorkoutsQuery } from '@/src/features/activity/useActivity';
import { useNutritionPlanQuery } from '@/src/features/nutrition/useNutrition';
import { isNutritionTrackingEnabled } from '@/src/features/profile/mapProfile';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { humanizeWorkoutType } from '@/src/lib/humanizeWorkoutType';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { localDateKey } from '@/src/features/today/weekGlance';

import { formatDayChipLabel, formatWeekRangeLabel, humanizePlanStrategy } from './formatPlanCopy';
import {
  filterPlannedToWeek,
  findCurrentWeekIndex,
  seasonTodayPercent,
  weekDateKeys,
} from './mapActivePlan';
import { mapNutritionPlanDays, weekHasSelectedMeals } from './mapNutritionPlan';
import { PlanAdjustSheet } from './PlanAdjustSheet';
import { PlanSessionEditorSheet } from './PlanSessionEditorSheet';
import { SeasonTimeline, WeekTargetStats } from './SeasonTimeline';
import type { ActivePlanShell, NutritionPlanApi, PlanWeekShell } from './types';
import {
  useAbandonPlanMutation,
  useAdaptPlanMutation,
  useDeletePlannedWorkoutMutation,
  useGenerateAiWeekMutation,
  useGenerateBlockMutation,
  useGenerateStructureMutation,
  useGenerateWeekStructuresMutation,
  useMovePlannedMutation,
  usePatchWeekMutation,
  usePlanWeekSessionsQuery,
  useReplanStructureMutation,
} from './usePlans';

type SessionEditorContext =
  | {
      mode: 'create';
      dateKey: string;
      weekDayKeys: string[];
      trainingWeekId?: string;
    }
  | {
      mode: 'edit';
      plannedId: string;
      dateKey: string;
      title: string;
      type?: string | null;
      durationSec?: number | null;
      tss?: number | null;
      description?: string | null;
      weekDayKeys?: string[];
    };

type Props = {
  shell: ActivePlanShell | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  hasUsableData?: boolean;
  onOpenNutrition?: () => void;
};

type MoveUndo = {
  id: string;
  title: string;
  previousDate: string;
};

function weekContainsTodaySafe(weekMeta: PlanWeekShell | null | undefined): boolean {
  const today = localDateKey(new Date()) ?? '';
  if (!weekMeta?.startDateKey || !today) return false;
  return today >= weekMeta.startDateKey && today <= (weekMeta.endDateKey ?? weekMeta.startDateKey);
}

export function PlanTrainingSegment({
  shell,
  loading,
  error,
  onRetry,
  hasUsableData,
  onOpenNutrition,
}: Props) {
  const theme = useThemeColors();
  const weeks = shell?.weeks ?? [];
  // Declared before the render-time shell reset below, which needs it to resolve
  // the current-week index (CW-285 fallback).
  const todayKey = localDateKey(new Date()) ?? '';
  const [weekIndex, setWeekIndex] = useState(0);
  const [shellCursor, setShellCursor] = useState<{
    id: string | undefined;
    currentWeekId: string | undefined;
    weekCount: number;
  }>(() => ({
    id: shell?.id,
    currentWeekId: shell?.currentWeek?.id,
    weekCount: shell?.weeks.length ?? 0,
  }));

  // Reset week browser when the active plan shell changes (render-time derived state).
  if (
    shell?.id !== shellCursor.id ||
    shell?.currentWeek?.id !== shellCursor.currentWeekId ||
    (shell?.weeks.length ?? 0) !== shellCursor.weekCount
  ) {
    setShellCursor({
      id: shell?.id,
      currentWeekId: shell?.currentWeek?.id,
      weekCount: shell?.weeks.length ?? 0,
    });
    if (shell) {
      const idx = findCurrentWeekIndex(shell, todayKey);
      setWeekIndex(idx >= 0 ? idx : Math.max(0, shell.weeks.length - 1));
    }
  }

  const weekMeta: PlanWeekShell | null = weeks[weekIndex] ?? shell?.currentWeek ?? null;
  const weekSessionsQuery = usePlanWeekSessionsQuery(weekMeta?.startDateKey, weekMeta?.endDateKey);
  const adapt = useAdaptPlanMutation();
  const abandon = useAbandonPlanMutation();
  const replan = useReplanStructureMutation();
  const patchWeek = usePatchWeekMutation();
  const movePlanned = useMovePlannedMutation();
  const deletePlanned = useDeletePlannedWorkoutMutation();
  const genStructure = useGenerateStructureMutation();
  const genWeekStructures = useGenerateWeekStructuresMutation();
  const genWeek = useGenerateAiWeekMutation();
  const genBlock = useGenerateBlockMutation();
  const profile = useAthleteProfileQuery();
  const trackingOn = isNutritionTrackingEnabled(profile.data);
  const nutritionRange = useMemo(
    () => ({
      start: weekMeta?.startDateKey ?? '',
      end: weekMeta?.endDateKey ?? weekMeta?.startDateKey ?? '',
    }),
    [weekMeta?.startDateKey, weekMeta?.endDateKey],
  );
  const weekActivityRange = useMemo(() => {
    if (!nutritionRange.start) return null;
    const start = new Date(`${nutritionRange.start}T00:00:00`);
    const end = new Date(`${nutritionRange.end || nutritionRange.start}T23:59:59.999`);
    return { start, end };
  }, [nutritionRange.start, nutritionRange.end]);
  const weekActivitiesQuery = useActivityGlanceWorkoutsQuery(
    weekActivityRange?.start ?? new Date(0),
    weekActivityRange?.end ?? new Date(0),
    { enabled: Boolean(weekActivityRange) },
  );
  const weekContainsToday = weekContainsTodaySafe(weekMeta);
  const nutritionQuery = useNutritionPlanQuery(nutritionRange.start, nutritionRange.end, {
    enabled: trackingOn && Boolean(nutritionRange.start) && weekContainsToday,
  });

  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [busyElapsedSec, setBusyElapsedSec] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [weekTuneOpen, setWeekTuneOpen] = useState(false);
  const [aiWeekOpen, setAiWeekOpen] = useState(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [moveTarget, setMoveTarget] = useState<PlannedListItem | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [moveUndo, setMoveUndo] = useState<MoveUndo | null>(null);
  const [sessionEditor, setSessionEditor] = useState<SessionEditorContext | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const busyAbortRef = useRef<AbortController | null>(null);

  // Abort any in-flight busy operation (adapt/generate pollers) when this segment unmounts —
  // leaving Plan mid-poll would otherwise keep hitting /api/plans/status after the screen is gone.
  useEffect(() => {
    return () => {
      busyAbortRef.current?.abort();
    };
  }, []);

  const weekSessions = useMemo(() => {
    const items = weekSessionsQuery.data ?? [];
    return filterPlannedToWeek(items, weekMeta);
  }, [weekSessionsQuery.data, weekMeta]);

  const compliance = useMemo(
    () =>
      buildComplianceIndex(weekActivityRange ? weekActivitiesQuery.data : undefined, weekSessions),
    [weekActivityRange, weekActivitiesQuery.data, weekSessions],
  );

  const needsStructureIds = useMemo(
    () =>
      weekSessions
        .filter((s) => !s.structureChartBlocks || s.structureChartBlocks.length < 2)
        .map((s) => s.id),
    [weekSessions],
  );

  const nutritionDays = useMemo(
    () =>
      mapNutritionPlanDays(
        (nutritionQuery.data as NutritionPlanApi | null | undefined) ?? null,
        nutritionRange,
      ),
    [nutritionQuery.data, nutritionRange],
  );
  const nutritionEmpty =
    trackingOn &&
    weekContainsToday &&
    !nutritionQuery.isLoading &&
    !nutritionQuery.isError &&
    !weekHasSelectedMeals(nutritionDays);

  const currentWeekIndex = useMemo(() => findCurrentWeekIndex(shell, todayKey), [shell, todayKey]);
  const weekIsPast = Boolean(
    weekMeta?.endDateKey && weekMeta.endDateKey < todayKey && !weekContainsToday,
  );
  const browsingAway = currentWeekIndex >= 0 && weekIndex !== currentWeekIndex;

  if (busyMsg !== busyKey) {
    setBusyKey(busyMsg);
    setBusyElapsedSec(0);
  }

  useEffect(() => {
    if (!busyMsg) return;
    const started = Date.now();
    const id = setInterval(() => {
      setBusyElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [busyMsg]);

  const busyElapsedDisplay = busyMsg ? busyElapsedSec : 0;

  const [volumeMins, setVolumeMins] = useState('');
  const [tss, setTss] = useState('');
  const [focusLabel, setFocusLabel] = useState('');
  const [isRecovery, setIsRecovery] = useState(false);

  const moveDayKeys = useMemo(() => {
    const weekKeys = weekDateKeys(weekMeta);
    if (weekKeys.length > 0) return weekKeys;
    return [todayKey].filter(Boolean);
  }, [weekMeta, todayKey]);

  const openAddSession = () => {
    if (!weekMeta || busyMsg) return;
    hapticLight();
    const dateKey =
      (weekContainsToday && todayKey && moveDayKeys.includes(todayKey)
        ? todayKey
        : moveDayKeys[0]) ?? todayKey;
    if (!dateKey) return;
    setSessionEditor({
      mode: 'create',
      dateKey,
      weekDayKeys: moveDayKeys,
      trainingWeekId: weekMeta.id,
    });
  };

  const openEditSession = (item: PlannedListItem) => {
    if (busyMsg) return;
    hapticLight();
    setSessionEditor({
      mode: 'edit',
      plannedId: item.id,
      dateKey: localDateKey(item.date) ?? moveDayKeys[0] ?? todayKey,
      title: item.title,
      type: item.type,
      durationSec: item.durationSec,
      tss: item.tss,
      // Only forwarded when the list row actually carried one; the editor omits absent
      // fields from the patch rather than sending null (CW-486).
      ...(item.description !== undefined ? { description: item.description } : {}),
      weekDayKeys: moveDayKeys,
    });
  };

  const confirmDeleteSession = (item: PlannedListItem) => {
    if (busyMsg) return;
    Alert.alert(
      'Delete session?',
      `"${item.title}" will be removed from your plan. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void runBusy('Deleting session', () => deletePlanned.mutateAsync(item.id));
          },
        },
      ],
    );
  };

  const openWeekTune = () => {
    if (!weekMeta) return;
    setVolumeMins(weekMeta.volumeTargetMinutes != null ? String(weekMeta.volumeTargetMinutes) : '');
    setTss(weekMeta.tssTarget != null ? String(weekMeta.tssTarget) : '');
    setFocusLabel(weekMeta.focusLabel ?? '');
    setIsRecovery(weekMeta.isRecovery);
    setWeekTuneOpen(true);
  };

  const jumpToCurrentWeek = () => {
    if (currentWeekIndex < 0) return;
    hapticLight();
    setWeekIndex(currentWeekIndex);
  };

  const runBusy = async (label: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
    // Supersede any still-running busy operation (its own poll keeps going otherwise).
    busyAbortRef.current?.abort();
    const controller = new AbortController();
    busyAbortRef.current = controller;
    setActionError(null);
    setBusyMsg(label);
    try {
      await fn(controller.signal);
      hapticSuccess();
    } catch (err) {
      if (controller.signal.aborted) return;
      hapticError();
      setActionError(friendlyError(err, 'Something went wrong'));
    } finally {
      if (busyAbortRef.current === controller) {
        busyAbortRef.current = null;
        setBusyMsg(null);
      }
    }
  };

  const generateMissingStructures = () => {
    if (needsStructureIds.length === 0) return;
    void runBusy('Generating structures', (signal) =>
      genWeekStructures.mutateAsync({
        ids: needsStructureIds,
        onProgress: (done, total) => {
          setBusyMsg(`Generating structures (${done}/${total})`);
        },
        signal,
      }),
    );
  };

  const onWeekSwipe = (dx: number) => {
    if (Math.abs(dx) < 56 || weeks.length <= 1 || busyMsg) return;
    hapticLight();
    if (dx < 0) setWeekIndex((i) => Math.min(weeks.length - 1, i + 1));
    else setWeekIndex((i) => Math.max(0, i - 1));
  };

  if (loading && !shell) {
    return <PlanTrainingSkeleton />;
  }

  if (error && !shell) {
    return (
      <View className="gap-3 px-6 pt-4">
        <View className="rounded-xl border border-danger/40 bg-tint-error p-4">
          <Text className="text-base text-danger">
            {friendlyError(error, 'Failed to load plan')}
          </Text>
          <Pressable className="mt-3" hitSlop={8} onPress={onRetry}>
            <Text className="text-sm font-semibold text-brand">Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!shell) {
    return (
      <View testID="plan-training-empty" className="gap-4 px-6 pt-6">
        <Text className="text-2xl font-semibold text-text-primary">No active plan</Text>
        <Text className="text-sm text-text-muted">
          Create a training plan to see your season, this week’s sessions, and adjust when life
          blows up.
        </Text>
        <Button
          label="Create plan"
          onPress={() => router.push(APP_HREFS.planCreate as Href)}
          testID="plan-create-cta"
        />
      </View>
    );
  }

  const strategyLabel = humanizePlanStrategy(shell.strategy);
  const weekRange = formatWeekRangeLabel(weekMeta?.startDateKey, weekMeta?.endDateKey);
  const selectedBlock =
    shell.blocks.find((b) => b.id === weekMeta?.blockId) ?? shell.blocks[0] ?? null;
  const todayPct = seasonTodayPercent(shell.blocks, weeks, todayKey);

  const selectBlock = (blockId: string) => {
    const idx = weeks.findIndex((w) => w.blockId === blockId);
    if (idx >= 0) setWeekIndex(idx);
  };

  const confirmAdapt = (
    title: string,
    message: string,
    adaptationType: 'RECALCULATE_WEEK' | 'PUSH_FORWARD',
    busy: string,
  ) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: title.includes('Push') ? 'Push forward' : 'Recalculate',
        onPress: () =>
          void runBusy(busy, (signal) =>
            adapt.mutateAsync({ planId: shell.id, adaptationType, signal }),
          ),
      },
    ]);
  };

  const showAdjustMenu = () => {
    if (busyMsg) return;
    hapticLight();
    setAdjustOpen(true);
  };

  const thisWeekActions = [
    {
      id: 'tune',
      label: 'Tune this week',
      hint: 'Focus, volume, TSS, recovery',
      onPress: openWeekTune,
    },
    {
      id: 'gen-week',
      label: 'Generate week',
      hint: 'Optional instructions for AI workouts',
      onPress: () => setAiWeekOpen(true),
    },
    {
      id: 'gen-structures',
      label: 'Generate structures for week',
      hint:
        needsStructureIds.length > 0
          ? `${needsStructureIds.length} without intervals`
          : 'All sessions already have structure',
      disabled: needsStructureIds.length === 0,
      onPress: generateMissingStructures,
    },
    {
      id: 'gen-phase',
      label: 'Generate phase workouts',
      hint: 'Fill the current block',
      disabled: !weekMeta?.blockId,
      onPress: () => {
        const blockId = weekMeta?.blockId;
        if (!blockId) return;
        void runBusy('Generating phase workouts', (signal) =>
          genBlock.mutateAsync({ blockId, signal }),
        );
      },
    },
    {
      id: 'recalc',
      label: 'Recalculate remaining week',
      hint: 'May replace upcoming sessions',
      onPress: () =>
        confirmAdapt(
          'Recalculate remaining week?',
          'Upcoming sessions this week may be replaced.',
          'RECALCULATE_WEEK',
          'Recalculating week',
        ),
    },
    {
      id: 'push',
      label: 'Push schedule forward 1 day',
      onPress: () =>
        confirmAdapt(
          'Push schedule forward?',
          'Planned sessions move one day later.',
          'PUSH_FORWARD',
          'Pushing schedule',
        ),
    },
  ];

  const seasonActions = [
    {
      id: 'edit-blocks',
      label: 'Edit blocks',
      hint: 'Reorder phases and durations',
      onPress: () => router.push(APP_HREFS.planBlocks as Href),
    },
    {
      id: 'replan',
      label: 'Replan structure',
      onPress: () => {
        Alert.alert(
          'Replan structure?',
          'Phase structure will be sent to the server as currently listed.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Replan',
              onPress: () => {
                const blocks = shell.blocks.map((b, i) => ({
                  id: b.id,
                  name: b.name,
                  type: b.type,
                  primaryFocus: b.primaryFocus ?? b.name,
                  durationWeeks: b.durationWeeks,
                  order: b.order ?? i,
                }));
                void runBusy('Replanning structure', () =>
                  replan.mutateAsync({ planId: shell.id, blocks }),
                );
              },
            },
          ],
        );
      },
    },
    {
      id: 'start-new',
      label: 'Start new plan',
      hint: 'Abandon current plan, then create',
      destructive: true,
      onPress: () => {
        Alert.alert('Start new plan?', 'This abandons the current plan and opens the generator.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Abandon & create',
            style: 'destructive',
            onPress: () =>
              void runBusy('Abandoning plan', async () => {
                await abandon.mutateAsync(shell.id);
                router.push(APP_HREFS.planCreate as Href);
              }),
          },
        ]);
      },
    },
    {
      id: 'abandon',
      label: 'Abandon plan',
      destructive: true,
      onPress: () => {
        Alert.alert('Abandon plan?', 'Future AI workouts will be cleared.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Abandon',
            style: 'destructive',
            onPress: () => void runBusy('Abandoning plan', () => abandon.mutateAsync(shell.id)),
          },
        ]);
      },
    },
  ];

  return (
    <View testID="plan-training" className="gap-5 px-6 pb-10 pt-4">
      {actionError ? (
        <View className="rounded-xl border border-danger/40 bg-tint-error p-3">
          <Text className="text-sm text-danger">{actionError}</Text>
        </View>
      ) : null}

      <View className="gap-1">
        <Text className="text-2xl font-semibold text-text-primary" testID="plan-title">
          {shell.title}
        </Text>
        {strategyLabel ? <Text className="text-sm text-text-muted">{strategyLabel}</Text> : null}
        {shell.provisionalHint || hasUsableData === false ? (
          <Text className="mt-1 text-sm text-modify">
            Provisional — coaching improves after Health Sync or a connected app.
          </Text>
        ) : null}
        {weekIsPast ? (
          <Text className="mt-1 text-sm text-modify">
            Showing a past plan week — browse weeks or start a new plan when you’re ready.
          </Text>
        ) : null}
      </View>

      {shell.coachNotes ? (
        <View className="rounded-xl border border-border bg-card/60 p-3">
          <Text className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Coach note
          </Text>
          <Text className="mt-1 text-sm text-text-body">{shell.coachNotes}</Text>
        </View>
      ) : null}

      {shell.blocks.length > 0 ? (
        <SeasonTimeline
          blocks={shell.blocks}
          selectedBlockId={weekMeta?.blockId ?? selectedBlock?.id ?? null}
          todayPercent={todayPct}
          onSelectBlock={selectBlock}
        />
      ) : null}

      <View className="gap-2">
        <Button
          label="Adjust plan"
          variant="secondary"
          onPress={showAdjustMenu}
          disabled={Boolean(busyMsg)}
          testID="plan-adjust"
        />
        {weekIsPast && weekIndex >= Math.max(0, weeks.length - 1) ? (
          <Button
            label="Create plan"
            onPress={() => router.push(APP_HREFS.planCreate as Href)}
            testID="plan-create-from-past"
          />
        ) : null}
        {busyMsg ? (
          <Text className="text-sm text-brand" testID="plan-busy">
            {busyMsg}
            {busyElapsedDisplay >= 8 ? ` · still working (${busyElapsedDisplay}s)` : '…'}
          </Text>
        ) : null}
      </View>

      {moveUndo ? (
        <View className="flex-row items-center justify-between rounded-xl border border-border bg-card/70 px-3 py-2.5">
          <Text className="mr-3 min-w-0 flex-1 text-sm text-text-muted" numberOfLines={2}>
            Moved {moveUndo.title}
          </Text>
          <AnimatedPressable
            hitSlop={8}
            disabled={Boolean(busyMsg)}
            onPress={() => {
              const undo = moveUndo;
              setMoveUndo(null);
              void runBusy('Undoing move', () =>
                movePlanned.mutateAsync({ id: undo.id, date: undo.previousDate }),
              );
            }}
            accessibilityRole="button"
            accessibilityLabel="Undo move"
          >
            <Text className="text-sm font-semibold text-brand">Undo</Text>
          </AnimatedPressable>
        </View>
      ) : null}

      {nutritionEmpty ? (
        <View className="rounded-xl border border-border bg-card/60 p-3">
          <Text className="text-sm text-text-muted">No meals planned for this week yet.</Text>
          <AnimatedPressable
            hitSlop={8}
            className="mt-2 self-start"
            onPress={() => onOpenNutrition?.()}
            accessibilityRole="button"
            accessibilityLabel="Open Nutrition plan"
          >
            <Text className="text-sm font-semibold text-brand">Fuel this week</Text>
          </AnimatedPressable>
        </View>
      ) : null}

      <View
        onTouchStart={(e) => {
          swipeStartX.current = e.nativeEvent.pageX;
        }}
        onTouchEnd={(e) => {
          if (swipeStartX.current == null) return;
          onWeekSwipe(e.nativeEvent.pageX - swipeStartX.current);
          swipeStartX.current = null;
        }}
      >
        {weeks.length > 1 ? (
          <View className="mb-3 flex-row items-center justify-between">
            <AnimatedPressable
              hitSlop={8}
              disabled={weekIndex <= 0}
              onPress={() => {
                hapticLight();
                setWeekIndex((i) => Math.max(0, i - 1));
              }}
              accessibilityRole="button"
              accessibilityLabel="Previous plan week"
            >
              <Text
                className={`text-sm font-semibold ${
                  weekIndex <= 0 ? 'text-text-muted' : 'text-brand'
                }`}
              >
                Previous
              </Text>
            </AnimatedPressable>
            <View className="items-center px-2">
              <Text className="text-sm font-semibold text-text-primary">{weekRange ?? 'Week'}</Text>
              {browsingAway ? (
                <AnimatedPressable
                  hitSlop={8}
                  onPress={jumpToCurrentWeek}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to this week"
                  className="mt-1"
                >
                  <Text className="text-xs font-semibold text-brand">This week</Text>
                </AnimatedPressable>
              ) : null}
            </View>
            <AnimatedPressable
              hitSlop={8}
              disabled={weekIndex >= weeks.length - 1}
              onPress={() => {
                hapticLight();
                setWeekIndex((i) => Math.min(weeks.length - 1, i + 1));
              }}
              accessibilityRole="button"
              accessibilityLabel="Next plan week"
            >
              <Text
                className={`text-sm font-semibold ${
                  weekIndex >= weeks.length - 1 ? 'text-text-muted' : 'text-brand'
                }`}
              >
                Next
              </Text>
            </AnimatedPressable>
          </View>
        ) : null}

        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          {weekContainsToday ? 'This week' : 'Plan week'}
          {weekRange && weeks.length <= 1 ? ` · ${weekRange}` : ''}
        </Text>

        <View className="mb-3">
          <WeekTargetStats week={weekMeta} block={selectedBlock} />
        </View>

        {weekMeta?.explanation ? (
          <Text className="mb-3 text-sm text-text-body">{weekMeta.explanation}</Text>
        ) : null}

        {weekSessionsQuery.isLoading && weekSessions.length === 0 ? (
          <View className="gap-2" testID="plan-week-sessions-skeleton">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </View>
        ) : weekSessions.length === 0 ? (
          <View className="gap-3" testID="plan-week-empty">
            <Text className="text-sm text-text-muted">
              No sessions in this week yet. Generate a week of workouts, add one, or browse
              Upcoming.
            </Text>
            <Button
              label="Generate week"
              disabled={Boolean(busyMsg) || !weekMeta}
              onPress={() => setAiWeekOpen(true)}
              testID="plan-generate-week-cta"
            />
            <Button
              label="Add session"
              variant="secondary"
              disabled={Boolean(busyMsg) || !weekMeta}
              onPress={openAddSession}
              testID="plan-add-session"
            />
            <AnimatedPressable
              hitSlop={8}
              onPress={() => router.push(APP_HREFS.upcoming as Href)}
              accessibilityRole="button"
              accessibilityLabel="Open Upcoming"
            >
              <Text className="text-sm font-semibold text-brand">Open Upcoming</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <>
            <View className="mb-2 flex-row flex-wrap items-center gap-x-4 gap-y-1">
              <AnimatedPressable
                hitSlop={8}
                disabled={Boolean(busyMsg) || !weekMeta}
                onPress={openAddSession}
                accessibilityRole="button"
                accessibilityLabel="Add session"
                className="self-start py-1"
                testID="plan-add-session"
              >
                <Text className="text-sm font-semibold text-brand">Add session</Text>
              </AnimatedPressable>
              {needsStructureIds.length > 0 ? (
                <AnimatedPressable
                  hitSlop={8}
                  disabled={Boolean(busyMsg)}
                  onPress={generateMissingStructures}
                  accessibilityRole="button"
                  accessibilityLabel="Generate structures for week"
                  className="self-start py-1"
                >
                  <Text className="text-sm font-semibold text-brand">
                    Generate structures ({needsStructureIds.length})
                  </Text>
                </AnimatedPressable>
              ) : null}
            </View>
            {weekSessions.map((item) => (
              <SessionRow
                key={item.id}
                item={item}
                busy={Boolean(busyMsg)}
                todayKey={todayKey}
                mark={compliance.forPlanned.get(item.id)}
                onOpen={() => {
                  hapticLight();
                  router.push(APP_HREFS.plannedDetail(item.id) as Href);
                }}
                onEdit={() => openEditSession(item)}
                onDelete={() => confirmDeleteSession(item)}
                onMove={() => {
                  hapticLight();
                  setMoveTarget(item);
                  setMoveDate(localDateKey(item.date) ?? moveDayKeys[0] ?? '');
                }}
                onGenerateStructure={
                  !item.structureChartBlocks || item.structureChartBlocks.length < 2
                    ? () =>
                        void runBusy('Generating structure', (signal) =>
                          genStructure.mutateAsync({ plannedWorkoutId: item.id, signal }),
                        )
                    : undefined
                }
              />
            ))}
          </>
        )}
      </View>

      <PlanAdjustSheet
        visible={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        thisWeek={thisWeekActions}
        season={seasonActions}
      />

      <BottomSheet
        visible={weekTuneOpen}
        onClose={() => setWeekTuneOpen(false)}
        keyboard
        testID="plan-tune-week-sheet"
      >
        <Text className="mb-3 text-lg font-semibold text-text-primary">Tune week</Text>
        <Field label="Focus" value={focusLabel} onChangeText={setFocusLabel} />
        <Field
          label="Volume (minutes)"
          value={volumeMins}
          onChangeText={setVolumeMins}
          keyboardType="number-pad"
        />
        <Field label="TSS target" value={tss} onChangeText={setTss} keyboardType="number-pad" />
        <AnimatedPressable
          className="mb-4 flex-row items-center gap-2"
          hitSlop={8}
          onPress={() => {
            hapticLight();
            setIsRecovery((v) => !v);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isRecovery }}
          accessibilityLabel="Recovery week"
        >
          <View
            className={`h-5 w-5 items-center justify-center rounded border ${
              isRecovery ? 'border-brand bg-brand' : 'border-border-strong'
            }`}
          >
            {isRecovery ? (
              <AppSymbol sf="checkmark" size={12} tintColor={theme.ink} fallback="" />
            ) : null}
          </View>
          <Text className="text-sm text-text-primary">Recovery week</Text>
        </AnimatedPressable>
        <Button
          label="Save"
          disabled={Boolean(busyMsg)}
          onPress={() => {
            if (!weekMeta) return;
            void runBusy('Saving week', async () => {
              await patchWeek.mutateAsync({
                weekId: weekMeta.id,
                input: {
                  focusLabel: focusLabel.trim() || undefined,
                  volumeTargetMinutes: volumeMins ? Number(volumeMins) : undefined,
                  tssTarget: tss ? Number(tss) : undefined,
                  isRecovery,
                },
              });
              setWeekTuneOpen(false);
            });
          }}
        />
        <View className="mt-3">
          <Button label="Cancel" variant="secondary" onPress={() => setWeekTuneOpen(false)} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={aiWeekOpen}
        onClose={() => setAiWeekOpen(false)}
        keyboard
        testID="plan-generate-week-sheet"
      >
        <Text className="mb-3 text-lg font-semibold text-text-primary">Generate week</Text>
        <Text className="mb-2 text-sm text-text-muted">
          Optional instructions for this week’s workouts.
        </Text>
        <TextInput
          className="mb-4 min-h-[80px] rounded-xl border border-border-strong bg-card px-3 py-2 text-text-primary"
          multiline
          value={aiInstructions}
          onChangeText={setAiInstructions}
          placeholder="e.g. Keep Tuesday easy, race Saturday"
          placeholderTextColor={theme.textMuted}
        />
        <Button
          label="Generate"
          disabled={Boolean(busyMsg)}
          onPress={() => {
            if (!weekMeta) return;
            void runBusy('Generating week', async (signal) => {
              await genWeek.mutateAsync({
                blockId: weekMeta.blockId,
                weekId: weekMeta.id,
                instructions: aiInstructions,
                signal,
              });
              setAiWeekOpen(false);
              setAiInstructions('');
            });
          }}
        />
        <View className="mt-3">
          <Button label="Cancel" variant="secondary" onPress={() => setAiWeekOpen(false)} />
        </View>
      </BottomSheet>

      <PlanSessionEditorSheet
        visible={sessionEditor != null}
        context={sessionEditor}
        onClose={() => setSessionEditor(null)}
      />

      <BottomSheet
        visible={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        testID="plan-move-workout-sheet"
      >
        <Text className="mb-3 text-lg font-semibold text-text-primary">Move workout</Text>
        <Text className="mb-3 text-sm text-text-muted">{moveTarget?.title}</Text>
        <Text className="mb-2 text-sm font-medium text-text-muted">New day</Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {moveDayKeys.map((key) => {
            const selected = moveDate === key;
            return (
              <AnimatedPressable
                key={key}
                hitSlop={8}
                onPress={() => {
                  hapticLight();
                  setMoveDate(key);
                }}
                className={`rounded-xl border px-3 py-1.5 ${
                  selected ? 'border-brand bg-brand/15' : 'border-border bg-card'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    selected ? 'text-brand' : 'text-text-primary'
                  }`}
                >
                  {formatDayChipLabel(key)}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
        <Button
          label="Move"
          disabled={Boolean(busyMsg)}
          onPress={() => {
            if (!moveTarget || !moveDate) {
              setActionError('Pick a day');
              hapticError();
              return;
            }
            const previousDate = localDateKey(moveTarget.date);
            const target = moveTarget;
            const nextDate = moveDate;
            void runBusy('Moving workout', async () => {
              await movePlanned.mutateAsync({ id: target.id, date: nextDate });
              setMoveTarget(null);
              if (previousDate && previousDate !== nextDate) {
                setMoveUndo({
                  id: target.id,
                  title: target.title,
                  previousDate,
                });
              }
            });
          }}
        />
        <View className="mt-3">
          <Button label="Cancel" variant="secondary" onPress={() => setMoveTarget(null)} />
        </View>
      </BottomSheet>
    </View>
  );
}

function PlanTrainingSkeleton() {
  return (
    <View className="gap-4 px-6 pt-4" testID="plan-training-skeleton">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-2 h-11 w-full rounded-xl" />
      <Skeleton className="mt-2 h-3 w-1/3" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-16 rounded-xl" />
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'number-pad';
}) {
  const theme = useThemeColors();
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-text-muted">{label}</Text>
      <TextInput
        className="rounded-xl border border-border-strong bg-card px-3 py-2.5 text-text-primary"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={theme.textMuted}
      />
    </View>
  );
}

function SessionRow({
  item,
  busy,
  todayKey,
  mark,
  onOpen,
  onEdit,
  onDelete,
  onMove,
  onGenerateStructure,
}: {
  item: PlannedListItem;
  busy: boolean;
  todayKey: string;
  mark: ComplianceMark | undefined;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onGenerateStructure?: () => void;
}) {
  const dayKey = localDateKey(item.date);
  const isToday = Boolean(dayKey && dayKey === todayKey);
  const meta = [
    dayKey ? formatDayChipLabel(dayKey) : null,
    isToday ? 'Today' : null,
    humanizeWorkoutType(item.type),
    formatDuration(item.durationSec),
    item.tss != null ? `TSS ${Math.round(item.tss)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const chartBlocks = item.structureChartBlocks;

  const showMore = () => {
    if (busy) return;
    hapticLight();
    showActionSheet({
      title: item.title,
      options: [
        { label: 'Edit', onPress: onEdit },
        { label: 'Move', onPress: onMove },
        ...(onGenerateStructure
          ? [{ label: 'Generate structure', onPress: onGenerateStructure }]
          : []),
        { label: 'Delete', style: 'destructive' as const, onPress: onDelete },
        { label: 'Cancel', style: 'cancel' as const },
      ],
    });
  };

  return (
    <View className="border-b border-border/80 py-3">
      <View className="flex-row items-start gap-2">
        <AnimatedPressable
          onPress={onOpen}
          onLongPress={showMore}
          delayLongPress={320}
          hitSlop={8}
          className="min-w-0 flex-1 flex-row items-center gap-3"
          accessibilityRole="button"
          accessibilityLabel={item.title}
          accessibilityHint="Long press for session actions"
        >
          <SportIcon type={item.type} size={14} />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center">
              <Text className="shrink text-base font-medium text-text-primary" numberOfLines={1}>
                {item.title}
              </Text>
              <ComplianceMarkView mark={mark} />
            </View>
            {meta ? <Text className="mt-1 text-sm text-text-muted">{meta}</Text> : null}
            {chartBlocks && chartBlocks.length >= 2 ? (
              <StructureProfile blocks={chartBlocks} compact />
            ) : null}
          </View>
        </AnimatedPressable>
        <AnimatedPressable
          hitSlop={8}
          onPress={showMore}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Session actions"
          className="px-1 py-1"
        >
          <Text className="text-lg font-semibold leading-5 text-brand">···</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
