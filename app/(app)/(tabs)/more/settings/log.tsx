/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack } from 'expo-router';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { type LogTabPreference, logTabPreferenceLabel } from '@/src/features/log/logTabPreference';
import { useLogTabPreference } from '@/src/features/log/useLogTabPreference';
import { type PhotoSourceMode } from '@/src/features/nutrition/photoMealSettings';
import { usePhotoMealSettings } from '@/src/features/nutrition/usePhotoMealSettings';
import { isNutritionTrackingEnabled } from '@/src/features/profile/mapProfile';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';
import { hapticLight } from '@/src/lib/haptics';
import { Colors } from '@/src/theme/colors';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { useTabScrollPadding } from '@/src/hooks/useTabScrollPadding';

const OPTIONS: {
  value: LogTabPreference;
  title: string;
  detail: string;
  needsNutrition?: boolean;
}[] = [
  {
    value: 'auto',
    title: 'Automatic',
    detail: 'Open the Log overview with nothing expanded.',
  },
  {
    value: 'nutrition',
    title: 'Nutrition',
    detail: 'Open Log with nutrition & hydration details expanded.',
    needsNutrition: true,
  },
  {
    value: 'wellness',
    title: 'Wellness',
    detail: 'Open Log with the daily wellness check-in ready.',
  },
  {
    value: 'measurements',
    title: 'Measurements',
    detail: 'Open Log with body measurement details expanded.',
  },
];

const PHOTO_MODE_OPTIONS: {
  value: PhotoSourceMode;
  title: string;
  detail: string;
}[] = [
  {
    value: 'ask',
    title: 'Ask every time',
    detail: 'Choose between Take Photo and Photo Library each time.',
  },
  {
    value: 'camera',
    title: 'Always open Camera',
    detail: 'Directly launch camera photo mode when tapping photo shortcuts.',
  },
  {
    value: 'library',
    title: 'Always open Photo Library',
    detail: 'Directly open device photo library when tapping photo shortcuts.',
  },
];

export default function LogSettingsScreen() {
  const theme = useThemeColors();
  const tabBottomPad = useTabScrollPadding();

  const { data: athleteProfile } = useAthleteProfileQuery();
  const nutritionEnabled = isNutritionTrackingEnabled(athleteProfile);
  const { preference, setPreference } = useLogTabPreference();
  const { sourceMode, setSourceMode, saveToLibrary, setSaveToLibrary } = usePhotoMealSettings();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Default log view',
          headerShown: true,
        }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }}>
        <ScrollView
          className="flex-1 bg-surface"
          contentContainerClassName="px-6 pt-4"
          contentContainerStyle={{ paddingBottom: tabBottomPad }}
        >
          <Text className="text-2xl font-semibold text-text-primary">Default log view</Text>
          <Text className="mt-2 text-sm text-text-muted">
            Choose what opens when you enter the Log tab. Deep links (Check in, Nutrition,
            Measurements) always win over this default.
          </Text>

          <View className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
            {OPTIONS.map((option, index) => {
              const disabled = Boolean(option.needsNutrition && !nutritionEnabled);
              const selected = preference === option.value;
              const isLast = index === OPTIONS.length - 1;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  className={`px-4 py-4 ${isLast ? '' : 'border-b border-border/80'} ${
                    disabled ? 'opacity-40' : 'active:opacity-80'
                  }`}
                  onPress={() => {
                    hapticLight();
                    void setPreference(option.value);
                  }}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text className="text-base font-semibold text-text-primary">
                        {option.title}
                      </Text>
                      <Text className="mt-1 text-sm text-text-muted">
                        {disabled
                          ? 'Turn on nutrition tracking in Coach Watts to use this default.'
                          : option.detail}
                      </Text>
                    </View>
                    <View
                      className="mt-1 h-5 w-5 items-center justify-center rounded-full border"
                      style={{
                        borderColor: selected ? Colors.brand : theme.textMuted,
                        backgroundColor: selected ? Colors.brand : 'transparent',
                      }}
                    >
                      {selected ? <View className="h-2 w-2 rounded-full bg-surface" /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text className="mt-4 text-sm text-text-muted">
            Current default: {logTabPreferenceLabel(preference, nutritionEnabled)}
          </Text>

          <Text className="mt-8 text-xl font-semibold text-text-primary">
            Meal Photo Camera Settings
          </Text>
          <Text className="mt-1 text-sm text-text-muted">
            Customize camera shortcut behavior and photo saving options.
          </Text>

          <View className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            {PHOTO_MODE_OPTIONS.map((option, index) => {
              const selected = sourceMode === option.value;
              const isLast = index === PHOTO_MODE_OPTIONS.length - 1;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-4 py-4 ${isLast ? '' : 'border-b border-border/80'} active:opacity-80`}
                  onPress={() => {
                    hapticLight();
                    void setSourceMode(option.value);
                  }}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text className="text-base font-semibold text-text-primary">
                        {option.title}
                      </Text>
                      <Text className="mt-1 text-sm text-text-muted">{option.detail}</Text>
                    </View>
                    <View
                      className="mt-1 h-5 w-5 items-center justify-center rounded-full border"
                      style={{
                        borderColor: selected ? Colors.brand : theme.textMuted,
                        backgroundColor: selected ? Colors.brand : 'transparent',
                      }}
                    >
                      {selected ? <View className="h-2 w-2 rounded-full bg-surface" /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-4 rounded-xl border border-border bg-card p-4">
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1">
                <Text className="text-base font-semibold text-text-primary">
                  Save Photos to Library
                </Text>
                <Text className="mt-1 text-xs text-text-muted">
                  Save photos taken with the in-app camera directly to your device photo library.
                </Text>
              </View>
              <Switch
                value={saveToLibrary}
                onValueChange={(val) => {
                  hapticLight();
                  void setSaveToLibrary(val);
                }}
                trackColor={{ false: theme.border, true: Colors.brand }}
                thumbColor={theme.surface}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
