import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

import type { ErrorBoundaryProps } from 'expo-router';

import { AuthProvider, useAuth } from '@/src/auth/AuthContext';
import { ActionSheetPortal } from '@/src/components/ActionSheet';
import { ErrorFallback } from '@/src/components/ErrorFallback';
import { Spinner } from '@/src/components/Spinner';
import { hideDevMenuFab } from '@/src/dev/hideDevMenuFab';
import { AuthAtmosphere } from '@/src/features/auth/AuthAtmosphere';
import { useDeepLinkReturn } from '@/src/linking/useDeepLinkReturn';
import { RevenueCatIdentityBridge } from '@/src/features/subscriptions/RevenueCatIdentityBridge';
import { initSentry } from '@/src/sentry';
import { ThemePreferenceBootstrap } from '@/src/theme/ThemePreferenceBootstrap';
import { useThemeColors } from '@/src/theme/useThemeColors';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorFallback error={error} retry={retry} />;
}

SplashScreen.preventAutoHideAsync();
initSentry();
hideDevMenuFab();

function RootNavigator() {
  const { status } = useAuth();
  const theme = useThemeColors();
  useDeepLinkReturn();

  useEffect(() => {
    if (status === 'loading') return;
    // Wait two frames so the first authenticated/auth screen paints before splash drops.
    let outer = 0;
    let inner = 0;
    outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        void SplashScreen.hideAsync();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [status]);

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <AuthAtmosphere />
        <Spinner size="large" />
      </View>
    );
  }

  return (
    <>
      <RevenueCatIdentityBridge />
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.surface },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(activation)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemePreferenceBootstrap>
      <AuthProvider>
        <RootNavigator />
        <ActionSheetPortal />
      </AuthProvider>
    </ThemePreferenceBootstrap>
  );
}
