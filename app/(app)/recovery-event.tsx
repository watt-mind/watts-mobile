/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { friendlyError } from '@/src/api/errors';
import { Button } from '@/src/components/Button';
import { Spinner } from '@/src/components/Spinner';
import { AppSymbol } from '@/src/components/AppSymbol';
import {
  applyTimePreset,
  emptyRecoveryEventForm,
  eventTypeBadgeLabel,
  formFromRecoveryItem,
  isDescriptionValid,
  isLocalTimestampValid,
  toJourneyPayload,
} from '@/src/features/recovery/mapRecovery';
import {
  DESCRIPTION_MAX,
  JOURNEY_EVENT_OPTIONS,
  SEVERITY_PRESETS,
  optionById,
} from '@/src/features/recovery/taxonomy';
import {
  useCreateJourneyEvent,
  useDeleteJourneyEvent,
  useRecoveryContextQuery,
  useUpdateJourneyEvent,
} from '@/src/features/recovery/useRecovery';
import type {
  JourneyEventOptionId,
  RecoveryEventFormValues,
  SeverityPresetId,
  TimePresetId,
} from '@/src/features/recovery/types';
import { useKeyboardOverlap } from '@/src/hooks/useKeyboardOverlap';
import { hapticLight } from '@/src/lib/haptics';
import { Colors } from '@/src/theme/colors';
import { useThemeColors } from '@/src/theme/useThemeColors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TIME_PRESETS: { id: TimePresetId; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'earlier-today', label: 'Earlier today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'custom', label: 'Custom' },
];

const LIST_LAYOUT = {
  duration: 240,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

function selectStyles(theme: ReturnType<typeof useThemeColors>) {
  return {
    active: {
      borderColor: Colors.brand,
      backgroundColor: 'rgba(0, 220, 130, 0.1)',
    } as const,
    idle: {
      borderColor: theme.border,
      backgroundColor: `${theme.card}99`,
    } as const,
  };
}

function OptionGlyph({
  sf,
  active,
  size = 'md',
}: {
  sf: SFSymbol;
  active?: boolean;
  size?: 'sm' | 'md';
}) {
  const theme = useThemeColors();
  const tint = active ? Colors.brand : theme.textMuted;
  const icon = size === 'sm' ? 15 : 17;
  return (
    <View className="mr-3 h-5 w-5 items-center justify-center">
      {/* A mapped glyph always wins; the dot only shows if one ever goes
          unmapped, so the option still reads as a row rather than a blank box.
          `appSymbolCoverage.test.ts` guards `taxonomy.ts`, which feeds `sf`. */}
      <AppSymbol sf={sf} size={icon} tintColor={tint} fallback="•" />
    </View>
  );
}

function animateList() {
  LayoutAnimation.configureNext(LIST_LAYOUT);
}

export default function RecoveryEventScreen() {
  const theme = useThemeColors();
  const { active: activeSelectStyle, idle: idleSelectStyle } = selectStyles(theme);

  const params = useLocalSearchParams<{ id?: string }>();
  const sourceRecordId =
    typeof params.id === 'string' && params.id && params.id !== 'undefined' ? params.id : undefined;
  const isEdit = Boolean(sourceRecordId);

  const { data: recoveryItems, isLoading } = useRecoveryContextQuery();
  const createMutation = useCreateJourneyEvent();
  const updateMutation = useUpdateJourneyEvent();
  const deleteMutation = useDeleteJourneyEvent();

  const existing = useMemo(
    () => recoveryItems?.find((item) => item.sourceRecordId === sourceRecordId) ?? null,
    [recoveryItems, sourceRecordId],
  );

  const { containerRef, overlap } = useKeyboardOverlap();
  // Seed from cache when present so edit does not flash empty defaults.
  const [values, setValues] = useState<RecoveryEventFormValues>(() =>
    existing ? formFromRecoveryItem(existing) : emptyRecoveryEventForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(() => !isEdit || Boolean(existing));
  /** Full option list with subtitles — create starts open; edit starts settled. */
  const [browsingOptions, setBrowsingOptions] = useState(!isEdit);
  /** After first pick (or edit hydrate), severity / when / notes unlock. */
  const [detailsUnlocked, setDetailsUnlocked] = useState(isEdit);
  const lastHydratedKeyRef = useRef<string | null>(
    isEdit && existing ? existing.id : isEdit ? null : 'create',
  );

  useEffect(() => {
    if (!isEdit) {
      if (lastHydratedKeyRef.current === 'create') return;
      lastHydratedKeyRef.current = 'create';
      setValues(emptyRecoveryEventForm());
      setBrowsingOptions(true);
      setDetailsUnlocked(false);
      setHydrated(true);
      return;
    }

    if (!existing) return;
    if (lastHydratedKeyRef.current === existing.id) return;
    lastHydratedKeyRef.current = existing.id;
    setValues(formFromRecoveryItem(existing));
    setBrowsingOptions(false);
    setDetailsUnlocked(true);
    setHydrated(true);
  }, [isEdit, existing]);

  const selectedOption = optionById(values.optionId);
  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const canSave =
    isDescriptionValid(values.description) &&
    isLocalTimestampValid(values.localTimestamp) &&
    !pending;

  const patch = <K extends keyof RecoveryEventFormValues>(
    key: K,
    value: RecoveryEventFormValues[K],
  ) => {
    setError(null);
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const onSelectOption = (id: JourneyEventOptionId) => {
    hapticLight();
    animateList();
    setError(null);
    setValues((prev) => ({ ...prev, optionId: id }));
    setBrowsingOptions(false);
    setDetailsUnlocked(true);
  };

  const onExpandOptions = () => {
    hapticLight();
    animateList();
    setBrowsingOptions(true);
  };

  const onSelectTimePreset = (preset: TimePresetId) => {
    setError(null);
    setValues((prev) => ({
      ...prev,
      timePreset: preset,
      localTimestamp: preset === 'custom' ? prev.localTimestamp : applyTimePreset(preset),
    }));
  };

  const onSave = async () => {
    if (!isDescriptionValid(values.description)) {
      setError(`Notes must be ${DESCRIPTION_MAX} characters or fewer.`);
      return;
    }
    if (!isLocalTimestampValid(values.localTimestamp)) {
      setError('Enter a valid date and time (YYYY-MM-DDTHH:mm).');
      return;
    }
    setError(null);
    try {
      const payload = toJourneyPayload(values);
      if (isEdit && sourceRecordId) {
        await updateMutation.mutateAsync({ id: sourceRecordId, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      router.back();
    } catch (err) {
      setError(friendlyError(err, 'Save failed'));
    }
  };

  const onDelete = () => {
    if (!sourceRecordId || !existing?.deletable) return;
    Alert.alert('Delete recovery event?', 'This removes the event from your recovery history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteMutation.mutateAsync(sourceRecordId);
              router.back();
            } catch (err) {
              setError(friendlyError(err, 'Delete failed'));
            }
          })();
        },
      },
    ]);
  };

  if (isEdit && isLoading && !hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <Spinner />
      </View>
    );
  }

  if (isEdit && !isLoading && !existing) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-6">
        <Text className="text-center text-base text-text-muted">
          This recovery event is no longer available.
        </Text>
        <Pressable className="mt-4" hitSlop={8} onPress={() => router.back()}>
          <Text className="font-semibold text-brand">Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (isEdit && existing && !existing.editable) {
    return (
      <View className="flex-1 bg-surface px-6 pt-4">
        <Text className="text-2xl font-semibold text-text-primary">{existing.label}</Text>
        <Text className="mt-2 text-sm text-text-muted">
          Imported events are read-only. Open Coach Watts to review the source.
        </Text>
        <Text className="mt-4 text-base text-text-body">
          {existing.description || 'No additional context provided.'}
        </Text>
        <Button variant="secondary" className="mt-8" label="Close" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: isEdit ? 'Edit recovery event' : 'Log recovery event',
          headerShown: true,
        }}
      />
      <View ref={containerRef} className="flex-1 bg-surface">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pt-4"
          contentContainerStyle={{ paddingBottom: 48 + overlap }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-base text-text-muted">
            Capture what helps explain unusual recovery, sleep, or training response.
          </Text>

          <View className="mt-6 flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              What happened?
            </Text>
            {!browsingOptions ? (
              <Pressable
                hitSlop={8}
                onPress={onExpandOptions}
                accessibilityRole="button"
                accessibilityLabel="Back to all options"
              >
                <Text className="text-sm font-semibold text-brand">Back</Text>
              </Pressable>
            ) : null}
          </View>

          <View className="mt-2 gap-2">
            {(browsingOptions
              ? JOURNEY_EVENT_OPTIONS
              : JOURNEY_EVENT_OPTIONS.filter((option) => option.id === values.optionId)
            ).map((option) => {
              const active = values.optionId === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className="rounded-xl border px-4 py-3"
                  style={active ? activeSelectStyle : idleSelectStyle}
                  onPress={() => {
                    if (browsingOptions) {
                      onSelectOption(option.id);
                      return;
                    }
                    // Settled: tap selected card to go back to the full list
                    onExpandOptions();
                  }}
                >
                  <View className="flex-row items-start">
                    <OptionGlyph sf={option.sf} active={active} />
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-semibold text-text-primary">
                        {option.title}
                      </Text>
                      <Text className="mt-1 text-xs text-text-muted">{option.subtitle}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {!browsingOptions ? (
            <Text className="mt-3 text-xs text-text-muted">
              Logged as {eventTypeBadgeLabel(selectedOption.eventType).toLowerCase()}
            </Text>
          ) : (
            <Text className="mt-3 text-xs text-text-muted">Tap an option to continue.</Text>
          )}

          {detailsUnlocked ? (
            <Animated.View entering={FadeInDown.duration(280)}>
              <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-text-muted">
                How much did it affect you?
              </Text>
              <View className="gap-2">
                {SEVERITY_PRESETS.map((level) => {
                  const active = values.severityPreset === level.id;
                  return (
                    <Pressable
                      key={level.id}
                      className="rounded-xl border px-4 py-3"
                      style={active ? activeSelectStyle : idleSelectStyle}
                      onPress={() => {
                        hapticLight();
                        patch('severityPreset', level.id as SeverityPresetId);
                      }}
                    >
                      <View className="flex-row items-start">
                        <OptionGlyph sf={level.sf} active={active} />
                        <View className="min-w-0 flex-1">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-sm font-semibold text-text-primary">
                              {level.label}
                            </Text>
                            <Text className="text-xs text-text-muted">{level.value}/10</Text>
                          </View>
                          <Text className="mt-1 text-xs text-text-muted">{level.description}</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-text-muted">
                When did this happen?
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {TIME_PRESETS.map((preset) => {
                  const active = values.timePreset === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      className="rounded-full border px-3 py-2"
                      style={
                        active
                          ? activeSelectStyle
                          : { borderColor: theme.borderStrong, backgroundColor: 'transparent' }
                      }
                      onPress={() => {
                        hapticLight();
                        onSelectTimePreset(preset.id);
                      }}
                    >
                      <Text
                        className={`text-xs font-semibold ${active ? 'text-brand' : 'text-text-primary'}`}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                className="mt-3 rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
                placeholderTextColor={theme.textMuted}
                placeholder="YYYY-MM-DDTHH:mm"
                value={values.localTimestamp}
                onChangeText={(text) => {
                  setError(null);
                  setValues((prev) => ({ ...prev, timePreset: 'custom', localTimestamp: text }));
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-text-muted">
                Tell Coach Watts more
              </Text>
              <TextInput
                className="rounded-xl border border-border-strong bg-card px-4 py-3 text-base text-text-primary"
                placeholderTextColor={theme.textMuted}
                placeholder="Symptoms, trigger, what changed…"
                value={values.description}
                onChangeText={(text) => patch('description', text)}
                multiline
                style={{ minHeight: 100, textAlignVertical: 'top' }}
              />
              <Text className="mt-1 text-xs text-text-muted">
                {values.description.length}/{DESCRIPTION_MAX}
              </Text>

              {error ? <Text className="mt-4 text-sm text-danger">{error}</Text> : null}

              <Button
                className="mt-6"
                label={isEdit ? 'Save changes' : 'Log event'}
                onPress={() => void onSave()}
                loading={createMutation.isPending || updateMutation.isPending}
                disabled={!canSave}
              />

              {isEdit && existing?.deletable ? (
                <Pressable
                  className="mt-3 items-center rounded-xl border border-red-900/60 py-3.5"
                  onPress={onDelete}
                  disabled={pending}
                >
                  {deleteMutation.isPending ? (
                    <Spinner tone="danger" />
                  ) : (
                    <Text className="text-base font-semibold text-danger">Delete</Text>
                  )}
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}

          <Pressable
            className="mt-3 items-center rounded-xl border border-border-strong py-3.5"
            onPress={() => router.back()}
          >
            <Text className="text-base font-semibold text-text-primary">Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}
