/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { Button } from '@/src/components/Button';
import { applyHealthPrefill } from '@/src/features/log/applyHealthPrefill';
import { fetchHealthPrefill } from '@/src/features/log/healthPrefill';
import {
  emptyLogForm,
  formHasContent,
  stepSleepHours,
  toWellnessPayload,
} from '@/src/features/log/mapLogForm';
import { SleepDurationInput } from '@/src/features/log/SleepDurationInput';
import { WeightInput } from '@/src/features/log/WeightInput';
import type { LogFormValues } from '@/src/features/log/types';
import { useSaveWellnessCheckin } from '@/src/features/log/useLog';
import {
  getFatigueHelp,
  getMoodLabel,
  getSorenessHelp,
  getStressLabel,
} from '@/src/features/log/wellnessLabels';
import { WellnessScoreCard } from '@/src/features/log/WellnessScoreCard';

import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';

import type { WeightUnits } from '@/src/features/profile/types';

type SubjectiveKey = 'mood' | 'stress' | 'fatigue' | 'soreness';

const OFFLINE_SAVE_CLOSE_MS = 1600;

interface WellnessCheckinSheetProps {
  visible: boolean;
  onClose: () => void;
  initialValues?: LogFormValues;
  weightUnits?: WeightUnits;
  weightUnitLabel?: string;
}

export function WellnessCheckinSheet({
  visible,
  onClose,
  initialValues,
  weightUnits = 'Kilograms',
  weightUnitLabel = 'kg',
}: WellnessCheckinSheetProps) {
  const theme = useThemeColors();
  const saveMutation = useSaveWellnessCheckin();
  const wasVisibleRef = useRef(false);
  const offlineCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [values, setValues] = useState<LogFormValues>(initialValues ?? emptyLogForm());
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthHint, setHealthHint] = useState<string | null>(null);
  const [sleepAutoSynced, setSleepAutoSynced] = useState(false);
  const [weightAutoSynced, setWeightAutoSynced] = useState(false);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setValues(initialValues ?? emptyLogForm());
      setError(null);
      setSaveNotice(null);
      setHealthBusy(false);
      setHealthHint(null);
      setSleepAutoSynced(false);
      setWeightAutoSynced(false);
    }
    wasVisibleRef.current = visible;
  }, [visible, initialValues]);

  useEffect(() => {
    return () => {
      if (offlineCloseTimer.current) clearTimeout(offlineCloseTimer.current);
    };
  }, []);

  const updateSubjective = (key: SubjectiveKey) => (next: number) => {
    setError(null);
    setValues((prev) => ({ ...prev, [key]: next }));
  };

  const updateField = (key: 'sleepHours' | 'weight' | 'notes') => (text: string) => {
    setError(null);
    if (key === 'sleepHours') setSleepAutoSynced(false);
    if (key === 'weight') setWeightAutoSynced(false);
    setValues((prev) => ({ ...prev, [key]: text }));
  };

  const onStepSleep = (delta: number) => {
    hapticLight();
    setSleepAutoSynced(false);
    // Deliberately reads the render-time value, not the `prev` in the updater:
    // SleepDurationInput already applied the same step via onChangeText before
    // firing onStep, so reading `prev` here would apply the delta a second time.
    const next = stepSleepHours(values.sleepHours, delta);
    setValues((prev) => ({ ...prev, sleepHours: next }));
  };

  const onPrefillFromHealth = async () => {
    hapticLight();
    setHealthBusy(true);
    setHealthHint(null);
    setError(null);
    try {
      const prefill = await fetchHealthPrefill();
      if (!prefill) {
        setHealthHint('No sleep or weight found in Health.');
        return;
      }
      let sleepFilled = false;
      let weightFilled = false;
      setValues((prev) => {
        const next = applyHealthPrefill(prev, prefill, {
          weightUnit: weightUnitLabel === 'lbs' ? 'lb' : 'kg',
        });
        sleepFilled = !prev.sleepHours.trim() && Boolean(next.sleepHours);
        weightFilled = !prev.weight.trim() && Boolean(next.weight);
        return next;
      });
      if (sleepFilled) setSleepAutoSynced(true);
      if (weightFilled) setWeightAutoSynced(true);
      hapticSuccess();
      setHealthHint('Prefilled from Health');
    } catch (err) {
      hapticError();
      setError(friendlyError(err, 'Could not read Health data'));
    } finally {
      setHealthBusy(false);
    }
  };

  const onSave = async () => {
    if (!formHasContent(values)) {
      hapticError();
      setError('Select at least one metric before saving.');
      return;
    }
    setError(null);
    setSaveNotice(null);
    try {
      const result = await saveMutation.mutateAsync(
        toWellnessPayload(values, undefined, weightUnits),
      );
      hapticSuccess();
      if (result.queuedOffline) {
        setSaveNotice('Saved offline — will sync when you’re back online.');
        if (offlineCloseTimer.current) clearTimeout(offlineCloseTimer.current);
        offlineCloseTimer.current = setTimeout(() => {
          offlineCloseTimer.current = null;
          onClose();
        }, OFFLINE_SAVE_CLOSE_MS);
        return;
      }
      onClose();
    } catch (err) {
      hapticError();
      setError(friendlyError(err, 'Save failed'));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable accessible={false} className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable
          testID="wellness-checkin-sheet"
          accessible={false}
          className="rounded-t-3xl bg-surface px-6 pb-10 pt-4"
          style={{ maxHeight: '90%' }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-border-strong" />

          <View className="mb-2 flex-row items-center justify-between">
            <View>
              <Text className="text-xl font-bold text-text-primary">Daily Wellness Check-in</Text>
              <Text className="text-xs text-text-muted">Target completion &lt; 20 seconds</Text>
            </View>

            <Pressable hitSlop={8} onPress={onClose} className="p-1 active:opacity-70">
              <Text className="text-base font-semibold text-text-muted">Cancel</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" className="flex-shrink">
            {/* Health Sync Trigger */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Prefill from Health"
              className="mb-1 mt-2 self-start rounded-full border border-border bg-card px-3 py-1.5 active:opacity-70"
              disabled={healthBusy}
              onPress={() => void onPrefillFromHealth()}
            >
              <Text className="text-xs font-semibold text-brand">
                {healthBusy ? 'Reading Health…' : '⚡ Prefill from Health Sync'}
              </Text>
            </Pressable>
            {healthHint ? <Text className="mb-2 text-xs text-text-muted">{healthHint}</Text> : null}

            <WellnessScoreCard
              label="Mood"
              help={getMoodLabel(values.mood ?? 5)}
              value={values.mood}
              tintColor={theme.brandOnSurface}
              onChange={updateSubjective('mood')}
            />
            <WellnessScoreCard
              label="Stress"
              help={getStressLabel(values.stress ?? 5)}
              value={values.stress}
              tintColor={theme.modifyOnSurface}
              onChange={updateSubjective('stress')}
            />
            <WellnessScoreCard
              label="Fatigue"
              help={getFatigueHelp(values.fatigue ?? 5)}
              value={values.fatigue}
              tintColor={theme.textMuted}
              onChange={updateSubjective('fatigue')}
            />
            <WellnessScoreCard
              label="Soreness"
              help={getSorenessHelp(values.soreness ?? 5)}
              value={values.soreness}
              tintColor={theme.dangerOnSurface}
              onChange={updateSubjective('soreness')}
            />

            <SleepDurationInput
              value={values.sleepHours}
              isAutoSynced={sleepAutoSynced}
              onChangeText={updateField('sleepHours')}
              onStep={onStepSleep}
            />

            <WeightInput
              value={values.weight}
              unitLabel={weightUnitLabel}
              isAutoSynced={weightAutoSynced}
              onChangeText={updateField('weight')}
            />

            {error ? <Text className="mt-3 text-xs text-danger">{error}</Text> : null}
            {saveNotice ? (
              <Text testID="wellness-checkin-saved" className="mt-3 text-xs text-brand">
                {saveNotice}
              </Text>
            ) : null}
          </ScrollView>

          {/* Sticky CTA — stays in the a11y tree / viewport for Maestro (Modal ScrollView is opaque to scrollUntilVisible). */}
          <Button
            testID="wellness-checkin-save"
            className="mt-4"
            label="Save Check-in"
            onPress={() => void onSave()}
            loading={saveMutation.isPending}
            disabled={!formHasContent(values) || saveNotice != null}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
