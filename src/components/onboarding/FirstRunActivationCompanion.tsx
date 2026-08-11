import { router, type Href } from 'expo-router';
import { Text, View } from 'react-native';

import { AppSymbol } from '@/src/components/AppSymbol';
import { Button } from '@/src/components/Button';
import { useActivationStatus } from '@/src/features/activation/useActivationStatus';
import { hapticLight } from '@/src/lib/haptics';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { useThemeColors } from '@/src/theme/useThemeColors';

export type FirstRunActivationCompanionProps = {
  /** Optional custom title header */
  title?: string;
  /** Optional custom subtitle body text */
  subtitle?: string;
  /** Visual presentation mode: 'card' for in-feed banner, 'full' for tab empty-state */
  variant?: 'card' | 'full';
  /** Custom handler for Health Sync / Wearable connection */
  onConnectHealth?: () => void;
  /** Custom handler for Connected Apps */
  onConnectApps?: () => void;
  /** Custom handler for Logging first workout / check-in */
  onLogActivity?: () => void;
  /** Custom handler for Asking Coach Watts */
  onAskCoach?: () => void;
  /** When true, automatically returns null if user has usable data */
  hideIfHasData?: boolean;
  /** Test identifier */
  testID?: string;
  /** Custom root style class names */
  className?: string;
};

/**
 * Friendly empty state activation companion component for first-run zero-data athletes.
 * Guides new or zero-data users to connect wearables, setup goals, or log their first activity.
 */
export function FirstRunActivationCompanion({
  title = 'Welcome to Coach Watts! 👋',
  subtitle = 'Your personalized AI endurance coach is ready. Connect your health data or log an activity to unlock real-time recovery, strain, and workout guidance.',
  variant = 'card',
  onConnectHealth,
  onConnectApps,
  onLogActivity,
  onAskCoach,
  hideIfHasData = true,
  testID = 'first-run-activation-companion',
  className,
}: FirstRunActivationCompanionProps) {
  const { data: activation } = useActivationStatus();
  // Called before the early return below so hook order stays stable.
  const theme = useThemeColors();

  // If set to hide when data exists and user already has usable data, render nothing
  if (hideIfHasData && activation?.hasUsableData) {
    return null;
  }

  const handleConnectHealth = () => {
    hapticLight();
    if (onConnectHealth) {
      onConnectHealth();
    } else {
      router.push(APP_HREFS.settingsHealth as Href);
    }
  };

  const handleConnectApps = () => {
    hapticLight();
    if (onConnectApps) {
      onConnectApps();
    } else {
      router.push(APP_HREFS.settingsConnectedApps as Href);
    }
  };

  const handleLogActivity = () => {
    hapticLight();
    if (onLogActivity) {
      onLogActivity();
    } else {
      router.push(APP_HREFS.log as Href);
    }
  };

  const handleAskCoach = () => {
    hapticLight();
    if (onAskCoach) {
      onAskCoach();
    } else {
      router.push(APP_HREFS.coach as Href);
    }
  };

  const isFullVariant = variant === 'full';

  return (
    <View
      testID={testID}
      className={`rounded-2xl border border-border bg-card p-5 ${
        isFullVariant ? 'my-6 items-center text-center' : 'mb-4'
      } ${className ?? ''}`}
    >
      {/* Icon Badge */}
      <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-brand/10">
        <AppSymbol sf="bolt.fill" size={24} tintColor={theme.successOnSurface} fallback="⚡" />
      </View>

      {/* Header & Subtitle */}
      <Text
        className={`text-lg font-bold text-text-primary ${
          isFullVariant ? 'text-center' : 'text-left'
        }`}
      >
        {title}
      </Text>
      <Text
        className={`mt-1 text-sm leading-5 text-text-muted ${
          isFullVariant ? 'text-center' : 'text-left'
        }`}
      >
        {subtitle}
      </Text>

      {/* Quick Setup Checklist */}
      <View className="my-4 gap-2.5 rounded-xl border border-border/50 bg-surface p-3.5">
        <View className="flex-row items-center gap-2.5">
          <AppSymbol sf="heart.fill" size={16} tintColor={theme.dangerOnSurface} fallback="❤️" />
          <Text className="flex-1 text-xs font-medium text-text-primary">
            1. Sync Health data (Apple Health / Garmin / Strava)
          </Text>
        </View>
        <View className="flex-row items-center gap-2.5">
          <AppSymbol
            sf="figure.run"
            size={16}
            tintColor={theme.macroProteinOnSurface}
            fallback="🏃"
          />
          <Text className="flex-1 text-xs font-medium text-text-primary">
            2. Log your first workout or daily check-in
          </Text>
        </View>
        <View className="flex-row items-center gap-2.5">
          <AppSymbol
            sf="bubble.left.and.bubble.right"
            size={16}
            tintColor={theme.macroFatOnSurface}
            fallback="💬"
          />
          <Text className="flex-1 text-xs font-medium text-text-primary">
            3. Chat with Coach Watts for personalized training targets
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View className="gap-2">
        <Button
          label="Connect Health Sync"
          onPress={handleConnectHealth}
          testID="companion-connect-health-btn"
        />
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              variant="secondary"
              label="Log Activity"
              onPress={handleLogActivity}
              testID="companion-log-activity-btn"
            />
          </View>
          <View className="flex-1">
            <Button
              variant="secondary"
              label="Ask Coach"
              onPress={handleAskCoach}
              testID="companion-ask-coach-btn"
            />
          </View>
        </View>
      </View>
    </View>
  );
}
