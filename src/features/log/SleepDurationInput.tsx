import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AppSymbol } from '@/src/components/AppSymbol';
import { stepSleepHours } from '@/src/features/log/mapLogForm';
import { hapticLight } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';

const PRESET_HOURS = ['6', '6.5', '7', '7.5', '8', '8.5', '9'];

interface SleepDurationInputProps {
  value: string;
  isAutoSynced?: boolean;
  onChangeText: (v: string) => void;
  onStep?: (delta: number) => void;
}

export function SleepDurationInput({
  value,
  isAutoSynced = false,
  onChangeText,
  onStep,
}: SleepDurationInputProps) {
  const theme = useThemeColors();
  const [editing, setEditing] = useState(!isAutoSynced && !value);

  const handlePreset = (preset: string) => {
    hapticLight();
    onChangeText(preset);
  };

  const handleStep = (delta: number) => {
    hapticLight();
    onChangeText(stepSleepHours(value, delta));
    onStep?.(delta);
  };

  return (
    <View className="mt-4 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-semibold text-text-primary">Sleep Duration</Text>
          <Text className="mt-0.5 text-xs text-text-muted">Total hours slept last night</Text>
        </View>

        {value ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              hapticLight();
              setEditing((prev) => !prev);
            }}
          >
            <Text className="text-xs font-semibold text-brand">{editing ? 'Done' : 'Adjust'}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Auto-filled status badge */}
      {value && !editing ? (
        <View className="mt-3 flex-row items-center justify-between rounded-xl bg-surface p-3">
          <View className="flex-row items-center gap-2">
            <AppSymbol sf="moon.stars" size={16} tintColor={theme.brandOnSurface} fallback="🌙" />
            <Text className="text-base font-bold text-text-primary">
              {value} <Text className="text-xs font-normal text-text-muted">hours</Text>
            </Text>
          </View>
          {isAutoSynced ? (
            <View className="rounded bg-brand/15 px-2 py-0.5">
              <Text className="text-[10px] font-bold text-brand">Auto-Synced</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          {/* Quick preset duration pills */}
          <View className="mt-3 flex-row flex-wrap gap-2">
            {PRESET_HOURS.map((preset) => {
              const active = value.trim() === preset;
              return (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  accessibilityLabel={`${preset} hours`}
                  accessibilityState={{ selected: active }}
                  className="rounded-full px-3 py-1.5 active:opacity-80"
                  style={{
                    backgroundColor: active ? theme.borderStrong : theme.border,
                    borderWidth: active ? 1.5 : 1,
                    borderColor: active ? theme.textPrimary : 'transparent',
                  }}
                  onPress={() => handlePreset(preset)}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      active ? 'text-text-primary' : 'text-text-muted'
                    }`}
                  >
                    {preset} hrs
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Stepper + Input */}
          <View className="mt-4 flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease sleep hours by 0.5"
              className="h-11 w-11 items-center justify-center rounded-xl border border-border-strong bg-surface active:opacity-80"
              onPress={() => handleStep(-0.5)}
            >
              <Text className="text-xl font-bold text-text-primary">−</Text>
            </Pressable>
            <TextInput
              className="h-11 flex-1 rounded-xl border border-border-strong bg-surface px-4 py-2 text-center text-base font-semibold text-text-primary"
              placeholderTextColor={theme.textMuted}
              placeholder="7.5"
              value={value}
              onChangeText={onChangeText}
              keyboardType="decimal-pad"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase sleep hours by 0.5"
              className="h-11 w-11 items-center justify-center rounded-xl border border-border-strong bg-surface active:opacity-80"
              onPress={() => handleStep(0.5)}
            >
              <Text className="text-xl font-bold text-text-primary">+</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
