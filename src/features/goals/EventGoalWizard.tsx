/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app
 * Web EventGoalWizard parity: type → events (EVENT) → configure → POST /api/goals
 */
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { AppSymbol, type MappedSFSymbol } from '@/src/components/AppSymbol';
import { Button } from '@/src/components/Button';
import { DateYmdField } from '@/src/components/DateYmdField';
import { Skeleton } from '@/src/components/Skeleton';
import { useEventsListQuery } from '@/src/features/events/useEvents';
import { localDateYmd } from '@/src/lib/date';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { useThemeColors } from '@/src/theme/useThemeColors';

import {
  applyPrimaryEventToForm,
  buildEventGoalWizardInput,
  CONSISTENCY_METRICS,
  emptyEventGoalWizardForm,
  EVENT_SUBTYPES,
  GOAL_TYPE_OPTIONS,
  mapApiEventForWizard,
  PERFORMANCE_METRICS,
  PRIORITY_OPTIONS,
  sortEventsForGoalWizard,
  toggleEventId,
  validateEventGoalWizardForm,
  type EventGoalWizardForm,
} from './eventGoalWizardModel';
import type { GoalApi, GoalType } from './types';
import { useCreateGoalMutation } from './useGoals';

type Step = 'type' | 'events' | 'configure';

type Props = {
  testID?: string;
  /** Called after successful create (host navigates). */
  onCreated: (goal: GoalApi) => void | Promise<void>;
  /**
   * Create-event action for empty EVENT list.
   * `undefined` → default to Events → New.
   * `null` → hide button (e.g. activation, before app shell is open).
   */
  onCreateEvent?: (() => void) | null;
};

const TYPE_ICONS: Record<GoalType, MappedSFSymbol> = {
  EVENT: 'calendar',
  BODY_COMPOSITION: 'ruler',
  PERFORMANCE: 'bolt.fill',
  CONSISTENCY: 'arrow.triangle.2.circlepath',
};

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-xl border px-3 py-2 ${
        selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
      }`}
    >
      <Text className={`text-sm font-semibold ${selected ? 'text-brand' : 'text-text-primary'}`}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function EventGoalWizard({ testID = 'event-goal-wizard', onCreated, onCreateEvent }: Props) {
  const theme = useThemeColors();
  const createGoal = useCreateGoalMutation();
  const [step, setStep] = useState<Step>('type');
  const [form, setForm] = useState<EventGoalWizardForm>(() => emptyEventGoalWizardForm());
  const [error, setError] = useState<string | null>(null);

  const eventsQuery = useEventsListQuery({ enabled: form.type === 'EVENT' || step === 'events' });
  const { refetch: refetchEvents } = eventsQuery;
  const todayKey = localDateYmd();
  /** Activation cannot open Events → New; allow title/date stub when calendar is empty. */
  const allowEventDataStub = onCreateEvent === null;

  const selectableEvents = useMemo(() => {
    const raw = eventsQuery.data ?? [];
    const mapped = raw
      .map(mapApiEventForWizard)
      .filter((e): e is NonNullable<typeof e> => e != null);
    return sortEventsForGoalWizard(mapped, todayKey);
  }, [eventsQuery.data, todayKey]);

  useEffect(() => {
    if (step === 'events') void refetchEvents();
  }, [step, refetchEvents]);

  const patchForm = (partial: Partial<EventGoalWizardForm>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const pickType = (type: GoalType) => {
    hapticLight();
    setError(null);
    const next = emptyEventGoalWizardForm(type);
    setForm(next);
    if (type === 'EVENT') {
      setStep('events');
    } else {
      setStep('configure');
    }
  };

  const onToggleEvent = (id: string) => {
    hapticLight();
    setForm((prev) => {
      const eventIds = toggleEventId(prev.eventIds, id);
      return applyPrimaryEventToForm(prev, selectableEvents, eventIds);
    });
  };

  const continueFromEvents = () => {
    hapticLight();
    setError(null);
    setStep('configure');
  };

  const onSubmit = async () => {
    const validation = validateEventGoalWizardForm(form, { allowEventDataStub });
    if (validation) {
      hapticError();
      setError(validation);
      return;
    }
    setError(null);
    try {
      const goal = await createGoal.mutateAsync(buildEventGoalWizardInput(form, selectableEvents));
      hapticSuccess();
      await onCreated(goal);
    } catch (err) {
      hapticError();
      setError(friendlyError(err, 'Could not create goal'));
    }
  };

  return (
    <View testID={testID} className="gap-4">
      {error ? (
        <View className="rounded-xl border border-danger/40 bg-tint-error p-3">
          <Text className="text-sm text-danger">{error}</Text>
        </View>
      ) : null}

      {step === 'type' ? (
        <>
          <Text className="text-base font-semibold text-text-primary">
            What are you training for?
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {GOAL_TYPE_OPTIONS.map((opt) => (
              <AnimatedPressable
                key={opt.id}
                testID={`goal-wizard-type-${opt.id}`}
                onPress={() => pickType(opt.id)}
                accessibilityRole="button"
                className="w-[48%] rounded-xl border border-border bg-card/70 p-3"
              >
                <View className="mb-2 h-9 w-9 items-center justify-center rounded-lg border border-border bg-card">
                  <AppSymbol sf={TYPE_ICONS[opt.id]} size={18} tintColor={theme.brandOnSurface} />
                </View>
                <Text className="text-sm font-semibold text-text-primary">{opt.label}</Text>
                <Text className="mt-1 text-xs leading-snug text-text-muted">{opt.description}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </>
      ) : null}

      {step === 'events' ? (
        <>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => {
              hapticLight();
              setStep('type');
            }}
            accessibilityRole="button"
            className="self-start"
            testID="goal-wizard-back-type"
          >
            <Text className="text-sm font-semibold text-brand">← Goal type</Text>
          </AnimatedPressable>
          <Text className="text-base font-semibold text-text-primary">
            Select your target event
          </Text>
          <Text className="text-sm text-text-muted">
            Choose one or more upcoming events. The last selected becomes the primary date.
          </Text>

          {eventsQuery.isLoading && selectableEvents.length === 0 ? (
            <View className="gap-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </View>
          ) : null}

          {eventsQuery.isError && selectableEvents.length === 0 && !eventsQuery.isLoading ? (
            <View
              testID="goal-wizard-events-error"
              className="gap-3 rounded-xl border border-danger/40 bg-tint-error p-4"
            >
              <Text className="text-sm text-danger">
                {friendlyError(eventsQuery.error, 'Could not load events')}
              </Text>
              <Button
                label="Retry"
                variant="secondary"
                testID="goal-wizard-events-retry"
                onPress={() => {
                  hapticLight();
                  void refetchEvents();
                }}
              />
            </View>
          ) : null}

          {!eventsQuery.isError && selectableEvents.length === 0 && !eventsQuery.isLoading ? (
            <View className="gap-3 rounded-xl border border-border bg-card/60 p-4">
              <Text className="text-sm text-text-muted">
                {allowEventDataStub
                  ? 'No calendar events yet. Continue with a race date and title — we’ll create the linked event with your goal. You can attach a real race later from Goals.'
                  : 'No events yet. Create a race or life event first, then return here.'}
              </Text>
              {allowEventDataStub ? (
                <Button
                  label="Continue with race date"
                  testID="goal-wizard-continue-stub"
                  onPress={continueFromEvents}
                />
              ) : null}
              {onCreateEvent !== null ? (
                <Button
                  label="Create event"
                  testID="goal-wizard-create-event"
                  onPress={() => {
                    hapticLight();
                    if (onCreateEvent) onCreateEvent();
                    else router.push(APP_HREFS.eventsNew as Href);
                  }}
                />
              ) : null}
            </View>
          ) : null}

          {selectableEvents.length > 0 ? (
            <View className="gap-2">
              {selectableEvents.map((ev) => {
                const selected = form.eventIds.includes(ev.id);
                return (
                  <AnimatedPressable
                    key={ev.id}
                    testID={`goal-wizard-event-${ev.id}`}
                    onPress={() => onToggleEvent(ev.id)}
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
                      {ev.title}
                    </Text>
                    <Text className="mt-0.5 text-xs text-text-muted">
                      {[ev.dateKey, ev.subType || ev.type].filter(Boolean).join(' · ')}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          ) : null}

          {selectableEvents.length > 0 ? (
            <Button
              label="Continue"
              testID="goal-wizard-continue-configure"
              disabled={form.eventIds.length === 0}
              onPress={continueFromEvents}
            />
          ) : null}
        </>
      ) : null}

      {step === 'configure' ? (
        <>
          <AnimatedPressable
            hitSlop={8}
            onPress={() => {
              hapticLight();
              setStep(form.type === 'EVENT' ? 'events' : 'type');
            }}
            accessibilityRole="button"
            className="self-start"
            testID="goal-wizard-back-configure"
          >
            <Text className="text-sm font-semibold text-brand">
              ← {form.type === 'EVENT' ? 'Events' : 'Goal type'}
            </Text>
          </AnimatedPressable>

          <Text className="text-base font-semibold text-text-primary">
            Configure {GOAL_TYPE_OPTIONS.find((t) => t.id === form.type)?.label ?? 'goal'}
          </Text>

          <View>
            <Text className="mb-2 text-sm font-medium text-text-muted">Goal title</Text>
            <TextInput
              testID="goal-wizard-title"
              className="rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
              placeholder="e.g. Sub-4 Hour Marathon or Lose 5kg"
              placeholderTextColor={theme.textMuted}
              value={form.title}
              onChangeText={(title) => patchForm({ title })}
            />
            <Text className="mt-1.5 text-xs text-text-muted">
              Make the title descriptive so coaching context stays clear.
            </Text>
          </View>

          <DateYmdField
            label="Goal deadline"
            value={form.targetDate}
            onChange={(targetDate) => patchForm({ targetDate })}
            testID="goal-wizard-target-date"
          />

          <View>
            <Text className="mb-2 text-sm font-medium text-text-muted">Priority</Text>
            <View className="flex-row flex-wrap gap-2">
              {PRIORITY_OPTIONS.map((p) => (
                <Chip
                  key={p.id}
                  label={p.label}
                  selected={form.priority === p.id}
                  testID={`goal-wizard-priority-${p.id}`}
                  onPress={() => {
                    hapticLight();
                    patchForm({ priority: p.id });
                  }}
                />
              ))}
            </View>
          </View>

          {form.type === 'EVENT' ? (
            <View>
              <Text className="mb-2 text-sm font-medium text-text-muted">Race type</Text>
              <View className="flex-row flex-wrap gap-2">
                {EVENT_SUBTYPES.map((sub) => (
                  <Chip
                    key={sub}
                    label={sub}
                    selected={form.eventType === sub}
                    testID={`goal-wizard-event-type-${sub.replace(/\W+/g, '-')}`}
                    onPress={() => {
                      hapticLight();
                      patchForm({ eventType: sub });
                    }}
                  />
                ))}
              </View>
              {form.eventIds.length > 0 ? (
                <Text className="mt-2 text-xs text-text-muted">
                  Linked: {form.eventIds.length} event{form.eventIds.length === 1 ? '' : 's'}
                </Text>
              ) : allowEventDataStub ? (
                <Text className="mt-2 text-xs text-text-muted">
                  No calendar event linked yet — we’ll create one from this title and date.
                </Text>
              ) : null}
            </View>
          ) : null}

          {form.type === 'BODY_COMPOSITION' ? (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-2 text-sm font-medium text-text-muted">Start weight (kg)</Text>
                <TextInput
                  testID="goal-wizard-start-value"
                  className="rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
                  keyboardType="decimal-pad"
                  value={form.startValue}
                  onChangeText={(startValue) => patchForm({ startValue })}
                  placeholder="75"
                  placeholderTextColor={theme.textMuted}
                />
              </View>
              <View className="flex-1">
                <Text className="mb-2 text-sm font-medium text-text-muted">Target weight (kg)</Text>
                <TextInput
                  testID="goal-wizard-target-value"
                  className="rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
                  keyboardType="decimal-pad"
                  value={form.targetValue}
                  onChangeText={(targetValue) => patchForm({ targetValue })}
                  placeholder="70"
                  placeholderTextColor={theme.textMuted}
                />
              </View>
            </View>
          ) : null}

          {form.type === 'PERFORMANCE' ? (
            <>
              <View>
                <Text className="mb-2 text-sm font-medium text-text-muted">Metric</Text>
                <View className="flex-row flex-wrap gap-2">
                  {PERFORMANCE_METRICS.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      selected={form.metric === m}
                      testID={`goal-wizard-metric-${m.replace(/\W+/g, '-')}`}
                      onPress={() => {
                        hapticLight();
                        patchForm({ metric: m });
                      }}
                    />
                  ))}
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-2 text-sm font-medium text-text-muted">Start</Text>
                  <TextInput
                    testID="goal-wizard-start-value"
                    className="rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
                    keyboardType="decimal-pad"
                    value={form.startValue}
                    onChangeText={(startValue) => patchForm({ startValue })}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-2 text-sm font-medium text-text-muted">Target</Text>
                  <TextInput
                    testID="goal-wizard-target-value"
                    className="rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
                    keyboardType="decimal-pad"
                    value={form.targetValue}
                    onChangeText={(targetValue) => patchForm({ targetValue })}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>
            </>
          ) : null}

          {form.type === 'CONSISTENCY' ? (
            <>
              <View>
                <Text className="mb-2 text-sm font-medium text-text-muted">Weekly commitment</Text>
                <View className="flex-row flex-wrap gap-2">
                  {CONSISTENCY_METRICS.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      selected={form.metric === m}
                      testID={`goal-wizard-metric-${m}`}
                      onPress={() => {
                        hapticLight();
                        patchForm({ metric: m });
                      }}
                    />
                  ))}
                </View>
              </View>
              <View>
                <Text className="mb-2 text-sm font-medium text-text-muted">Target per week</Text>
                <TextInput
                  testID="goal-wizard-target-value"
                  className="rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
                  keyboardType="decimal-pad"
                  value={form.targetValue}
                  onChangeText={(targetValue) => patchForm({ targetValue })}
                  placeholder="e.g. 8"
                  placeholderTextColor={theme.textMuted}
                />
                <Text className="mt-1.5 text-xs text-text-muted">
                  This sets a habit target date for building and holding this level.
                </Text>
              </View>
            </>
          ) : null}

          <View>
            <Text className="mb-2 text-sm font-medium text-text-muted">
              Notes & motivation (optional)
            </Text>
            <TextInput
              testID="goal-wizard-notes"
              className="min-h-[88px] rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
              multiline
              textAlignVertical="top"
              placeholder="Add why this goal matters…"
              placeholderTextColor={theme.textMuted}
              value={form.description}
              onChangeText={(description) => patchForm({ description })}
            />
          </View>

          <Button
            label="Create goal"
            testID="goal-wizard-submit"
            loading={createGoal.isPending}
            disabled={createGoal.isPending}
            onPress={() => void onSubmit()}
          />
        </>
      ) : null}
    </View>
  );
}
