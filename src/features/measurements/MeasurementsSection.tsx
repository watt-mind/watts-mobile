import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { useAuth } from '@/src/auth/AuthContext';
import { Button } from '@/src/components/Button';
import { Spinner } from '@/src/components/Spinner';
import { weightUnit } from '@/src/features/profile/mapProfile';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { Colors } from '@/src/theme/colors';
import { useThemeColors } from '@/src/theme/useThemeColors';

import {
  CUSTOM_UNIT_OPTIONS,
  DEFAULT_METRIC_KEY,
  MEASUREMENT_METRICS,
  findMetricOption,
} from './catalog';
import {
  displayUnitLabel,
  emptyMeasurementForm,
  formatMetricName,
  formatRecordedAt,
  formatSource,
  measurementFormHasContent,
  measurementsWebPath,
  prefersImperialMass,
  toCreatePayload,
  toDisplayValue,
} from './mapMeasurements';
import type { BodyMeasurementEntry, CanonicalUnit, MeasurementFormValues } from './types';
import {
  useBodyMeasurementsQuery,
  useCreateBodyMeasurement,
  useSoftDeleteBodyMeasurement,
} from './useMeasurements';
import { openInstanceWeb } from '@/src/features/account/openInstanceWeb';

const METRIC_CATEGORIES = [
  { id: 'all', label: 'All Metrics' },
  { id: 'body', label: 'Body Composition', keys: ['weight', 'body_fat_pct', 'muscle_mass_kg'] },
  {
    id: 'vitals',
    label: 'Vitals & Cardiac',
    keys: ['resting_hr', 'hrv_sdnn_ms', 'blood_pressure_sys', 'blood_glucose_mg_dl', 'spo2_pct'],
  },
  {
    id: 'dimensions',
    label: 'Dimensions',
    keys: ['waist_cm', 'chest_cm', 'thigh_cm', 'arm_cm', 'hips_cm'],
  },
];

function MetricPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const theme = useThemeColors();
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredMetrics = useMemo(() => {
    if (activeCategory === 'all') return MEASUREMENT_METRICS;
    const cat = METRIC_CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat?.keys) return MEASUREMENT_METRICS;
    return MEASUREMENT_METRICS.filter((m) => cat.keys.includes(m.key) || m.key === 'custom');
  }, [activeCategory]);

  return (
    <View className="mt-4 rounded-xl border border-border bg-card p-4">
      <Text className="text-sm font-semibold text-text-primary">Select Metric</Text>

      {/* Category Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 flex-row">
        <View className="flex-row gap-2">
          {METRIC_CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                accessibilityRole="button"
                accessibilityLabel={cat.label}
                accessibilityState={{ selected: active }}
                className="rounded-full px-3 py-1.5 active:opacity-80"
                style={{
                  backgroundColor: active ? theme.borderStrong : theme.border,
                  borderWidth: active ? 1 : 0,
                  borderColor: active ? theme.textPrimary : 'transparent',
                }}
                onPress={() => {
                  hapticLight();
                  setActiveCategory(cat.id);
                }}
              >
                <Text
                  className={`text-xs font-semibold ${
                    active ? 'text-text-primary' : 'text-text-muted'
                  }`}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Metric Option Grid */}
      <View className="mt-3 flex-row flex-wrap gap-2">
        {filteredMetrics.map((metric) => {
          const active = value === metric.key;
          return (
            <Pressable
              key={metric.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className="rounded-full border px-3 py-2 active:opacity-80"
              style={
                active
                  ? {
                      borderColor: Colors.brand,
                      backgroundColor: 'rgba(0, 220, 130, 0.1)',
                    }
                  : {
                      borderColor: theme.borderStrong,
                      backgroundColor: theme.surface,
                    }
              }
              onPress={() => {
                hapticLight();
                onChange(metric.key);
              }}
            >
              <Text
                className={`text-xs font-semibold ${active ? 'text-brand' : 'text-text-primary'}`}
              >
                {metric.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LatestCard({
  entry,
  unitLabel,
  displayValue,
  onDelete,
  deleting,
}: {
  entry: BodyMeasurementEntry;
  unitLabel: string;
  displayValue: number;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <View className="mb-2.5 rounded-xl border border-border bg-card px-4 py-3.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-text-primary">
              {formatMetricName(entry)}
            </Text>
          </View>

          <View className="mt-1 flex-row items-baseline gap-2">
            <Text className="text-xl font-bold text-text-primary">
              {displayValue}{' '}
              <Text className="text-xs font-medium text-text-muted">{unitLabel}</Text>
            </Text>
          </View>

          <Text className="mt-1 text-xs text-text-muted">
            {formatRecordedAt(entry.recordedAt)} · {formatSource(entry.source)}
          </Text>

          {entry.notes ? (
            <Text className="mt-1 text-xs text-text-muted" numberOfLines={2}>
              {entry.notes}
            </Text>
          ) : null}
        </View>

        {entry.source === 'manual_measurement' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${formatMetricName(entry)}`}
            disabled={deleting}
            className="py-1 active:opacity-70"
            hitSlop={8}
            onPress={onDelete}
          >
            <Text className="text-xs font-semibold text-danger">{deleting ? '…' : 'Delete'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function MeasurementsSection() {
  const theme = useThemeColors();

  const { instanceUrl } = useAuth();
  const { data: profile } = useAthleteProfileQuery();
  const weightUnits = profile?.weightUnits ?? 'Kilograms';
  const distanceUnits = profile?.distanceUnits ?? 'Kilometers';
  const unitOpts = useMemo(() => ({ weightUnits, distanceUnits }), [weightUnits, distanceUnits]);

  const { data, isLoading, isError, error, refetch } = useBodyMeasurementsQuery();
  const createMutation = useCreateBodyMeasurement();
  const deleteMutation = useSoftDeleteBodyMeasurement();

  const [form, setForm] = useState<MeasurementFormValues>(emptyMeasurementForm(DEFAULT_METRIC_KEY));
  const [formError, setFormError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedOption = findMetricOption(form.metricKey);
  const canonicalUnit: CanonicalUnit =
    form.metricKey === 'custom' ? form.customUnit : (selectedOption?.unit ?? 'cm');
  const unitLabel = displayUnitLabel(
    form.metricKey === 'custom' ? `custom:${form.customName || 'x'}` : form.metricKey,
    canonicalUnit,
    unitOpts,
  );

  const touch = () => {
    setJustSaved(false);
    setFormError(null);
  };

  const onSave = async () => {
    if (!measurementFormHasContent(form)) {
      hapticError();
      setFormError(
        form.metricKey === 'custom'
          ? 'Enter a custom name and value.'
          : 'Enter a value before saving.',
      );
      return;
    }
    const payload = toCreatePayload(form, unitOpts);
    if (!payload) {
      hapticError();
      setFormError('Enter a valid number.');
      return;
    }
    setFormError(null);
    try {
      await createMutation.mutateAsync(payload);
      hapticSuccess();
      setForm(emptyMeasurementForm(form.metricKey));
      setJustSaved(true);
    } catch (err) {
      hapticError();
      setFormError(friendlyError(err, 'Save failed'));
    }
  };

  const confirmDelete = (entry: BodyMeasurementEntry) => {
    Alert.alert(
      'Delete measurement?',
      `${formatMetricName(entry)} from ${formatRecordedAt(entry.recordedAt)} will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingId(entry.id);
              try {
                await deleteMutation.mutateAsync(entry.id);
                hapticSuccess();
              } catch (err) {
                hapticError();
                setFormError(friendlyError(err, 'Delete failed'));
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const openWeb = async () => {
    await openInstanceWeb(instanceUrl, measurementsWebPath());
  };

  return (
    <View className="mt-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Body Measurements
          </Text>
          <Text className="text-sm text-text-muted">
            Track weight, body composition, vitals, and dimensions.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          className="py-1 active:opacity-70"
          hitSlop={8}
          onPress={() => void openWeb()}
        >
          <Text className="text-xs font-semibold text-brand">Web History ›</Text>
        </Pressable>
      </View>

      {isLoading && !data ? <Spinner className="mt-4" /> : null}

      {isError ? (
        <View className="mt-3 rounded-xl border border-danger/40 bg-tint-error p-3">
          <Text className="text-sm text-danger">
            {friendlyError(error, 'Could not load measurements')}
          </Text>
          <Pressable className="mt-2" hitSlop={8} onPress={() => void refetch()}>
            <Text className="font-semibold text-brand">Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Latest Recorded Metrics First */}
      <Text className="mb-2.5 mt-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Latest Recorded Metrics
      </Text>
      {data && data.latestByMetric.length === 0 ? (
        <View className="mb-4 rounded-xl border border-border bg-card p-3.5">
          <Text className="text-xs text-text-muted">
            No measurements logged yet. Add your first below.
          </Text>
        </View>
      ) : null}
      {data?.latestByMetric.map((entry) => (
        <LatestCard
          key={entry.id}
          entry={entry}
          unitLabel={displayUnitLabel(entry.metricKey, entry.unit, unitOpts)}
          displayValue={toDisplayValue(entry.value, entry.metricKey, entry.unit, unitOpts)}
          deleting={deletingId === entry.id}
          onDelete={() => confirmDelete(entry)}
        />
      ))}

      {/* Metric Picker & Entry Form */}
      <MetricPicker
        value={form.metricKey}
        onChange={(next) => {
          touch();
          setForm((prev) => ({
            ...emptyMeasurementForm(next),
            notes: prev.notes,
          }));
        }}
      />

      {/* Entry Form Card */}
      <View className="mt-4 rounded-xl border border-border bg-card p-4">
        {form.metricKey === 'custom' ? (
          <>
            <View>
              <Text className="mb-1 text-xs font-medium text-text-muted">Custom Metric Name</Text>
              <TextInput
                className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-base text-text-primary"
                placeholderTextColor={theme.textMuted}
                placeholder="e.g. Left bicep flexed"
                value={form.customName}
                onChangeText={(text) => {
                  touch();
                  setForm((prev) => ({ ...prev, customName: text }));
                }}
              />
            </View>

            <Text className="mb-2 mt-3 text-xs font-medium text-text-muted">Unit Type</Text>
            <View className="flex-row flex-wrap gap-2">
              {CUSTOM_UNIT_OPTIONS.map((option) => {
                const active = form.customUnit === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className="rounded-full border px-3 py-1.5"
                    style={
                      active
                        ? {
                            borderColor: Colors.brand,
                            backgroundColor: 'rgba(0, 220, 130, 0.1)',
                          }
                        : { borderColor: theme.borderStrong }
                    }
                    onPress={() => {
                      touch();
                      setForm((prev) => ({ ...prev, customUnit: option.value }));
                    }}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        active ? 'text-brand' : 'text-text-primary'
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <View className="mt-2">
          <Text className="mb-1 text-xs font-medium text-text-muted">Value ({unitLabel})</Text>
          <TextInput
            className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-base font-semibold text-text-primary"
            placeholderTextColor={theme.textMuted}
            placeholder={
              form.metricKey === 'weight' ? (prefersImperialMass(weightUnits) ? '165' : '75') : '0'
            }
            value={form.value}
            onChangeText={(text) => {
              touch();
              setForm((prev) => ({ ...prev, value: text }));
            }}
            keyboardType="decimal-pad"
          />
          {form.metricKey === 'weight' ? (
            <Text className="mt-1 text-xs text-text-muted">
              Using profile unit ({weightUnit(profile)}).
            </Text>
          ) : null}
        </View>

        <View className="mt-3">
          <Text className="mb-1 text-xs font-medium text-text-muted">Notes (optional)</Text>
          <TextInput
            className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-base text-text-primary"
            placeholderTextColor={theme.textMuted}
            placeholder="Morning, after workout…"
            value={form.notes}
            onChangeText={(text) => {
              touch();
              setForm((prev) => ({ ...prev, notes: text }));
            }}
          />
        </View>

        {formError ? <Text className="mt-3 text-xs text-danger">{formError}</Text> : null}

        <Button
          className="mt-4"
          label={justSaved ? '✓ Measurement Saved' : 'Add measurement'}
          loading={createMutation.isPending}
          disabled={!measurementFormHasContent(form) || justSaved}
          onPress={() => {
            if (justSaved) return;
            void onSave();
          }}
        />
      </View>
    </View>
  );
}
