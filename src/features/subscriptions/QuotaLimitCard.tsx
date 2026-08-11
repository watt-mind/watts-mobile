/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthContext';
import { Button } from '@/src/components/Button';
import { APP_HREFS } from '@/src/linking/appHrefs';

import { trackPaywallEvent } from './analytics';
import { canAcquireNativeSubscription } from './gating';
import {
  quotaHeadline,
  quotaResetLine,
  quotaUpsellLine,
  quotaUsageLine,
  type QuotaInfo,
} from './quota';

type Props = {
  info: QuotaInfo;
  /** Where the limit was hit — used for paywall attribution. */
  surface: string;
  /** Rendered as a "Back"/"Not now" action when provided. */
  onDismiss?: () => void;
  /** Compact variant for inline slots (activity detail, sheets). */
  compact?: boolean;
  className?: string;
};

/**
 * The one plan-limit state in the app: what you hit, when it resets, what a
 * paid plan changes, and a route to the in-app paywall — never a dead end.
 */
export function QuotaLimitCard({ info, surface, onDismiss, compact = false, className }: Props) {
  const { instanceUrl } = useAuth();
  const canBuyInApp = canAcquireNativeSubscription(instanceUrl);

  const usage = quotaUsageLine(info);
  const reset = quotaResetLine(info);

  useEffect(() => {
    trackPaywallEvent('paywall_quota_blocked', { surface, feature: info.feature });
  }, [surface, info.feature]);

  const openUpgrade = () => {
    trackPaywallEvent('paywall_quota_cta_tapped', { surface, feature: info.feature });
    router.push(
      APP_HREFS.paywallForQuota(
        info.feature,
        info.requiredTier ? `quota_${info.requiredTier.toLowerCase()}` : 'quota',
      ) as Href,
    );
  };

  return (
    <View
      testID="quota-limit-card"
      accessibilityLiveRegion="polite"
      className={`rounded-2xl border border-modify/40 bg-modify/10 ${compact ? 'p-4' : 'p-5'} ${
        className ?? ''
      }`}
    >
      <Text className="text-xs font-semibold uppercase tracking-wide text-modify">Plan limit</Text>
      <Text className={`mt-2 font-semibold text-text-primary ${compact ? 'text-base' : 'text-lg'}`}>
        {quotaHeadline(info)}
      </Text>

      {usage ? <Text className="mt-2 text-sm leading-5 text-text-body">{usage}</Text> : null}
      {reset ? <Text className="mt-1 text-sm text-text-muted">{reset}</Text> : null}
      <Text className="mt-2 text-sm leading-5 text-text-body">{quotaUpsellLine(info)}</Text>

      <View className={compact ? 'mt-4' : 'mt-5'}>
        {canBuyInApp ? (
          <Button label="See plans" onPress={openUpgrade} />
        ) : (
          <Text className="text-sm leading-5 text-text-muted">
            Plan changes are handled by the Coach Watts account this app is connected to.
          </Text>
        )}
        {onDismiss ? (
          <Pressable
            accessibilityRole="button"
            className="mt-3 items-center py-2"
            hitSlop={8}
            onPress={onDismiss}
          >
            <Text className="text-sm font-semibold text-text-muted">Not now</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
