/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app
 * pre-emit critique: P5 H5 E5 S4 R5 V4 — goal → days → volume → sports → timeline → approach
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { Button } from '@/src/components/Button';
import { Skeleton } from '@/src/components/Skeleton';
import { SportIcon } from '@/src/components/SportIcon';
import { localDateYmd } from '@/src/lib/date';
import { useGoalsQuery, usePrimaryGoalQuery } from '@/src/features/goals/useGoals';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { blockTypeColor } from '@/src/theme/colors';
import { useThemeColors } from '@/src/theme/useThemeColors';

import { activatePlan, generateFirstWeekPreview, initializePlan, saveAvailability } from './api';
import { formatDayChipLabel } from './formatPlanCopy';
import {
  buildAvailabilityDays,
  clampDurationWeeks,
  clampVolumeHours,
  defaultSelectedGoalId,
  DURATION_WEEK_CHIPS,
  formatGenerateProgress,
  isPlanSpanValid,
  mapPhaseGlance,
  nextMondayYmd,
  PLAN_STRATEGY_OPTIONS,
  planDateIsoNoon,
  planEndDateIso,
  type PhaseGlance,
  type PlanEndMode,
  recommendStrategy,
  RECOVERY_RHYTHM_OPTIONS,
  resolvePlanEndDateYmd,
  STARTING_PHASE_OPTIONS,
  VOLUME_HOUR_CHIPS,
  volumePreferenceFromHours,
  weeksBetweenYmd,
} from './planGeneratorHelpers';
import { StrategySparkline } from './StrategySparkline';
import type { PlannedWorkoutPreview, PlanStrategy, StartingPhase } from './types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SPORTS = [
  { id: 'Ride', label: 'Ride' },
  { id: 'Run', label: 'Run' },
  { id: 'Swim', label: 'Swim' },
  { id: 'Gym', label: 'Strength' },
];

const FORM_STEPS = ['goal', 'days', 'volume', 'sports', 'timeline', 'approach'] as const;
type FormStep = (typeof FORM_STEPS)[number];
type LastAction = 'generate' | 'activate';

type Props = {
  /** Preferred default when multiple goals exist (activation primary / host). */
  preferredGoalId?: string | null;
  /** @deprecated use preferredGoalId */
  goalId?: string | null;
  onActivated: (planId: string) => void | Promise<void>;
  onGenerateStart?: () => void;
  onCreateGoal?: () => void;
};

function stepIndex(step: FormStep): number {
  return FORM_STEPS.indexOf(step) + 1;
}

function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (id: T) => void;
  testIDPrefix?: string;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <View>
      <View className="flex-row flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = opt.id === value;
          return (
            <AnimatedPressable
              key={String(opt.id)}
              testID={testIDPrefix ? `${testIDPrefix}-${opt.id}` : undefined}
              onPress={() => {
                hapticLight();
                onChange(opt.id);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityHint={opt.hint}
              className={`rounded-xl border px-3 py-2 ${
                isSelected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  isSelected ? 'text-brand' : 'text-text-primary'
                }`}
              >
                {opt.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
      {selected?.hint ? (
        <Text className="mt-2 text-sm text-text-muted">{selected.hint}</Text>
      ) : null}
    </View>
  );
}

function StepMeta({ step, label }: { step: FormStep; label?: string }) {
  return (
    <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
      Step {stepIndex(step)} of {FORM_STEPS.length}
      {label ? ` · ${label}` : ''}
    </Text>
  );
}

function BackLink({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <AnimatedPressable
      hitSlop={8}
      onPress={onPress}
      accessibilityRole="button"
      className="mb-1 self-start"
      testID={testID}
    >
      <Text className="text-sm font-semibold text-brand">{label}</Text>
    </AnimatedPressable>
  );
}

export function PlanGeneratorPanel({
  preferredGoalId,
  goalId,
  onActivated,
  onGenerateStart,
  onCreateGoal,
}: Props) {
  const theme = useThemeColors();
  const hostPreferredId = preferredGoalId ?? goalId ?? null;
  const goalsQuery = useGoalsQuery();
  const { refetch: refetchGoals } = goalsQuery;
  const primaryGoal = usePrimaryGoalQuery();
  const goals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);
  const goalIds = useMemo(() => goals.map((g) => g.id), [goals]);
  const defaultGoalId = useMemo(
    () => defaultSelectedGoalId(goalIds, hostPreferredId, primaryGoal.data?.id ?? null),
    [goalIds, hostPreferredId, primaryGoal.data?.id],
  );

  const [selectedGoalIdOverride, setSelectedGoalIdOverride] = useState<string | null>(null);
  const selectedGoalId =
    selectedGoalIdOverride && goalIds.includes(selectedGoalIdOverride)
      ? selectedGoalIdOverride
      : defaultGoalId;
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [volumeHours, setVolumeHours] = useState(6);
  const [sports, setSports] = useState<string[]>(['Ride']);
  const [strategy, setStrategy] = useState<PlanStrategy>('LINEAR');
  const [recoveryRhythm, setRecoveryRhythm] = useState(4);
  const [startingPhase, setStartingPhase] = useState<StartingPhase>('BASE');
  const [customInstructions, setCustomInstructions] = useState('');
  const [strategyRationale, setStrategyRationale] = useState<string | null>(null);
  const [startYmd, setStartYmd] = useState(() => localDateYmd());
  const [preferDurationEnd, setPreferDurationEnd] = useState(false);
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [phase, setPhase] = useState<'form' | 'working' | 'preview'>('form');
  const [formStep, setFormStep] = useState<FormStep>('goal');
  const [planId, setPlanId] = useState<string | null>(null);
  const [activateStartIso, setActivateStartIso] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlannedWorkoutPreview[]>([]);
  const [phases, setPhases] = useState<PhaseGlance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [generateStartedAt, setGenerateStartedAt] = useState<number | null>(null);
  const [generateElapsedMs, setGenerateElapsedMs] = useState(0);
  const generateAbortRef = useRef<AbortController | null>(null);

  // Abort the first-week-preview poller (up to ~180s) when this panel unmounts — the athlete
  // may navigate away from plan creation mid-generate, and the poll must not keep running.
  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort();
    };
  }, []);

  // Tick while generating so the working phase visibly progresses instead of
  // looking frozen for up to three minutes.
  useEffect(() => {
    if (phase !== 'working' || generateStartedAt == null) return;
    const timer = setInterval(() => {
      setGenerateElapsedMs(Date.now() - generateStartedAt);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, generateStartedAt]);

  useFocusEffect(
    useCallback(() => {
      void refetchGoals();
    }, [refetchGoals]),
  );

  const selectedGoal = useMemo(
    () => goals.find((g) => g.id === selectedGoalId) ?? null,
    [goals, selectedGoalId],
  );

  const endMode: PlanEndMode = selectedGoal?.planEndDateKey
    ? preferDurationEnd
      ? 'duration'
      : 'goal'
    : 'duration';

  const endYmd = useMemo(
    () =>
      resolvePlanEndDateYmd({
        mode: endMode,
        startYmd,
        goalEndYmd: selectedGoal?.planEndDateKey,
        durationWeeks,
      }),
    [endMode, startYmd, selectedGoal?.planEndDateKey, durationWeeks],
  );

  const endReady = Boolean(endYmd && isPlanSpanValid(startYmd, endYmd));

  const toggleDay = (d: number) => {
    hapticLight();
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };
  const toggleSport = (id: string) => {
    hapticLight();
    setSports((prev) => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const canGenerate = useMemo(
    () => Boolean(selectedGoalId) && days.length > 0 && sports.length > 0 && endReady,
    [selectedGoalId, days.length, sports.length, endReady],
  );

  const volumeBand =
    volumeHours <= 5 ? 'lighter load' : volumeHours >= 10 ? 'heavier load' : 'balanced load';

  const todayYmd = localDateYmd();
  const mondayYmd = nextMondayYmd();

  const onGenerate = async () => {
    setLastAction('generate');
    if (!selectedGoalId) {
      setError('Select a goal first, then generate.');
      hapticError();
      return;
    }
    if (!endYmd || !isPlanSpanValid(startYmd, endYmd)) {
      setError('Pick a target date or duration of at least 4 weeks.');
      hapticError();
      return;
    }
    setError(null);
    setBusy(true);
    setPhase('working');
    setGenerateStartedAt(Date.now());
    setGenerateElapsedMs(0);
    onGenerateStart?.();
    // Supersede any still-running generate (e.g. a fast Retry tap) before starting a new one.
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    try {
      const hours = clampVolumeHours(volumeHours);
      await saveAvailability(buildAvailabilityDays(days, sports));

      const startIso = planDateIsoNoon(startYmd);
      const result = await initializePlan({
        goalId: selectedGoalId,
        startDate: startIso,
        endDate: planEndDateIso(endYmd),
        volumeHours: hours,
        volumePreference: volumePreferenceFromHours(hours),
        preferredActivityTypes: sports,
        strategy,
        recoveryRhythm,
        startingPhase,
        ...(customInstructions.trim() ? { customInstructions: customInstructions.trim() } : {}),
      });
      setPlanId(result.planId);
      setActivateStartIso(startIso);
      setPhases(mapPhaseGlance(result.plan?.blocks));
      const week = await generateFirstWeekPreview(result, { signal: controller.signal });
      setPreview(week);
      setPhase('preview');
      setGenerateStartedAt(null);
      hapticSuccess();
    } catch (err) {
      // An abort means someone else (cancel, or a superseding generate) now owns
      // the UI state. If no such owner exists, fall through and reset — the
      // 'working' phase has no exit of its own and must never be stranded.
      if (controller.signal.aborted && generateAbortRef.current !== controller) return;
      setPhase('form');
      setFormStep('approach');
      setGenerateStartedAt(null);
      setError(friendlyError(err, 'Could not generate plan'));
      hapticError();
    } finally {
      if (generateAbortRef.current === controller) {
        generateAbortRef.current = null;
        setBusy(false);
      }
    }
  };

  /** The only way out of the working phase for the athlete — see the panel below. */
  const onCancelGenerate = () => {
    hapticLight();
    const controller = generateAbortRef.current;
    generateAbortRef.current = null;
    controller?.abort();
    setBusy(false);
    setGenerateStartedAt(null);
    setError(null);
    setPhase('form');
    setFormStep('approach');
  };

  const onActivate = async () => {
    if (!planId) return;
    setLastAction('activate');
    setBusy(true);
    setError(null);
    try {
      await activatePlan(planId, activateStartIso ?? undefined);
      hapticSuccess();
      await onActivated(planId);
    } catch (err) {
      setError(friendlyError(err, 'Could not activate plan'));
      hapticError();
    } finally {
      setBusy(false);
    }
  };

  const onRetry = () => {
    hapticLight();
    if (lastAction === 'activate') {
      void onActivate();
      return;
    }
    void onGenerate();
  };

  const goalsLoading = goalsQuery.isLoading && goals.length === 0;

  return (
    <View testID="plan-generator" className="gap-4">
      {error ? (
        <View className="rounded-xl border border-danger/40 bg-tint-error p-3">
          <Text className="text-sm text-danger">{error}</Text>
          {lastAction ? (
            <AnimatedPressable
              hitSlop={8}
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              className="mt-2 self-start"
              testID="plan-generator-retry"
            >
              <Text className="text-sm font-semibold text-brand">Retry</Text>
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}

      {phase === 'working'
        ? (() => {
            const progress = formatGenerateProgress(generateElapsedMs);
            return (
              <View className="gap-3 py-2" testID="plan-generator-working">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="shrink text-sm text-text-primary">
                    Generating your first week…
                  </Text>
                  <Text
                    className="text-sm text-text-muted"
                    accessibilityLabel={`Elapsed ${progress.elapsedLabel}`}
                  >
                    {progress.elapsedLabel}
                  </Text>
                </View>
                <Text className="text-sm text-text-muted">{progress.hint}</Text>
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Button
                  label="Cancel and go back"
                  variant="secondary"
                  onPress={onCancelGenerate}
                  haptic={false}
                  testID="plan-generator-cancel"
                />
              </View>
            );
          })()
        : null}

      {phase === 'form' && formStep === 'goal' ? (
        <>
          <StepMeta step="goal" />
          <View>
            <Text className="mb-1 text-base font-semibold text-text-primary">Goal</Text>
            <Text className="mb-3 text-sm text-text-muted">
              Which goal should this plan train toward?
            </Text>
            {goalsLoading ? (
              <Skeleton className="h-16 rounded-xl" />
            ) : goals.length === 0 ? (
              <View className="gap-3">
                <Text className="text-sm text-text-muted">
                  Create a goal with a target date, then return here to generate.
                </Text>
                {onCreateGoal ? (
                  <Button
                    label="Create goal"
                    onPress={() => {
                      hapticLight();
                      onCreateGoal();
                    }}
                    testID="plan-generator-create-goal"
                  />
                ) : null}
              </View>
            ) : (
              <View className="gap-2">
                {goals.map((g) => {
                  const selected = g.id === selectedGoalId;
                  return (
                    <AnimatedPressable
                      key={g.id}
                      testID={`plan-generator-goal-${g.id}`}
                      onPress={() => {
                        hapticLight();
                        setSelectedGoalIdOverride(g.id);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`rounded-xl border px-3 py-3 ${
                        selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          selected ? 'text-brand' : 'text-text-primary'
                        }`}
                      >
                        {g.title}
                      </Text>
                      <Text className="mt-0.5 text-xs text-text-muted">
                        {[g.typeLabel, g.targetDateLabel, g.priorityLabel]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
                {onCreateGoal ? (
                  <AnimatedPressable
                    hitSlop={8}
                    onPress={() => {
                      hapticLight();
                      onCreateGoal();
                    }}
                    accessibilityRole="button"
                    className="self-start py-1"
                    testID="plan-generator-create-goal"
                  >
                    <Text className="text-sm font-semibold text-brand">Create another goal</Text>
                  </AnimatedPressable>
                ) : null}
              </View>
            )}
          </View>
          <Button
            label="Continue"
            onPress={() => {
              hapticLight();
              setFormStep('days');
            }}
            disabled={!selectedGoalId}
            testID="plan-generator-continue-days"
          />
        </>
      ) : null}

      {phase === 'form' && formStep === 'days' ? (
        <>
          <BackLink
            label="Goal"
            testID="plan-generator-back-goal"
            onPress={() => {
              hapticLight();
              setFormStep('goal');
            }}
          />
          <StepMeta step="days" />
          <View>
            <Text className="mb-1 text-base font-semibold text-text-primary">Training days</Text>
            <Text className="mb-3 text-sm text-text-muted">Which days can you train?</Text>
            <View className="flex-row flex-wrap gap-2">
              {DAY_LABELS.map((label, index) => {
                const selected = days.includes(index);
                return (
                  <AnimatedPressable
                    key={label}
                    testID={`plan-generator-day-${index}`}
                    onPress={() => toggleDay(index)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`rounded-xl border px-3 py-1.5 ${
                      selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        selected ? 'text-brand' : 'text-text-muted'
                      }`}
                    >
                      {label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>
          <Button
            label="Continue"
            onPress={() => {
              hapticLight();
              setFormStep('volume');
            }}
            disabled={days.length === 0}
            testID="plan-generator-continue-volume"
          />
        </>
      ) : null}

      {phase === 'form' && formStep === 'volume' ? (
        <>
          <BackLink
            label="Training days"
            testID="plan-generator-back-days"
            onPress={() => {
              hapticLight();
              setFormStep('days');
            }}
          />
          <StepMeta step="volume" />
          <View>
            <Text className="mb-1 text-base font-semibold text-text-primary">Weekly volume</Text>
            <Text className="mb-3 text-sm text-text-muted">
              About {volumeHours} hours/week · {volumeBand}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {VOLUME_HOUR_CHIPS.map((h) => {
                const selected = volumeHours === h;
                return (
                  <AnimatedPressable
                    key={h}
                    testID={`plan-generator-volume-${h}`}
                    onPress={() => {
                      hapticLight();
                      setVolumeHours(h);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`rounded-xl border px-3 py-2 ${
                      selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        selected ? 'text-brand' : 'text-text-primary'
                      }`}
                    >
                      {h}h
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>
          <Button
            label="Continue"
            onPress={() => {
              hapticLight();
              setFormStep('sports');
            }}
            testID="plan-generator-continue-sports"
          />
        </>
      ) : null}

      {phase === 'form' && formStep === 'sports' ? (
        <>
          <BackLink
            label="Weekly volume"
            testID="plan-generator-back-volume"
            onPress={() => {
              hapticLight();
              setFormStep('volume');
            }}
          />
          <StepMeta step="sports" />
          <View>
            <Text className="mb-1 text-base font-semibold text-text-primary">Sports</Text>
            <Text className="mb-3 text-sm text-text-muted">What should this plan train?</Text>
            <View className="flex-row flex-wrap gap-2">
              {SPORTS.map((s) => {
                const selected = sports.includes(s.id);
                return (
                  <AnimatedPressable
                    key={s.id}
                    testID={`plan-generator-sport-${s.id}`}
                    onPress={() => toggleSport(s.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`rounded-xl border px-3 py-1.5 ${
                      selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        selected ? 'text-brand' : 'text-text-muted'
                      }`}
                    >
                      {s.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>
          <Button
            label="Continue"
            onPress={() => {
              hapticLight();
              setFormStep('timeline');
            }}
            disabled={sports.length === 0}
            testID="plan-generator-continue-timeline"
          />
        </>
      ) : null}

      {phase === 'form' && formStep === 'timeline' ? (
        <>
          <BackLink
            label="Sports"
            testID="plan-generator-back-sports"
            onPress={() => {
              hapticLight();
              setFormStep('sports');
            }}
          />
          <StepMeta step="timeline" />
          <View>
            <Text className="mb-1 text-base font-semibold text-text-primary">Season timeline</Text>
            <Text className="mb-3 text-sm text-text-muted">
              When should this plan start and end?
            </Text>
            <Text className="mb-2 text-sm font-medium text-text-muted">Start</Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {(
                [
                  { id: todayYmd, label: 'Today' },
                  { id: mondayYmd, label: 'Next Monday' },
                ] as const
              ).map((opt) => {
                const selected = startYmd === opt.id;
                return (
                  <AnimatedPressable
                    key={opt.label}
                    testID={`plan-start-${opt.label === 'Today' ? 'today' : 'monday'}`}
                    onPress={() => {
                      hapticLight();
                      setStartYmd(opt.id);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`rounded-xl border px-3 py-2 ${
                      selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        selected ? 'text-brand' : 'text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
            <Text className="mb-1 text-xs text-text-muted">
              Starts {formatDayChipLabel(startYmd)}
            </Text>

            <Text className="mb-2 mt-3 text-sm font-medium text-text-muted">End</Text>
            <View className="mb-2 flex-row flex-wrap gap-2">
              <AnimatedPressable
                testID="plan-end-mode-goal"
                onPress={() => {
                  hapticLight();
                  setPreferDurationEnd(false);
                }}
                disabled={!selectedGoal?.planEndDateKey}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{
                  selected: endMode === 'goal',
                  disabled: !selectedGoal?.planEndDateKey,
                }}
                className={`rounded-xl border px-3 py-2 ${
                  endMode === 'goal' ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                } ${!selectedGoal?.planEndDateKey ? 'opacity-40' : ''}`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    endMode === 'goal' ? 'text-brand' : 'text-text-primary'
                  }`}
                >
                  From goal
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                testID="plan-end-mode-duration"
                onPress={() => {
                  hapticLight();
                  setPreferDurationEnd(true);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: endMode === 'duration' }}
                className={`rounded-xl border px-3 py-2 ${
                  endMode === 'duration' ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    endMode === 'duration' ? 'text-brand' : 'text-text-primary'
                  }`}
                >
                  Duration
                </Text>
              </AnimatedPressable>
            </View>
            {endMode === 'duration' ? (
              <View className="mb-2 flex-row flex-wrap gap-2">
                {DURATION_WEEK_CHIPS.map((w) => {
                  const selected = durationWeeks === w;
                  return (
                    <AnimatedPressable
                      key={w}
                      testID={`plan-duration-${w}`}
                      onPress={() => {
                        hapticLight();
                        setDurationWeeks(clampDurationWeeks(w));
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`rounded-xl border px-3 py-2 ${
                        selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          selected ? 'text-brand' : 'text-text-primary'
                        }`}
                      >
                        {w} wk
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
            ) : null}
            {endYmd && endReady ? (
              <Text className="text-xs text-text-muted">
                Ends {formatDayChipLabel(endYmd)}
                {selectedGoal ? ` · ${selectedGoal.title}` : ''}
              </Text>
            ) : (
              <Text className="text-xs text-danger">
                {selectedGoal?.planEndDateKey
                  ? 'Season must be at least 4 weeks. Switch to Duration or pick a later goal.'
                  : 'This goal has no target date — choose a duration of at least 4 weeks.'}
              </Text>
            )}
          </View>
          <Button
            label="Continue"
            onPress={() => {
              hapticLight();
              setFormStep('approach');
            }}
            disabled={!endReady}
            testID="plan-generator-continue-approach"
          />
        </>
      ) : null}

      {phase === 'form' && formStep === 'approach' ? (
        <>
          <BackLink
            label="Season timeline"
            testID="plan-generator-back-timeline"
            onPress={() => {
              hapticLight();
              setFormStep('timeline');
            }}
          />
          <StepMeta step="approach" />

          <View>
            <View className="mb-2 flex-row items-center justify-between gap-2">
              <Text className="text-base font-semibold text-text-primary">Training approach</Text>
              <AnimatedPressable
                hitSlop={8}
                onPress={() => {
                  hapticLight();
                  const eventBased = endMode === 'goal' && Boolean(selectedGoal?.planEndDateKey);
                  const weeksToGoal =
                    eventBased && endYmd ? weeksBetweenYmd(startYmd, endYmd) : null;
                  const pick = recommendStrategy({
                    volumeHours,
                    eventBased,
                    weeksToGoal,
                  });
                  setStrategy(pick.strategy);
                  setStrategyRationale(pick.rationale);
                }}
                accessibilityRole="button"
                accessibilityLabel="Help me choose training approach"
                testID="plan-strategy-help"
              >
                <Text className="text-sm font-semibold text-brand">Help me choose</Text>
              </AnimatedPressable>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {PLAN_STRATEGY_OPTIONS.map((opt) => {
                const selected = strategy === opt.id;
                const accent = selected ? theme.brandOnSurface : theme.textMuted;
                return (
                  <AnimatedPressable
                    key={opt.id}
                    testID={`plan-strategy-${opt.id}`}
                    onPress={() => {
                      hapticLight();
                      setStrategy(opt.id);
                      setStrategyRationale(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityHint={opt.description}
                    className={`w-[48%] rounded-xl border px-3 py-3 ${
                      selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                    }`}
                  >
                    <Text
                      className={`mb-1 text-sm font-semibold ${
                        selected ? 'text-brand' : 'text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </Text>
                    <View className="mb-2 opacity-80">
                      <StrategySparkline strategy={opt.id} color={accent} width={112} height={26} />
                    </View>
                    <Text className="text-xs leading-snug text-text-muted">{opt.description}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>
            {strategyRationale ? (
              <View
                className="mt-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2"
                testID="plan-strategy-rationale"
              >
                <Text className="text-xs leading-snug text-brand">{strategyRationale}</Text>
              </View>
            ) : null}
          </View>

          <View>
            <Text className="mb-1 text-base font-semibold text-text-primary">Recovery cycle</Text>
            <Text className="mb-3 text-sm text-text-muted">How often do you need a rest week?</Text>
            <View className="gap-2">
              {RECOVERY_RHYTHM_OPTIONS.map((opt) => {
                const selected = recoveryRhythm === opt.id;
                return (
                  <AnimatedPressable
                    key={opt.id}
                    testID={`plan-recovery-${opt.id}`}
                    onPress={() => {
                      hapticLight();
                      setRecoveryRhythm(opt.id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityHint={opt.description}
                    className={`flex-row items-start gap-3 rounded-xl border px-3 py-3 ${
                      selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
                    }`}
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-lg border border-border bg-card">
                      <Text
                        className={`text-base font-black ${
                          selected ? 'text-brand' : 'text-text-primary'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text
                        className={`text-sm font-semibold ${
                          selected ? 'text-brand' : 'text-text-primary'
                        }`}
                      >
                        {opt.title}
                      </Text>
                      <Text className="mt-0.5 text-xs leading-snug text-text-muted">
                        {opt.description}
                      </Text>
                    </View>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text className="mb-1 text-base font-semibold text-text-primary">Starting point</Text>
            <Text className="mb-3 text-sm text-text-muted">
              How ready are you as the season begins?
            </Text>
            <ChipRow
              options={STARTING_PHASE_OPTIONS}
              value={startingPhase}
              onChange={setStartingPhase}
              testIDPrefix="plan-phase"
            />
          </View>

          <View>
            <Text className="mb-2 text-sm font-medium text-text-muted">
              Anything else? (optional)
            </Text>
            <TextInput
              className="min-h-[72px] rounded-xl border border-border-strong bg-card px-3 py-2 text-text-primary"
              multiline
              value={customInstructions}
              onChangeText={setCustomInstructions}
              placeholder="e.g. Keep Tuesdays easy, race in October"
              placeholderTextColor={theme.textMuted}
              testID="plan-generator-instructions"
            />
          </View>

          <Button
            label="Generate plan"
            onPress={() => void onGenerate()}
            loading={busy}
            disabled={!canGenerate || busy}
            testID="plan-generator-generate"
          />
        </>
      ) : null}

      {phase === 'preview' ? (
        <View className="gap-3">
          <Text className="text-base font-semibold text-text-primary">Review your plan</Text>
          <Text className="text-sm text-text-muted">
            Check the season phases and first week, then activate. The plan may improve after you
            connect data.
          </Text>

          {phases.length > 0 ? (
            <View className="gap-2">
              <Text className="text-sm font-semibold text-text-primary">Season phases</Text>
              {phases.map((p) => {
                const accent = blockTypeColor(p.type);
                return (
                  <View
                    key={p.id}
                    className="rounded-xl border border-border bg-card/70 px-3 py-2.5"
                    testID={`plan-preview-phase-${p.id}`}
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <View className="min-w-0 flex-1 flex-row items-center gap-2">
                        <View
                          accessibilityLabel={p.type ? `${p.type} phase` : 'Phase'}
                          style={{ backgroundColor: accent }}
                          className="h-2.5 w-2.5 rounded-sm"
                        />
                        <Text className="flex-1 text-sm font-semibold text-text-primary">
                          {p.title}
                        </Text>
                      </View>
                      <Text className="text-xs text-text-muted">{p.weeksLabel}</Text>
                    </View>
                    {p.rangeLabel ? (
                      <Text className="mt-0.5 text-xs text-text-muted">{p.rangeLabel}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text className="text-sm font-semibold text-text-primary">First week</Text>
          {preview.length === 0 ? (
            <Text className="text-sm text-text-muted">
              No sessions in the preview yet. You can still activate and generate weeks on Plan.
            </Text>
          ) : (
            preview.map((w, i) => {
              const dateKey = w.date?.slice?.(0, 10);
              return (
                <View
                  key={w.id ?? `${w.title}-${i}`}
                  testID={`plan-preview-workout-${w.id ?? i}`}
                  className="rounded-xl border border-border bg-card/70 px-3 py-2.5"
                >
                  <View className="flex-row items-center gap-2">
                    <SportIcon type={w.type} size={14} />
                    <Text className="flex-1 text-sm font-semibold text-text-primary">
                      {w.title || 'Workout'}
                    </Text>
                  </View>
                  <Text className="mt-0.5 text-xs text-text-muted">
                    {[
                      w.type,
                      dateKey ? formatDayChipLabel(dateKey) : null,
                      w.duration != null ? `${w.duration} min` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              );
            })
          )}
          <Button
            label="Activate plan"
            onPress={() => void onActivate()}
            loading={busy}
            disabled={busy}
            testID="plan-generator-activate"
          />
          <Button
            label="Back to edit"
            variant="secondary"
            testID="plan-generator-back-edit"
            onPress={() => {
              hapticLight();
              setPhase('form');
              setFormStep('approach');
            }}
            disabled={busy}
          />
        </View>
      ) : null}
    </View>
  );
}
