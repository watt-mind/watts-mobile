/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Pressable, Text, View } from 'react-native';

import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/src/features/account/paths';

import type { PurchaseFeedback } from './usePurchaseFlow';

export function FeedbackBanner({
  feedback,
  onDismiss,
}: {
  feedback: NonNullable<PurchaseFeedback>;
  onDismiss: () => void;
}) {
  const tone =
    feedback.type === 'error'
      ? { shell: 'border-danger/40 bg-tint-error', text: 'text-danger' }
      : feedback.type === 'success'
        ? { shell: 'border-emerald-500/40 bg-emerald-500/10', text: 'text-success' }
        : { shell: 'border-brand/40 bg-brand/10', text: 'text-text-primary' };

  return (
    <View
      accessibilityLiveRegion="polite"
      className={`mb-4 flex-row items-start gap-3 rounded-xl border p-4 ${tone.shell}`}
    >
      <Text className={`flex-1 text-sm font-medium leading-5 ${tone.text}`}>{feedback.text}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss message"
        hitSlop={12}
        onPress={onDismiss}
      >
        <Text className="text-sm font-semibold text-text-muted">✕</Text>
      </Pressable>
    </View>
  );
}

export function AutoRenewTerms() {
  return (
    <View className="mt-6 rounded-xl border border-border bg-card/60 p-4">
      <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Subscription & Auto-Renewal Terms
      </Text>
      <Text className="mt-2 text-xs leading-5 text-text-muted">
        • Payment is charged to your store account at confirmation of purchase.
      </Text>
      <Text className="mt-1.5 text-xs leading-5 text-text-muted">
        • Subscription automatically renews unless auto-renew is turned off in store settings at
        least 24 hours before the end of the current period.
      </Text>
      <Text className="mt-1.5 text-xs leading-5 text-text-muted">
        • Account will be charged for renewal within 24 hours prior to the end of the current period
        at the rate of the selected plan.
      </Text>
      <Text className="mt-1.5 text-xs leading-5 text-text-muted">
        • You can manage your subscription or turn off auto-renewal anytime in your store Account
        Settings after purchase.
      </Text>
    </View>
  );
}

export function RestoreRow({
  restoring,
  disabled,
  onRestore,
}: {
  restoring: boolean;
  disabled: boolean;
  onRestore: () => void;
}) {
  return (
    <View className="mt-8 items-center border-t border-border pt-6">
      <Text className="text-center text-xs text-text-muted">
        Already subscribed on Apple ID or Google Play?
      </Text>
      <Pressable
        testID="subscription-restore"
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
        accessibilityState={{ disabled, busy: restoring }}
        className="mt-2 px-4 py-2"
        hitSlop={8}
        disabled={disabled}
        onPress={onRestore}
      >
        <Text className={`text-sm font-semibold ${restoring ? 'text-text-muted' : 'text-brand'}`}>
          {restoring ? 'Restoring purchases…' : 'Restore Purchases'}
        </Text>
      </Pressable>
    </View>
  );
}

export function LegalLinks({ onOpen }: { onOpen: (url: string) => void }) {
  return (
    <View className="mt-6 flex-row justify-center gap-6">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Terms of Service"
        hitSlop={8}
        onPress={() => onOpen(TERMS_OF_SERVICE_URL)}
      >
        <Text className="text-xs font-semibold text-brand">Terms of Service</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Privacy Policy"
        hitSlop={8}
        onPress={() => onOpen(PRIVACY_POLICY_URL)}
      >
        <Text className="text-xs font-semibold text-brand">Privacy Policy</Text>
      </Pressable>
    </View>
  );
}
