/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Redirect, Stack, useSegments, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/src/auth/AuthContext';
import { Skeleton, SkeletonScreen } from '@/src/components/Skeleton';
import { ActivationConnectivityNotice } from '@/src/features/activation/ActivationConnectivityNotice';
import { ActivationUnavailable } from '@/src/features/activation/ActivationUnavailable';
import { activationStepRank, canDismissActivationError } from '@/src/features/activation/mapStatus';
import {
  activationHrefForStatus,
  useActivationStatus,
} from '@/src/features/activation/useActivationStatus';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { useThemeColors } from '@/src/theme/useThemeColors';

export default function ActivationLayout() {
  const { status } = useAuth();
  const theme = useThemeColors();
  const segments = useSegments();
  const activationQuery = useActivationStatus(status === 'authenticated');
  const [dismissedStatusError, setDismissedStatusError] = useState(false);

  if (status === 'needs_instance') {
    return <Redirect href="/(auth)/instance" />;
  }
  if (status === 'needs_login') {
    return <Redirect href="/(auth)/login" />;
  }
  if (status === 'loading') {
    return null;
  }

  if (activationQuery.isLoading && !activationQuery.data) {
    return (
      <SkeletonScreen>
        <View className="flex-1 bg-surface px-6 pt-4">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-8 h-28 rounded-xl" />
          <Skeleton className="mt-4 h-12 rounded-xl" />
        </View>
      </SkeletonScreen>
    );
  }
  if (activationQuery.isError) {
    if (dismissedStatusError) {
      return <Redirect href={APP_HREFS.today as Href} />;
    }
    // A cached status (last successful fetch) still tells us whether this athlete is
    // soft-activated / connect-only, so a transient status-refresh failure can offer
    // a way in rather than a hard block for them.
    const canDismiss = canDismissActivationError(activationQuery.data);
    return (
      <ActivationUnavailable
        error={activationQuery.error}
        isFetching={activationQuery.isFetching}
        onRetry={() => void activationQuery.refetch()}
        onDismiss={canDismiss ? () => setDismissedStatusError(true) : undefined}
      />
    );
  }

  const activation = activationQuery.data;
  const currentStep = segments[segments.length - 1];
  if (activation?.fullyActivated) {
    return <Redirect href={APP_HREFS.today as Href} />;
  }
  if (activation?.supportsActivation) {
    const requiredHref = activation.softActivated
      ? '/(activation)/connect'
      : activationHrefForStatus(activation);
    const requiredStep = requiredHref?.split('/').pop();
    if (requiredHref && currentStep !== requiredStep) {
      const currentRank = activationStepRank(currentStep);
      const requiredRank = activationStepRank(requiredStep);
      // Resume when behind (or on a non-step route like the activation index).
      // Allow ahead so optimistic advances are not bounced while status lags.
      const shouldRedirect = currentRank < 0 || (requiredRank >= 0 && currentRank < requiredRank);
      if (shouldRedirect) {
        return <Redirect href={requiredHref as Href} />;
      }
    }
  }

  return (
    <View className="flex-1 bg-surface">
      <ActivationConnectivityNotice />
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.textPrimary,
          contentStyle: { backgroundColor: theme.surface },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="consent" options={{ title: 'Welcome' }} />
        <Stack.Screen name="goal" options={{ title: 'Your goal' }} />
        <Stack.Screen name="plan" options={{ title: 'Training plan' }} />
        <Stack.Screen name="insight" options={{ title: 'Your week' }} />
        <Stack.Screen name="connect" options={{ title: 'Connect data' }} />
      </Stack>
    </View>
  );
}
