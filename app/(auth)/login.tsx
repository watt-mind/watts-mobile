/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Link } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendlyError } from '@/src/api/errors';
import { authErrorMessage, isAuthCancellation } from '@/src/auth/authErrors';
import { getRedirectUri, isExpoGoRuntime } from '@/src/auth/oauth';
import { useAuth } from '@/src/auth/AuthContext';
import { Button } from '@/src/components/Button';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/src/features/account/paths';
import { AuthAtmosphere } from '@/src/features/auth/AuthAtmosphere';
import { useReduceMotion } from '@/src/hooks/useReduceMotion';

function EnterSection({
  order,
  reduceMotion,
  children,
}: {
  order: number;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  // Start nearly visible so we never flash a blank sheet while motion runs.
  const translateY = useSharedValue(reduceMotion ? 0 : 12);
  const opacity = useSharedValue(reduceMotion ? 1 : 0.94);

  useEffect(() => {
    if (reduceMotion) return;
    const delay = order * 70;
    translateY.value = withDelay(delay, withTiming(0, { duration: 320 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 320 }));
  }, [opacity, order, reduceMotion, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function LoginScreen() {
  const { instanceUrl, defaultInstanceUrl, signIn, error, clearError, saveInstance } = useAuth();
  const reduceMotion = useReduceMotion();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /** Dev OAuth URI only after intentional reveal — never on first paint. */
  const [showDevDetails, setShowDevDetails] = useState(false);

  const onSignIn = async () => {
    clearError();
    setLocalError(null);
    setBusy(true);
    try {
      await signIn();
    } catch (err) {
      if (!isAuthCancellation(err)) {
        setLocalError(authErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const message = localError || error;
  const isDefault = !instanceUrl || instanceUrl === defaultInstanceUrl;
  const canRevealDev = __DEV__ || isExpoGoRuntime();

  return (
    <SafeAreaView testID="login-screen" className="flex-1 bg-surface">
      <AuthAtmosphere />

      <View className="flex-1 justify-center px-6">
        <EnterSection order={0} reduceMotion={reduceMotion}>
          <Pressable
            accessibilityRole="image"
            accessibilityLabel="Coach Watts"
            onLongPress={() => {
              if (canRevealDev) setShowDevDetails((v) => !v);
            }}
            delayLongPress={800}
          >
            <Image
              source={require('../../assets/images/icon.png')}
              accessibilityIgnoresInvertColors
              style={{
                width: 88,
                height: 88,
                borderRadius: 20,
                marginBottom: 24,
              }}
              resizeMode="cover"
            />
          </Pressable>
        </EnterSection>

        <EnterSection order={1} reduceMotion={reduceMotion}>
          <Text className="text-xs font-semibold uppercase tracking-widest text-brand">
            Endurance coaching
          </Text>
          <Text className="mt-2 text-3xl font-semibold text-text-primary">Coach Watts</Text>
          <Text className="mt-2 text-base leading-6 text-text-muted">
            Create an account or sign in. Set your goal and plan on this device — your session stays
            here.
          </Text>
        </EnterSection>

        {!isDefault ? (
          <EnterSection order={2} reduceMotion={reduceMotion}>
            <View className="mt-8 rounded-xl border border-border bg-card/90 p-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Instance
              </Text>
              <Text className="mt-1 text-base text-text-primary" numberOfLines={2}>
                {instanceUrl}
              </Text>
              <View className="mt-3 flex-row gap-4">
                <Link href="/(auth)/instance" asChild>
                  <Pressable hitSlop={8}>
                    <Text className="text-sm font-medium text-brand">Change URL</Text>
                  </Pressable>
                </Link>
                <Pressable
                  hitSlop={8}
                  onPress={async () => {
                    try {
                      setBusy(true);
                      await saveInstance(defaultInstanceUrl);
                    } catch (err) {
                      setLocalError(friendlyError(err, 'Failed to restore default'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Text className="text-sm font-medium text-danger">Use hosted default</Text>
                </Pressable>
              </View>
            </View>
          </EnterSection>
        ) : null}

        {message ? (
          <EnterSection order={2} reduceMotion={reduceMotion}>
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="mt-4 text-sm text-danger"
            >
              {message}
            </Text>
          </EnterSection>
        ) : null}

        <EnterSection order={3} reduceMotion={reduceMotion}>
          <Button
            testID="login-continue"
            className="mt-8"
            label={message ? 'Try again' : 'Continue'}
            onPress={() => void onSignIn()}
            loading={busy}
            disabled={busy}
          />
          <Text className="mt-3 text-center text-sm leading-5 text-text-muted">
            Continue to sign in or create your account securely in the system browser.
          </Text>
          <Text
            testID="login-legal-notice"
            className="mt-4 text-center text-xs leading-5 text-text-muted"
          >
            By continuing, you agree to our{' '}
            <Text
              className="font-medium text-brand"
              onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)}
              accessibilityRole="link"
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              className="font-medium text-brand"
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </EnterSection>

        {isDefault ? (
          <EnterSection order={4} reduceMotion={reduceMotion}>
            <Link href="/(auth)/instance" asChild>
              <Pressable className="mt-6 self-center" hitSlop={8}>
                <Text className="text-sm font-medium text-brand">Use self-hosted instance</Text>
              </Pressable>
            </Link>
          </EnterSection>
        ) : null}

        {canRevealDev && showDevDetails ? (
          <View className="mt-8 rounded-xl border border-border bg-card/90 p-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Developer
            </Text>
            <Text selectable className="mt-2 text-xs leading-5 text-text-muted">
              Redirect URI:{'\n'}
              {getRedirectUri()}
              {isExpoGoRuntime()
                ? '\n\nExpo Go — register this exp:// URI if sign-in fails with redirect_uri mismatch.'
                : '\n\nExpected: coachwatts://oauth/callback'}
            </Text>
            <Pressable hitSlop={8} className="mt-2" onPress={() => setShowDevDetails(false)}>
              <Text className="text-xs font-medium text-brand">Hide</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
