import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { Button } from '@/src/components/Button';
import { Spinner } from '@/src/components/Spinner';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { parseDecimal } from '@/src/lib/parseDecimal';
import { Colors } from '@/src/theme/colors';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { useTabScrollPadding } from '@/src/hooks/useTabScrollPadding';

import {
  computeTargetCalories,
  computeTdee,
  defaultAdjustmentForGoal,
  settingsFormEquals,
  toNutritionSettingsPayload,
} from './mapNutritionSettings';
import {
  ACTIVITY_LEVEL_OPTIONS,
  ALLERGY_OPTIONS,
  BASE_CALORIES_MODE_OPTIONS,
  DIETARY_OPTIONS,
  GOAL_PROFILE_OPTIONS,
  INTOLERANCE_OPTIONS,
  LIFESTYLE_OPTIONS,
  PAL_MULTIPLIERS,
  PHASE_PRESETS,
  SUPPLEMENT_OPTIONS,
  TRAINING_PHASE_OPTIONS,
  type LabeledOption,
} from './nutritionSettingsOptions';
import type {
  ActivityLevel,
  BaseCaloriesMode,
  GoalProfile,
  NutritionSettingsForm as NutritionSettingsFormValues,
  NutritionSettingsState,
} from './nutritionSettingsTypes';
import { useSaveNutritionSettings } from './useNutritionSettings';

function SectionCard({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <View className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <View className="border-b border-border/80 px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-base font-semibold text-text-primary">{title}</Text>
          {badge ? (
            <View className="rounded-md bg-brand/20 px-2 py-0.5">
              <Text className="text-xs font-semibold text-brand">{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text className="mt-1 text-sm text-text-muted">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <Text className="mb-1.5 text-sm font-medium text-text-muted">{children}</Text>;
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  suffix?: string;
  disabled?: boolean;
}) {
  const theme = useThemeColors();
  const [text, setText] = useState(value == null ? '' : String(value));
  const [previousValue, setPreviousValue] = useState(value);
  if (value !== previousValue) {
    setPreviousValue(value);
    const next = value == null ? '' : String(value);
    setText((prev) => (prev === next || parseDecimal(prev) === value ? prev : next));
  }

  return (
    <View className="border-b border-border/80 px-4 py-3">
      <FieldLabel>
        {label}
        {suffix ? ` (${suffix})` : ''}
      </FieldLabel>
      <TextInput
        accessibilityLabel={label}
        editable={!disabled}
        keyboardType="decimal-pad"
        value={text}
        onChangeText={(next) => {
          setText(next);
          if (next.trim() === '') {
            onChange(null);
            return;
          }
          // Shared comma-decimal tolerant parse (CW-484). An unparseable keystroke
          // keeps the last committed value instead of committing 0.
          const n = parseDecimal(next);
          if (n != null) onChange(n);
        }}
        className="rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-base text-text-primary"
        placeholderTextColor={theme.textMuted}
        style={{ opacity: disabled ? 0.5 : 1 }}
      />
    </View>
  );
}

function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: LabeledOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="border-b border-border/80 px-4 py-3">
      <FieldLabel>{label}</FieldLabel>
      <View className="mt-1 flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`rounded-lg px-3 py-2 ${
                selected ? 'bg-brand' : 'border border-border-strong bg-surface'
              } active:opacity-80`}
              onPress={() => {
                hapticLight();
                onChange(option.value);
              }}
            >
              <Text
                className={`text-sm font-medium ${selected ? 'text-ink' : 'text-text-primary'}`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MultiChips({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: LabeledOption[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = new Set(values);
  return (
    <View className="border-b border-border/80 px-4 py-3">
      <FieldLabel>{label}</FieldLabel>
      <View className="mt-1 flex-row flex-wrap gap-2">
        {options.map((option) => {
          const isOn = selected.has(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: isOn }}
              className={`rounded-lg px-3 py-2 ${
                isOn ? 'bg-brand' : 'border border-border-strong bg-surface'
              } active:opacity-80`}
              onPress={() => {
                hapticLight();
                if (isOn) {
                  onChange(values.filter((v) => v !== option.value));
                } else {
                  onChange([...values, option.value]);
                }
              }}
            >
              <Text className={`text-sm font-medium ${isOn ? 'text-ink' : 'text-text-primary'}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function formFromState(state: NutritionSettingsState): NutritionSettingsFormValues {
  const { weightKg: _w, ...form } = state;
  return form;
}

export function NutritionSettingsForm({ initial }: { initial: NutritionSettingsState }) {
  const tabBottomPad = useTabScrollPadding();
  const theme = useThemeColors();
  const saveMutation = useSaveNutritionSettings();

  const [baseline, setBaseline] = useState(() => formFromState(initial));
  const [form, setForm] = useState(() => formFromState(initial));
  const [phase, setPhase] = useState('CUSTOM');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previousInitial, setPreviousInitial] = useState(initial);

  // Background refetches update the prop; keep in-progress edits. This guarded
  // render-time adjustment follows React's derived-state pattern.
  if (initial !== previousInitial) {
    setPreviousInitial(initial);
    const next = formFromState(initial);
    if (settingsFormEquals(form, baseline)) {
      setBaseline(next);
      setForm(next);
    }
  }

  const dirty = useMemo(() => !settingsFormEquals(form, baseline), [form, baseline]);
  const tdee = computeTdee(form);
  const targetCalories = computeTargetCalories(form);

  const patch = <K extends keyof NutritionSettingsFormValues>(
    key: K,
    value: NutritionSettingsFormValues[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccessMessage(null);
  };

  const onGoalChange = (goal: GoalProfile) => {
    setForm((prev) => ({
      ...prev,
      goalProfile: goal,
      targetAdjustmentPercent: defaultAdjustmentForGoal(goal),
    }));
    setSuccessMessage(null);
  };

  const onBaseModeChange = (mode: BaseCaloriesMode) => {
    setForm((prev) => {
      let nonExercise = prev.nonExerciseBaseCalories;
      if (mode === 'MANUAL_NON_EXERCISE' && (nonExercise == null || nonExercise <= 0)) {
        const pal = PAL_MULTIPLIERS[prev.activityLevel] || 1.2;
        nonExercise = Math.round(prev.bmr * pal);
      }
      return { ...prev, baseCaloriesMode: mode, nonExerciseBaseCalories: nonExercise };
    });
    setSuccessMessage(null);
  };

  const onPhaseChange = (next: string) => {
    setPhase(next);
    const preset = PHASE_PRESETS[next];
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      baseProteinPerKg: preset.baseProteinPerKg,
      baseFatPerKg: preset.baseFatPerKg,
      carbScalingFactor: preset.carbScalingFactor,
    }));
    setSuccessMessage(null);
  };

  const onSave = async () => {
    setFormError(null);
    setSuccessMessage(null);
    if (
      form.baseCaloriesMode === 'MANUAL_NON_EXERCISE' &&
      (form.nonExerciseBaseCalories == null || form.nonExerciseBaseCalories <= 0)
    ) {
      setFormError('Set a non-exercise baseline when using Manual mode.');
      hapticError();
      return;
    }
    try {
      const payload = toNutritionSettingsPayload(form);
      const saved = await saveMutation.mutateAsync(payload);
      const next = formFromState(saved);
      setBaseline(next);
      setForm(next);
      hapticSuccess();
      setSuccessMessage('Nutrition settings saved.');
    } catch (err) {
      hapticError();
      setFormError(friendlyError(err, 'Failed to save nutrition settings'));
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerClassName="px-6 pt-4"
      contentContainerStyle={{ paddingBottom: tabBottomPad }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-sm text-text-muted">
        Calibrate tracking, targets, constraints, and hydration. Meal plans and grocery stay on web.
      </Text>

      <View className="mt-4 flex-row items-center justify-between gap-3">
        {dirty ? (
          <Text className="flex-1 text-sm text-text-muted">Unsaved changes</Text>
        ) : (
          <View className="flex-1" />
        )}
        <Button
          label={saveMutation.isPending ? 'Saving…' : 'Save'}
          onPress={() => void onSave()}
          disabled={!dirty || saveMutation.isPending}
        />
      </View>

      {formError ? <Text className="mt-3 text-sm text-danger">{formError}</Text> : null}
      {successMessage ? <Text className="mt-3 text-sm text-brand">{successMessage}</Text> : null}
      {saveMutation.isPending ? (
        <View className="mt-3 flex-row items-center gap-2">
          <Spinner />
          <Text className="text-sm text-text-muted">Saving and refreshing fueling plans…</Text>
        </View>
      ) : null}

      <SectionCard title="Nutrition tracking" subtitle="Show Log & Today nutrition when enabled.">
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="text-base text-text-primary">Enable nutrition tracking</Text>
          <Switch
            accessibilityLabel="Enable nutrition tracking"
            value={form.nutritionTrackingEnabled}
            onValueChange={(value) => {
              hapticLight();
              patch('nutritionTrackingEnabled', value);
            }}
            trackColor={{ false: theme.borderStrong, true: Colors.brand }}
          />
        </View>
      </SectionCard>

      <SectionCard title="Metabolic" subtitle="BMR, activity, and calorie goal profile.">
        <NumberField
          label="BMR"
          value={form.bmr}
          suffix="kcal/day"
          onChange={(n) => patch('bmr', n ?? form.bmr)}
        />
        <Text className="border-b border-border/80 px-4 py-2 text-xs text-text-muted">
          Auto-calc from height/sex needs web Profile basics. Enter BMR manually here.
        </Text>
        <ChoiceChips
          label="Activity level"
          options={ACTIVITY_LEVEL_OPTIONS}
          value={form.activityLevel}
          onChange={(v: ActivityLevel) => patch('activityLevel', v)}
        />
        <ChoiceChips
          label="Base calories mode"
          options={BASE_CALORIES_MODE_OPTIONS}
          value={form.baseCaloriesMode}
          onChange={onBaseModeChange}
        />
        {form.baseCaloriesMode === 'MANUAL_NON_EXERCISE' ? (
          <NumberField
            label="Non-exercise baseline"
            value={form.nonExerciseBaseCalories}
            suffix="kcal"
            onChange={(n) => patch('nonExerciseBaseCalories', n)}
          />
        ) : null}
        <View className="border-b border-border/80 px-4 py-3">
          <Text className="text-sm text-text-muted">Estimated TDEE</Text>
          <Text className="mt-1 text-lg font-semibold text-text-primary">{tdee} kcal</Text>
        </View>
        <ChoiceChips
          label="Goal profile"
          options={GOAL_PROFILE_OPTIONS}
          value={form.goalProfile}
          onChange={onGoalChange}
        />
        {form.goalProfile !== 'MAINTAIN' ? (
          <NumberField
            label="Target adjustment"
            value={form.targetAdjustmentPercent}
            suffix="%"
            onChange={(n) => patch('targetAdjustmentPercent', n ?? 0)}
          />
        ) : null}
        <View className="border-b border-border/80 px-4 py-3">
          <Text className="text-sm text-text-muted">Target calories</Text>
          <Text className="mt-1 text-lg font-semibold text-text-primary">
            {targetCalories} kcal
          </Text>
        </View>
        <NumberField
          label="Metabolic floor"
          value={Math.round(form.metabolicFloor * 100)}
          suffix="%"
          onChange={(n) => patch('metabolicFloor', Math.min(0.95, Math.max(0.1, (n ?? 60) / 100)))}
        />
        <View className="px-4 py-3">
          <Text className="text-sm text-text-muted">Effective weight</Text>
          <Text className="mt-1 text-base text-text-primary">{initial.weightKg} kg</Text>
        </View>
      </SectionCard>

      <SectionCard title="Meal schedule" subtitle="Typical meal names and times.">
        {form.mealPattern.map((meal, index) => (
          <View key={`meal-${index}`} className="border-b border-border/80 px-4 py-3">
            <View className="flex-row items-center gap-2">
              <TextInput
                accessibilityLabel={`Meal ${index + 1} name`}
                value={meal.name}
                onChangeText={(name) => {
                  const next = [...form.mealPattern];
                  next[index] = { ...meal, name };
                  patch('mealPattern', next);
                }}
                className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-base text-text-primary"
                placeholderTextColor={theme.textMuted}
                placeholder="Meal name"
              />
              <TextInput
                accessibilityLabel={`Meal ${index + 1} time`}
                value={meal.time}
                onChangeText={(time) => {
                  const next = [...form.mealPattern];
                  next[index] = { ...meal, time };
                  patch('mealPattern', next);
                }}
                className="w-24 rounded-lg border border-border-strong bg-surface px-3 py-2 text-base text-text-primary"
                placeholderTextColor={theme.textMuted}
                placeholder="HH:mm"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove meal ${index + 1}`}
                className="rounded-lg px-2 py-2 active:opacity-70"
                onPress={() => {
                  hapticLight();
                  patch(
                    'mealPattern',
                    form.mealPattern.filter((_, i) => i !== index),
                  );
                }}
              >
                <Text className="text-sm font-medium text-danger">Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          className="px-4 py-3 active:opacity-80"
          onPress={() => {
            hapticLight();
            patch('mealPattern', [...form.mealPattern, { name: 'New Meal', time: '08:00' }]);
          }}
        >
          <Text className="text-sm font-semibold text-brand">Add meal</Text>
        </Pressable>
      </SectionCard>

      <SectionCard title="Dietary constraints" subtitle="Non-negotiables for recommendations.">
        <MultiChips
          label="Dietary profile"
          options={DIETARY_OPTIONS}
          values={form.dietaryProfile}
          onChange={(v) => patch('dietaryProfile', v)}
        />
        <MultiChips
          label="Allergies"
          options={ALLERGY_OPTIONS}
          values={form.foodAllergies}
          onChange={(v) => patch('foodAllergies', v)}
        />
        <MultiChips
          label="Intolerances"
          options={INTOLERANCE_OPTIONS}
          values={form.foodIntolerances}
          onChange={(v) => patch('foodIntolerances', v)}
        />
        <MultiChips
          label="Lifestyle exclusions"
          options={LIFESTYLE_OPTIONS}
          values={form.lifestyleExclusions}
          onChange={(v) => patch('lifestyleExclusions', v)}
        />
      </SectionCard>

      <SectionCard
        title="Fuel calibration"
        subtitle="Fueling sensitivity and state ranges (g/kg carbs)."
        badge="Pro"
      >
        <NumberField
          label="Fueling sensitivity"
          value={form.fuelingSensitivity}
          onChange={(n) => patch('fuelingSensitivity', n ?? 1)}
        />
        <NumberField
          label="Eco trigger"
          value={form.fuelState1Trigger}
          onChange={(n) => patch('fuelState1Trigger', n ?? form.fuelState1Trigger)}
        />
        <NumberField
          label="Eco min"
          value={form.fuelState1Min}
          suffix="g/kg"
          onChange={(n) => patch('fuelState1Min', n ?? form.fuelState1Min)}
        />
        <NumberField
          label="Eco max"
          value={form.fuelState1Max}
          suffix="g/kg"
          onChange={(n) => patch('fuelState1Max', n ?? form.fuelState1Max)}
        />
        <NumberField
          label="Steady trigger"
          value={form.fuelState2Trigger}
          onChange={(n) => patch('fuelState2Trigger', n ?? form.fuelState2Trigger)}
        />
        <NumberField
          label="Steady min"
          value={form.fuelState2Min}
          suffix="g/kg"
          onChange={(n) => patch('fuelState2Min', n ?? form.fuelState2Min)}
        />
        <NumberField
          label="Steady max"
          value={form.fuelState2Max}
          suffix="g/kg"
          onChange={(n) => patch('fuelState2Max', n ?? form.fuelState2Max)}
        />
        <NumberField
          label="Performance min"
          value={form.fuelState3Min}
          suffix="g/kg"
          onChange={(n) => patch('fuelState3Min', n ?? form.fuelState3Min)}
        />
        <NumberField
          label="Performance max"
          value={form.fuelState3Max}
          suffix="g/kg"
          onChange={(n) => patch('fuelState3Max', n ?? form.fuelState3Max)}
        />
      </SectionCard>

      <SectionCard
        title="Adaptive engine"
        subtitle="Gut training, macros per kg, windows, supplements."
        badge="Pro"
      >
        <ChoiceChips
          label="Training phase preset"
          options={TRAINING_PHASE_OPTIONS}
          value={phase}
          onChange={onPhaseChange}
        />
        <NumberField
          label="Current carb max"
          value={form.currentCarbMax}
          suffix="g/hr"
          onChange={(n) => patch('currentCarbMax', n ?? form.currentCarbMax)}
        />
        <NumberField
          label="Ultimate carb goal"
          value={form.ultimateCarbGoal}
          suffix="g/hr"
          onChange={(n) => patch('ultimateCarbGoal', n ?? form.ultimateCarbGoal)}
        />
        <NumberField
          label="Carb scaling factor"
          value={form.carbScalingFactor}
          onChange={(n) => patch('carbScalingFactor', n ?? form.carbScalingFactor)}
        />
        <NumberField
          label="Base protein"
          value={form.baseProteinPerKg}
          suffix="g/kg"
          onChange={(n) => patch('baseProteinPerKg', n ?? form.baseProteinPerKg)}
        />
        <NumberField
          label="Base fat"
          value={form.baseFatPerKg}
          suffix="g/kg"
          onChange={(n) => patch('baseFatPerKg', n ?? form.baseFatPerKg)}
        />
        <NumberField
          label="Pre-workout window"
          value={form.preWorkoutWindow}
          suffix="min"
          onChange={(n) => patch('preWorkoutWindow', n ?? form.preWorkoutWindow)}
        />
        <NumberField
          label="Post-workout window"
          value={form.postWorkoutWindow}
          suffix="min"
          onChange={(n) => patch('postWorkoutWindow', n ?? form.postWorkoutWindow)}
        />
        <MultiChips
          label="Supplements"
          options={SUPPLEMENT_OPTIONS}
          values={form.enabledSupplements}
          onChange={(v) => patch('enabledSupplements', v)}
        />
      </SectionCard>

      <SectionCard title="Hydration" subtitle="Sweat, sodium, and quick-add volumes.">
        <NumberField
          label="Sweat rate"
          value={form.sweatRate}
          suffix="L/hr"
          onChange={(n) => patch('sweatRate', n ?? form.sweatRate)}
        />
        <NumberField
          label="Sodium target"
          value={form.sodiumTarget}
          suffix="mg/L"
          onChange={(n) => patch('sodiumTarget', n ?? form.sodiumTarget)}
        />
        <NumberField
          label="Quick-add volume 1"
          value={form.quickAddVolumes[0]}
          suffix="ml"
          onChange={(n) =>
            patch('quickAddVolumes', [
              n ?? form.quickAddVolumes[0],
              form.quickAddVolumes[1],
              form.quickAddVolumes[2],
            ])
          }
        />
        <NumberField
          label="Quick-add volume 2"
          value={form.quickAddVolumes[1]}
          suffix="ml"
          onChange={(n) =>
            patch('quickAddVolumes', [
              form.quickAddVolumes[0],
              n ?? form.quickAddVolumes[1],
              form.quickAddVolumes[2],
            ])
          }
        />
        <NumberField
          label="Quick-add volume 3"
          value={form.quickAddVolumes[2]}
          suffix="ml"
          onChange={(n) =>
            patch('quickAddVolumes', [
              form.quickAddVolumes[0],
              form.quickAddVolumes[1],
              n ?? form.quickAddVolumes[2],
            ])
          }
        />
      </SectionCard>

      <View className="mt-6">
        <Button
          label={saveMutation.isPending ? 'Saving…' : 'Save nutrition settings'}
          onPress={() => void onSave()}
          disabled={!dirty || saveMutation.isPending}
        />
      </View>
    </ScrollView>
  );
}
