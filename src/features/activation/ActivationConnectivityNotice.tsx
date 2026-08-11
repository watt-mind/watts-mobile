import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useIsOnline } from '@/src/hooks/useOfflineCached';

/**
 * Onboarding has no escape hatch before the connect step, so a connectivity
 * problem there reads as a frozen app. Surface it instead — the (app) screens
 * get the same treatment from OfflineBanner. (CW-466)
 */
export function ActivationConnectivityNotice() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <SafeAreaView
      testID="activation-offline-notice"
      accessibilityRole="alert"
      edges={['top']}
      className="border-b border-modify/40 bg-modify/10"
    >
      <Text className="px-6 py-2 text-sm text-modify">
        You’re offline — setup steps may fail until you reconnect.
      </Text>
    </SafeAreaView>
  );
}
