import { Redirect, Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useAuth } from '@/src/auth/AuthContext';
import { ActivationGate } from '@/src/features/activation/ActivationGate';
import { PushNotificationsBootstrap } from '@/src/features/notifications/PushNotificationsBootstrap';
import { HealthSyncRunner } from '@/src/features/health/HealthSyncRunner';
import { OfflineWellnessFlush } from '@/src/features/log/OfflineWellnessFlush';
import { ScanMealQuickActionBridge } from '@/src/linking/ScanMealQuickActionBridge';
import { useThemeColors } from '@/src/theme/useThemeColors';

/**
 * Keep the tabs under every pushed (app) route so a direct push into this stack
 * — e.g. activation's "Set up Health Sync" → /(app)/health-sync — always has a
 * back target instead of stranding the athlete on a lone screen.
 */
export const unstable_settings = {
  anchor: '(tabs)',
};

/** The health screen is named for the platform integration the athlete recognises. */
const HEALTH_PLATFORM_TITLE = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

export default function AppLayout() {
  const { status } = useAuth();
  const theme = useThemeColors();

  if (status === 'needs_instance') {
    return <Redirect href="/(auth)/instance" />;
  }

  if (status === 'needs_login') {
    return <Redirect href="/(auth)/login" />;
  }

  if (status === 'loading') {
    return null;
  }

  return (
    <ActivationGate>
      <PushNotificationsBootstrap />
      <OfflineWellnessFlush />
      <HealthSyncRunner />
      <ScanMealQuickActionBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.textPrimary,
          contentStyle: { backgroundColor: theme.surface },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="daily-checkin"
          options={{
            headerShown: false,
            title: 'Coach check-in',
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="recovery-event"
          options={{
            headerShown: true,
            title: 'Recovery event',
            presentation: 'modal',
          }}
        />
        <Stack.Screen name="athlete" options={{ headerShown: true, title: 'Athlete' }} />
        <Stack.Screen name="invite" options={{ headerShown: false, title: 'Invite a friend' }} />
        <Stack.Screen
          name="activity/index"
          options={{ headerShown: true, title: 'Activity history' }}
        />
        <Stack.Screen name="activity/[id]" options={{ headerShown: true, title: 'Activity' }} />
        <Stack.Screen name="planned/[id]" options={{ headerShown: true, title: 'Workout' }} />
        <Stack.Screen
          name="upcoming/index"
          options={{ headerShown: true, title: 'Upcoming workouts' }}
        />
        <Stack.Screen name="events/index" options={{ headerShown: true, title: 'Events' }} />
        <Stack.Screen
          name="events/new"
          options={{ headerShown: true, title: 'New event', presentation: 'modal' }}
        />
        <Stack.Screen name="events/[id]" options={{ headerShown: true, title: 'Event' }} />
        <Stack.Screen name="goals/index" options={{ headerShown: true, title: 'Goals' }} />
        <Stack.Screen
          name="goals/new"
          options={{ headerShown: true, title: 'New goal', presentation: 'modal' }}
        />
        <Stack.Screen name="goals/[id]" options={{ headerShown: true, title: 'Goal' }} />
        <Stack.Screen
          name="plan/create"
          options={{ headerShown: true, title: 'Create plan', presentation: 'modal' }}
        />
        <Stack.Screen name="plan/blocks" options={{ headerShown: true, title: 'Edit blocks' }} />
        <Stack.Screen name="plan/grocery" options={{ headerShown: true, title: 'Grocery list' }} />
        <Stack.Screen
          name="health-sync"
          options={{ headerShown: true, title: HEALTH_PLATFORM_TITLE }}
        />
        <Stack.Screen
          name="health-history"
          options={{ headerShown: true, title: 'Sync history' }}
        />
        <Stack.Screen
          name="health-workouts"
          options={{ headerShown: true, title: 'Recent workouts' }}
        />
        <Stack.Screen
          name="connected-apps"
          options={{ headerShown: true, title: 'Connected apps' }}
        />
        <Stack.Screen
          name="paywall"
          options={{ headerShown: true, title: 'Upgrade', presentation: 'modal' }}
        />
        <Stack.Screen
          name="sports/index"
          options={{ headerShown: true, title: 'Sports & thresholds' }}
        />
        <Stack.Screen name="sports/[id]" options={{ headerShown: true, title: 'Sport profile' }} />
      </Stack>
    </ActivationGate>
  );
}
