/* Hallmark · component: date-ymd-field · genre: modern-minimal · design-system: docs/DESIGN.md
 * states: default · press · focus (sheet) · disabled · selected chips · confirm
 */
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useMemo, useState } from 'react';
import { Platform, Text, useColorScheme, View } from 'react-native';

import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { BottomSheet } from '@/src/components/BottomSheet';
import { Button } from '@/src/components/Button';
import { localDateYmd } from '@/src/lib/date';
import { addLocalMonthsYmd, isValidCalendarYmd } from '@/src/features/log/mapLogForm';
import { hapticLight } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';

const PRESETS = [
  { months: 1, label: '+1 mo' },
  { months: 3, label: '+3 mo' },
  { months: 6, label: '+6 mo' },
] as const;

type Props = {
  value: string;
  onChange: (ymd: string) => void;
  label?: string;
  /** Earliest selectable day (local). Defaults to today. */
  minimumDate?: Date;
  testID?: string;
  disabled?: boolean;
};

function ymdToLocalDate(ymd: string): Date | null {
  if (!isValidCalendarYmd(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYmdLabel(ymd: string): string {
  const date = ymdToLocalDate(ymd);
  if (!date) return 'Pick a date';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DateYmdField({
  value,
  onChange,
  label = 'Target date',
  minimumDate,
  testID,
  disabled = false,
}: Props) {
  const theme = useThemeColors();
  const scheme = useColorScheme();
  const [open, setOpen] = useState(false);
  const [draftYmd, setDraftYmd] = useState(value);

  const minDate = useMemo(() => minimumDate ?? ymdToLocalDate(localDateYmd())!, [minimumDate]);
  const pickerValue = useMemo(() => {
    const fromDraft = ymdToLocalDate(draftYmd);
    if (fromDraft) return fromDraft;
    const fromValue = ymdToLocalDate(value);
    return fromValue ?? minDate;
  }, [draftYmd, value, minDate]);

  const applyYmd = (ymd: string) => {
    onChange(ymd);
    hapticLight();
  };

  const openPicker = () => {
    if (disabled) return;
    hapticLight();
    setDraftYmd(isValidCalendarYmd(value) ? value : localDateYmd());
    setOpen(true);
  };

  const closePicker = () => setOpen(false);

  const confirmDraft = () => {
    const next = isValidCalendarYmd(draftYmd) ? draftYmd : localDateYmd(pickerValue);
    applyYmd(next);
    setOpen(false);
  };

  return (
    <View>
      <Text className="text-sm font-medium text-text-muted">{label}</Text>
      <AnimatedPressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatYmdLabel(value)}`}
        accessibilityState={{ disabled }}
        hitSlop={8}
        disabled={disabled}
        onPress={openPicker}
        className={`mt-2 rounded-xl border border-border-strong bg-card px-4 py-3 ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        <Text className="text-base font-medium text-text-primary">{formatYmdLabel(value)}</Text>
        <Text className="mt-0.5 text-xs text-text-muted">
          {isValidCalendarYmd(value) ? value : 'Tap to choose'}
        </Text>
      </AnimatedPressable>

      <View className="mt-2 flex-row flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const ymd = addLocalMonthsYmd(preset.months);
          const selected = value === ymd;
          return (
            <AnimatedPressable
              key={preset.months}
              testID={testID ? `${testID}-preset-${preset.months}` : undefined}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              hitSlop={8}
              disabled={disabled}
              onPress={() => applyYmd(ymd)}
              className={`rounded-xl border px-3 py-2 ${
                selected ? 'border-brand bg-brand/15' : 'border-border bg-card/60'
              } ${disabled ? 'opacity-50' : ''}`}
            >
              <Text
                className={`text-sm font-semibold ${selected ? 'text-brand' : 'text-text-primary'}`}
              >
                {preset.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>

      {Platform.OS === 'android' && open ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          presentation="dialog"
          minimumDate={minDate}
          accentColor={theme.brandOnSurface}
          onValueChange={(_event, selected) => {
            setOpen(false);
            if (selected) applyYmd(localDateYmd(selected));
          }}
          onDismiss={closePicker}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <BottomSheet
          visible={open}
          onClose={closePicker}
          scroll={false}
          testID={testID ? `${testID}-sheet` : undefined}
        >
          <Text className="mb-3 text-base font-semibold text-text-primary">{label}</Text>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="inline"
            minimumDate={minDate}
            accentColor={theme.brandOnSurface}
            themeVariant={scheme === 'light' ? 'light' : 'dark'}
            onValueChange={(_event, selected) => {
              if (selected) setDraftYmd(localDateYmd(selected));
            }}
          />
          <Button
            className="mt-4"
            label="Done"
            onPress={confirmDraft}
            testID={testID ? `${testID}-done` : undefined}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}
