/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app
 * pre-emit critique: P4 H4 E5 S4 R5 V4 — sheet form, chip rows, shared create/edit
 */
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { BottomSheet } from '@/src/components/BottomSheet';
import { Button } from '@/src/components/Button';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';

import { formatDayChipLabel } from './formatPlanCopy';
import { useCreatePlannedWorkoutMutation, usePatchPlannedWorkoutMutation } from './usePlans';
import {
  buildSessionEditorPatch,
  emptySessionEditorForm,
  sessionEditorFormFromValues,
  sessionSportChoices,
  sessionSportLabel,
  validateSessionEditorForm,
  type SessionEditorForm,
} from './sessionEditor';

type CreateMode = {
  mode: 'create';
  dateKey: string;
  weekDayKeys: string[];
  trainingWeekId?: string;
};

type EditMode = {
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
  visible: boolean;
  onClose: () => void;
  context: CreateMode | EditMode | null;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  testID,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
  testID?: string;
  error?: string;
}) {
  const theme = useThemeColors();
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-text-muted">{label}</Text>
      <TextInput
        testID={testID}
        className={`rounded-xl border bg-card px-3 py-2.5 text-text-primary ${
          multiline ? 'min-h-[72px]' : ''
        } ${error ? 'border-danger' : 'border-border-strong'}`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
      />
      {error ? <Text className="mt-1 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}

function EditorBody({ context, onClose }: { context: CreateMode | EditMode; onClose: () => void }) {
  const createMutation = useCreatePlannedWorkoutMutation();
  const patchMutation = usePatchPlannedWorkoutMutation();
  const [initial] = useState<SessionEditorForm>(() =>
    context.mode === 'create'
      ? emptySessionEditorForm(context.dateKey)
      : sessionEditorFormFromValues(context),
  );
  const [form, setForm] = useState<SessionEditorForm>(initial);
  const sportChoices = sessionSportChoices(initial.type);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'title' | 'type' | 'durationMinutes' | 'dateKey' | 'tss', string>>
  >({});
  const [error, setError] = useState<string | null>(null);

  const weekDays =
    context.mode === 'create'
      ? context.weekDayKeys
      : (context.weekDayKeys ?? (context.dateKey ? [context.dateKey] : []));
  const busy = createMutation.isPending || patchMutation.isPending;

  const setType = (type: string) => {
    hapticLight();
    setForm((prev) => ({ ...prev, type }));
    setFieldErrors((prev) => ({ ...prev, type: undefined }));
  };

  const onSave = async () => {
    // In edit mode a session may be stored with no sport at all — don't force the athlete
    // to invent one (and don't block a title fix) just to save (CW-487).
    const result = validateSessionEditorForm(form, { requireType: context.mode === 'create' });
    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      return;
    }
    setFieldErrors({});
    setError(null);
    try {
      if (context.mode === 'create') {
        await createMutation.mutateAsync({
          date: result.payload.dateKey,
          title: result.payload.title,
          type: result.payload.type,
          durationSec: result.payload.durationSec,
          tss: result.payload.tss,
          description: result.payload.description,
          trainingWeekId: context.trainingWeekId,
        });
      } else {
        // Sparse patch: only fields the athlete saw and changed (CW-486).
        const input = buildSessionEditorPatch(initial, result.payload);
        if (Object.keys(input).length === 0) {
          onClose();
          return;
        }
        await patchMutation.mutateAsync({ id: context.plannedId, input });
      }
      hapticSuccess();
      onClose();
    } catch (err) {
      hapticError();
      setError(friendlyError(err, 'Could not save session'));
    }
  };

  return (
    <>
      <Text className="mb-1 text-lg font-semibold text-text-primary">
        {context.mode === 'create' ? 'Add session' : 'Edit session'}
      </Text>
      <Text className="mb-3 text-sm text-text-muted">Title, sport, and duration are required.</Text>

      {weekDays.length > 1 ? (
        <View className="mb-3">
          <Text className="mb-1 text-sm font-medium text-text-muted">Day</Text>
          <View className="flex-row flex-wrap gap-2" testID="plan-session-editor-day">
            {weekDays.map((day) => {
              const selected = form.dateKey === day;
              return (
                <AnimatedPressable
                  key={day}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={formatDayChipLabel(day)}
                  className={`rounded-xl border px-3 py-2 ${
                    selected ? 'border-brand bg-brand/10' : 'border-border bg-card'
                  }`}
                  onPress={() => {
                    hapticLight();
                    setForm((prev) => ({ ...prev, dateKey: day }));
                  }}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected ? 'text-brand' : 'text-text-muted'
                    }`}
                  >
                    {formatDayChipLabel(day)}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
          {fieldErrors.dateKey ? (
            <Text className="mt-1 text-xs text-danger">{fieldErrors.dateKey}</Text>
          ) : null}
        </View>
      ) : null}

      <Field
        label="Title"
        value={form.title}
        onChangeText={(title) => {
          setForm((prev) => ({ ...prev, title }));
          setFieldErrors((prev) => ({ ...prev, title: undefined }));
        }}
        placeholder="e.g. Club ride"
        testID="plan-session-editor-title"
        error={fieldErrors.title}
      />

      <Text className="mb-1 text-sm font-medium text-text-muted">Sport</Text>
      <View className="mb-3 flex-row flex-wrap gap-2" testID="plan-session-editor-type">
        {sportChoices.map((option) => {
          const selected = form.type === option.value;
          return (
            <AnimatedPressable
              key={option.value}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              className={`rounded-xl border px-3 py-2 ${
                selected ? 'border-brand bg-brand/10' : 'border-border bg-card'
              }`}
              onPress={() => setType(option.value)}
            >
              <Text
                className={`text-xs font-semibold ${selected ? 'text-brand' : 'text-text-muted'}`}
              >
                {option.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
      {sportChoices.some((choice) => choice.preserved) ? (
        <Text className="mb-2 text-xs text-text-muted" testID="plan-session-editor-type-preserved">
          {`Saved as ${sessionSportLabel(initial.type)} — kept unless you pick another sport.`}
        </Text>
      ) : null}
      {fieldErrors.type ? (
        <Text className="mb-2 text-xs text-danger">{fieldErrors.type}</Text>
      ) : null}

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Field
            label="Duration (min)"
            value={form.durationMinutes}
            onChangeText={(durationMinutes) => {
              setForm((prev) => ({ ...prev, durationMinutes }));
              setFieldErrors((prev) => ({ ...prev, durationMinutes: undefined }));
            }}
            keyboardType="number-pad"
            testID="plan-session-editor-duration"
            error={fieldErrors.durationMinutes}
          />
        </View>
        <View className="flex-1">
          <Field
            label="TSS (optional)"
            value={form.tss}
            onChangeText={(tss) => {
              setForm((prev) => ({ ...prev, tss }));
              setFieldErrors((prev) => ({ ...prev, tss: undefined }));
            }}
            keyboardType="number-pad"
            testID="plan-session-editor-tss"
            error={fieldErrors.tss}
          />
        </View>
      </View>

      <Field
        label="Description (optional)"
        value={form.description}
        onChangeText={(description) => setForm((prev) => ({ ...prev, description }))}
        multiline
        testID="plan-session-editor-description"
      />

      {error ? (
        <Text className="mb-2 text-sm text-danger" testID="plan-session-editor-error">
          {error}
        </Text>
      ) : null}

      <Button
        label="Save"
        testID="plan-session-editor-save"
        loading={busy}
        disabled={busy}
        onPress={() => void onSave()}
      />
      <View className="mt-2">
        <Button label="Cancel" variant="secondary" disabled={busy} onPress={onClose} />
      </View>
    </>
  );
}

export function PlanSessionEditorSheet({ visible, onClose, context }: Props) {
  return (
    <BottomSheet
      visible={visible && context != null}
      onClose={onClose}
      keyboard
      testID="plan-session-editor-sheet"
    >
      {context ? (
        <EditorBody
          key={
            context.mode === 'create' ? `create:${context.dateKey}` : `edit:${context.plannedId}`
          }
          context={context}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}
