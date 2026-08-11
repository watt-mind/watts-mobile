/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { useAuth } from '@/src/auth/AuthContext';
import { Skeleton } from '@/src/components/Skeleton';
import { canShowPlanChooser, summaryQueryState } from '@/src/features/subscriptions/adapters';
import { trackPaywallEvent } from '@/src/features/subscriptions/analytics';
import {
  canAcquireNativeSubscription,
  isOfficialHostedInstance,
} from '@/src/features/subscriptions/gating';
import { openExternalUrl } from '@/src/features/subscriptions/links';
import { PlanChooser } from '@/src/features/subscriptions/PlanChooser';
import {
  parseQuotaFeature,
  quotaPaywallHeadline,
  quotaUpsellLine,
  type QuotaFeature,
} from '@/src/features/subscriptions/quota';
import { isRevenueCatAvailable } from '@/src/features/subscriptions/revenueCat';
import {
  AutoRenewTerms,
  FeedbackBanner,
  LegalLinks,
  RestoreRow,
} from '@/src/features/subscriptions/SubscriptionChrome';
import type { SubscriptionTier } from '@/src/features/subscriptions/types';
import { useStoreOfferings } from '@/src/features/subscriptions/useSubscriptions';
import { usePurchaseFlow } from '@/src/features/subscriptions/usePurchaseFlow';
import { useThemeColors } from '@/src/theme/useThemeColors';

function subline(feature: QuotaFeature): string {
  return quotaUpsellLine({ feature });
}

/**
 * Contextual paywall reached from a plan limit. Lives on the root `(app)` stack
 * so Back returns to whichever tab hit the limit; Settings keeps the fuller
 * billing-management screen.
 */
export default function PaywallScreen() {
  const theme = useThemeColors();
  const { instanceUrl } = useAuth();
  const params = useLocalSearchParams<{ source?: string; feature?: string; tier?: string }>();

  const feature = parseQuotaFeature(params.feature);
  const source = params.source ?? 'direct';
  const highlightTier: Exclude<SubscriptionTier, 'FREE'> =
    params.tier === 'SUPPORTER' ? 'SUPPORTER' : 'PRO';

  const hosted = isOfficialHostedInstance(instanceUrl);
  const acquisitionEnabled = canAcquireNativeSubscription(instanceUrl);
  const rcAvailable = isRevenueCatAvailable();

  const {
    summary,
    operation,
    busyPackageId,
    feedback,
    setFeedback,
    purchase,
    restore,
    isRestoring,
  } = usePurchaseFlow(source);
  const summaryState = summaryQueryState(summary);
  const showPlans = canShowPlanChooser({
    summaryState,
    acquisitionEnabled,
    acquisitionSuppressed: Boolean(summary.data?.acquisitionSuppressed),
  });
  const offerings = useStoreOfferings(showPlans);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    trackPaywallEvent('paywall_viewed', { source, feature });
  }, [source, feature]);

  useEffect(() => {
    if (feedback) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [feedback]);

  const openLink = async (url: string) => {
    const result = await openExternalUrl(url);
    if (!result.ok) setFeedback({ type: 'error', text: result.message });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Upgrade' }} />
      <SafeAreaView
        testID="paywall-screen"
        edges={{ bottom: true }}
        style={{ flex: 1, backgroundColor: theme.surface }}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1 bg-surface"
          contentContainerClassName="px-6 pb-12 pt-5"
          refreshControl={
            <RefreshControl
              refreshing={summary.isRefetching || offerings.isRefetching}
              onRefresh={() => {
                void summary.refetch();
                if (showPlans) void offerings.refetch();
              }}
              tintColor={theme.brandOnSurface}
            />
          }
        >
          {feedback ? (
            <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />
          ) : null}

          <Text className="text-2xl font-bold text-text-primary">
            {quotaPaywallHeadline(feature)}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-text-body">{subline(feature)}</Text>

          {showPlans ? (
            <>
              <PlanChooser
                packages={offerings.data}
                summary={summary.data}
                isLoading={offerings.isLoading}
                error={offerings.isError ? offerings.error : null}
                busyPackageId={busyPackageId}
                busy={Boolean(operation)}
                highlightTier={highlightTier}
                storeConfigured={rcAvailable}
                onPurchase={(pkg, kind) => void purchase(pkg, kind)}
                onRetry={() => void offerings.refetch()}
              />
              <AutoRenewTerms />
            </>
          ) : acquisitionEnabled && summaryState === 'pending' ? (
            // Wait on the subscription summary before deciding whether plans
            // (and their purchase CTAs) can even be shown — never show a buy
            // button while we don't yet know what the athlete already holds.
            <View className="mt-6 gap-3">
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-56 w-full rounded-2xl" />
              <Skeleton className="h-56 w-full rounded-2xl" />
            </View>
          ) : acquisitionEnabled && summaryState === 'error' ? (
            <View className="mt-6 rounded-2xl border border-border bg-card p-5">
              <Text className="font-semibold text-text-primary">
                Couldn’t confirm your subscription
              </Text>
              <Text className="mt-2 text-sm leading-5 text-text-muted">
                We couldn’t load your current subscription status, so purchases stay disabled for
                now. Pull down to refresh and try again.
              </Text>
            </View>
          ) : (
            <View className="mt-6 rounded-2xl border border-border bg-card p-5">
              <Text className="font-semibold text-text-primary">
                {summary.data?.acquisitionSuppressed
                  ? 'Your subscription is managed on the web'
                  : hosted
                    ? 'In-app purchases are unavailable in this build'
                    : 'Managed by this instance'}
              </Text>
              <Text className="mt-2 text-sm leading-5 text-text-muted">
                {summary.data?.acquisitionSuppressed
                  ? 'Your subscription is billed outside the app, so in-app purchases stay disabled. Sign in to your Coach Watts account in a web browser to change it.'
                  : hosted
                    ? 'In-app purchases will appear here once they are enabled for your account.'
                    : 'Your plan is managed by the instance this app is connected to.'}
              </Text>
            </View>
          )}

          {acquisitionEnabled && rcAvailable ? (
            <RestoreRow
              restoring={isRestoring}
              disabled={Boolean(operation)}
              onRestore={() => void restore()}
            />
          ) : null}

          {operation && !isRestoring ? (
            <Text className="mt-3 text-center text-xs text-text-muted">{operation}</Text>
          ) : null}

          <View className="mt-6 items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage subscription in settings"
              hitSlop={8}
              onPress={() => {
                router.back();
                router.push('/(app)/(tabs)/more/settings/subscription');
              }}
            >
              <Text className="text-sm font-semibold text-brand">
                Subscription & billing details
              </Text>
            </Pressable>
          </View>

          <LegalLinks onOpen={(url) => void openLink(url)} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
