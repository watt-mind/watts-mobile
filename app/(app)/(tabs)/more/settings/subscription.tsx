/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { useAuth } from '@/src/auth/AuthContext';
import { Button } from '@/src/components/Button';
import { Skeleton } from '@/src/components/Skeleton';
import { trackPaywallEvent } from '@/src/features/subscriptions/analytics';
import {
  formatProviderSubscriptionStatus,
  formatRenewalNotice,
} from '@/src/features/subscriptions/adapters';
import {
  canAcquireNativeSubscription,
  isOfficialHostedInstance,
} from '@/src/features/subscriptions/gating';
import {
  BILLING_SUPPORT_EMAIL,
  openExternalUrl,
  storeManagementUrl,
} from '@/src/features/subscriptions/links';
import { PlanChooser } from '@/src/features/subscriptions/PlanChooser';
import { isRevenueCatAvailable } from '@/src/features/subscriptions/revenueCat';
import {
  AutoRenewTerms,
  FeedbackBanner,
  LegalLinks,
  RestoreRow,
} from '@/src/features/subscriptions/SubscriptionChrome';
import type { SubscriptionProvider } from '@/src/features/subscriptions/types';
import { useStoreOfferings } from '@/src/features/subscriptions/useSubscriptions';
import { usePurchaseFlow } from '@/src/features/subscriptions/usePurchaseFlow';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { useTabScrollPadding } from '@/src/hooks/useTabScrollPadding';

const providerLabels: Record<SubscriptionProvider, string> = {
  APPLE: 'Apple App Store',
  GOOGLE: 'Google Play',
  STRIPE: 'Coach Watts web',
};

export default function SubscriptionScreen() {
  const theme = useThemeColors();
  const tabBottomPad = useTabScrollPadding();
  const { instanceUrl } = useAuth();
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
  } = usePurchaseFlow('settings');
  const offerings = useStoreOfferings(acquisitionEnabled && !summary.data?.acquisitionSuppressed);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    trackPaywallEvent('paywall_viewed', { source: 'settings' });
  }, []);

  // The banner lives at the top of the scroll; bring it into view when it changes
  // so a purchase result is never announced off-screen.
  useEffect(() => {
    if (feedback) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [feedback]);

  const openLink = async (url: string) => {
    const result = await openExternalUrl(url);
    if (!result.ok) setFeedback({ type: 'error', text: result.message });
  };

  const currentTier = summary.data?.tier ?? 'FREE';
  const hasSubscriptions = (summary.data?.subscriptions.length ?? 0) > 0;
  const showPlans = acquisitionEnabled && !summary.data?.acquisitionSuppressed;

  return (
    <>
      <Stack.Screen options={{ title: 'Subscription' }} />
      <SafeAreaView
        testID="subscription-screen"
        style={{ flex: 1, backgroundColor: theme.surface }}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1 bg-surface"
          contentContainerClassName="px-6 pt-5"
          contentContainerStyle={{ paddingBottom: tabBottomPad }}
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

          {/* Current Access */}
          <View className="rounded-2xl border border-border bg-card p-5">
            <Text className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Current access
            </Text>
            {summary.isLoading ? (
              <View className="mt-4 gap-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </View>
            ) : null}
            {summary.isError ? (
              <View className="mt-3 rounded-xl border border-danger/40 bg-tint-error p-3">
                <Text className="text-sm text-danger">Could not load subscription status.</Text>
                <Pressable className="mt-2" hitSlop={8} onPress={() => void summary.refetch()}>
                  <Text className="text-sm font-semibold text-brand">Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {summary.data ? (
              <>
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="text-2xl font-bold text-text-primary">
                    {currentTier === 'PRO'
                      ? 'Pro Plan'
                      : currentTier === 'SUPPORTER'
                        ? 'Supporter Plan'
                        : 'Free Plan'}
                  </Text>
                  {currentTier !== 'FREE' ? (
                    <View className="rounded-full border border-brand/30 bg-brand/15 px-3 py-1">
                      <Text className="text-xs font-semibold text-brand">Active Member</Text>
                    </View>
                  ) : null}
                </View>

                {summary.data.subscriptions.map((item) => {
                  const statusInfo = formatProviderSubscriptionStatus(item.status);
                  const renewalNotice = formatRenewalNotice(item.autoRenew, item.entitlementEnd);
                  const manageUrl = storeManagementUrl(item.provider, item.managementUrl);
                  return (
                    <View
                      key={`${item.provider}:${item.productId}`}
                      className="mt-4 border-t border-border pt-4"
                    >
                      <View className="flex-row items-center justify-between gap-3">
                        <Text className="flex-1 font-semibold text-text-primary">
                          {providerLabels[item.provider]}
                        </Text>
                        <Text className={`text-xs font-medium ${statusInfo.colorClass}`}>
                          {statusInfo.label}
                        </Text>
                      </View>

                      {renewalNotice ? (
                        <Text className="mt-1 text-sm text-text-muted">{renewalNotice}</Text>
                      ) : null}

                      {manageUrl ? (
                        <Button
                          className="mt-3"
                          label={
                            statusInfo.isUrgent ? 'Update payment method' : 'Manage subscription'
                          }
                          variant={statusInfo.isUrgent ? 'primary' : 'secondary'}
                          onPress={() => void openLink(manageUrl)}
                        />
                      ) : (
                        <Text className="mt-2 text-sm leading-5 text-text-muted">
                          This subscription is billed outside the app. Sign in to your Coach Watts
                          account in a web browser to change or cancel it.
                        </Text>
                      )}
                    </View>
                  );
                })}

                {/* Paid tier with no store record — access came from the web app. */}
                {!hasSubscriptions && currentTier !== 'FREE' ? (
                  <View className="mt-4 border-t border-border pt-4">
                    <Text className="font-semibold text-text-primary">Coach Watts Web</Text>
                    <Text className="mt-1 text-sm leading-5 text-text-muted">
                      Your subscription was activated outside the app, so billing and renewal are
                      handled there. Sign in to your Coach Watts account in a web browser to change
                      or cancel it.
                    </Text>
                  </View>
                ) : null}

                {!hasSubscriptions && currentTier === 'FREE' ? (
                  <Text className="mt-2 text-sm leading-5 text-text-muted">
                    Upgrade to Supporter or Pro to unlock personalized workout plans, recovery
                    tracking, and unlimited AI coaching.
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>

          {summary.data?.hasCollision ? (
            <View className="mt-4 rounded-xl border border-modify/40 bg-modify/10 p-4">
              <Text className="font-semibold text-text-primary">Multiple active subscriptions</Text>
              <Text className="mt-1 text-sm leading-5 text-text-muted">
                Your highest tier is active. Manage the subscription you no longer want with its
                provider above; Coach Watts will not cancel it automatically.
              </Text>
            </View>
          ) : null}

          {!hosted ? (
            <View className="mt-6 rounded-xl border border-border bg-card p-4">
              <Text className="font-semibold text-text-primary">Managed by this instance</Text>
              <Text className="mt-2 text-sm leading-5 text-text-muted">
                Store purchases and restores are available only on the official hosted Coach Watts
                service. This screen shows access reported by your current instance.
              </Text>
            </View>
          ) : null}

          {hosted && !acquisitionEnabled ? (
            <View className="mt-6 rounded-xl border border-border bg-card p-4">
              <Text className="font-semibold text-text-primary">
                Store subscriptions are not available yet
              </Text>
              <Text className="mt-2 text-sm leading-5 text-text-muted">
                Existing access remains active. In-app purchases will appear here once they are
                enabled for your account.
              </Text>
            </View>
          ) : null}

          {acquisitionEnabled && summary.data?.acquisitionSuppressed ? (
            <View className="mt-6 rounded-xl border border-border bg-card p-4">
              <Text className="font-semibold text-text-primary">Web subscription active</Text>
              <Text className="mt-2 text-sm leading-5 text-text-muted">
                In-app purchases stay disabled while your subscription is billed outside the app.
                Sign in to your Coach Watts account in a web browser to change or cancel it.
              </Text>
            </View>
          ) : null}

          {showPlans ? (
            <View className="mt-8">
              <Text className="text-2xl font-bold text-text-primary">
                {currentTier === 'FREE' ? 'Choose a plan' : 'Change plan'}
              </Text>
              <Text className="mt-1 text-sm leading-5 text-text-muted">
                Charged to your Apple ID or Google Play account. Subscriptions renew automatically
                unless canceled before renewal.
              </Text>

              <PlanChooser
                packages={offerings.data}
                summary={summary.data}
                isLoading={offerings.isLoading}
                error={offerings.isError ? offerings.error : null}
                busyPackageId={busyPackageId}
                busy={Boolean(operation)}
                storeConfigured={rcAvailable}
                onPurchase={(pkg, kind) => void purchase(pkg, kind)}
                onRetry={() => void offerings.refetch()}
              />

              <AutoRenewTerms />
            </View>
          ) : null}

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
              testID="subscription-billing-support"
              accessibilityRole="link"
              accessibilityLabel="Contact billing support"
              hitSlop={8}
              onPress={() =>
                void openLink(`mailto:${BILLING_SUPPORT_EMAIL}?subject=Billing%20Support`)
              }
            >
              <Text className="text-sm font-semibold text-brand">Need help with billing?</Text>
            </Pressable>
          </View>

          <LegalLinks onOpen={(url) => void openLink(url)} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
