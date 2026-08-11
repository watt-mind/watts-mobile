/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { Button } from '@/src/components/Button';
import { Skeleton } from '@/src/components/Skeleton';

import {
  activeStoreProductIds,
  formatIntroOfferDisclosure,
  planActionLabel,
  planChangeKind,
} from './adapters';
import type { PlanChangeKind, StorePackage, SubscriptionSummary, SubscriptionTier } from './types';

/** Single source of truth for what each paid tier includes. */
export const TIER_FEATURES: Record<Exclude<SubscriptionTier, 'FREE'>, string[]> = {
  SUPPORTER: [
    'Full daily workout coaching & guidance',
    'Health biometrics & wearable auto-sync',
    'Log recovery, wellness & nutrition',
    'Personalized daily recommendations',
  ],
  PRO: [
    'Everything in Supporter',
    'Unlimited Coach AI chat & workout analysis',
    'Custom multi-week training plans & adaptation',
    'Structured interval exports & priority AI',
  ],
};

const TIER_ORDER: Exclude<SubscriptionTier, 'FREE'>[] = ['SUPPORTER', 'PRO'];

type Props = {
  packages: StorePackage[] | undefined;
  summary: SubscriptionSummary | undefined;
  isLoading: boolean;
  error: unknown;
  /** Package id currently in checkout, if any. */
  busyPackageId: string | null;
  /** Any operation in flight — blocks every buy button. */
  busy: boolean;
  /** Tier to badge as recommended; defaults to Pro. */
  highlightTier?: Exclude<SubscriptionTier, 'FREE'>;
  storeConfigured: boolean;
  onPurchase: (pkg: StorePackage, kind: PlanChangeKind) => void;
  onRetry: () => void;
};

function PeriodToggle({
  value,
  annualSaving,
  onChange,
}: {
  value: 'MONTHLY' | 'ANNUAL';
  annualSaving: number | undefined;
  onChange: (next: 'MONTHLY' | 'ANNUAL') => void;
}) {
  return (
    <View className="mt-4 flex-row rounded-xl border border-border bg-card p-1">
      {(['MONTHLY', 'ANNUAL'] as const).map((option) => {
        const selected = value === option;
        const label = option === 'ANNUAL' ? 'Annual' : 'Monthly';
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={
              option === 'ANNUAL' && annualSaving
                ? `Annual billing, save ${annualSaving} percent`
                : `${label} billing`
            }
            className={`flex-1 items-center rounded-lg py-2.5 ${selected ? 'bg-brand/15' : ''}`}
            onPress={() => onChange(option)}
          >
            <Text
              className={`text-sm font-semibold ${selected ? 'text-brand' : 'text-text-muted'}`}
            >
              {label}
              {option === 'ANNUAL' && annualSaving ? ` · save ${annualSaving}%` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PlanChooser({
  packages,
  summary,
  isLoading,
  error,
  busyPackageId,
  busy,
  highlightTier = 'PRO',
  storeConfigured,
  onPurchase,
  onRetry,
}: Props) {
  const hasAnnual = (packages ?? []).some((item) => item.period === 'ANNUAL');
  // Null until the athlete picks, so the annual default still applies to
  // packages that arrive after the first render.
  const [chosenPeriod, setChosenPeriod] = useState<'MONTHLY' | 'ANNUAL' | null>(null);
  const period = chosenPeriod ?? (hasAnnual ? 'ANNUAL' : 'MONTHLY');

  const activeProductIds = useMemo(() => activeStoreProductIds(summary), [summary]);
  const currentTier = summary?.tier ?? 'FREE';

  const bestAnnualSaving = useMemo(() => {
    const savings = (packages ?? [])
      .filter((item) => item.period === 'ANNUAL' && item.savingsPercentage)
      .map((item) => item.savingsPercentage!);
    return savings.length > 0 ? Math.max(...savings) : undefined;
  }, [packages]);

  const visible = useMemo(() => {
    const forPeriod = (packages ?? []).filter((item) => item.period === period);
    return TIER_ORDER.flatMap((tier) => forPeriod.filter((item) => item.tier === tier));
  }, [packages, period]);

  if (isLoading) {
    return (
      <View className="mt-6 gap-3">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="mt-4 rounded-xl border border-danger/40 bg-tint-error p-4">
        <Text className="text-sm font-semibold text-danger">Plans couldn’t be loaded</Text>
        <Text className="mt-1 text-sm leading-5 text-text-body">
          {storeConfigured
            ? 'The App Store didn’t respond. Check your connection and try again.'
            : 'In-app purchases aren’t available in this build yet.'}
        </Text>
        {__DEV__ ? (
          <Text className="mt-1 text-xs text-text-muted">
            {friendlyError(error, 'Store offerings request failed')}
          </Text>
        ) : null}
        {storeConfigured ? (
          <Pressable className="mt-3" hitSlop={8} onPress={onRetry}>
            <Text className="text-sm font-semibold text-brand">Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!packages || packages.length === 0) {
    return (
      <View className="mt-4 rounded-xl border border-border bg-card p-4">
        <Text className="text-sm leading-5 text-text-muted">
          No plans are available for this app build yet. Pull down to refresh, or contact support if
          this keeps happening.
        </Text>
      </View>
    );
  }

  return (
    <View testID="subscription-plan-chooser">
      {hasAnnual ? (
        <PeriodToggle value={period} annualSaving={bestAnnualSaving} onChange={setChosenPeriod} />
      ) : null}

      {visible.map((item) => {
        const kind = planChangeKind({ pkg: item, currentTier, activeProductIds });
        const isCurrent = kind === 'current';
        const recommended = item.tier === highlightTier && !isCurrent;
        // Stable across price/copy changes: tier + period, never the store product id.
        const planTestID = `subscription-plan-${item.tier.toLowerCase()}-${item.period.toLowerCase()}`;

        return (
          <View
            key={`${item.tier}:${item.period}:${item.id}`}
            testID={planTestID}
            className={`mt-4 rounded-2xl border bg-card p-5 ${
              isCurrent
                ? 'border-brand/40 bg-brand/5'
                : recommended
                  ? 'border-brand/30'
                  : 'border-border'
            }`}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-xl font-bold text-text-primary">
                    {item.tier === 'PRO' ? 'Pro' : 'Supporter'}
                  </Text>
                  {item.savingsPercentage ? (
                    <View className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-0.5">
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-success">
                        Save {item.savingsPercentage}%
                      </Text>
                    </View>
                  ) : null}
                  {isCurrent ? (
                    <View className="rounded-full bg-brand/20 px-2.5 py-0.5">
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-brand">
                        Current
                      </Text>
                    </View>
                  ) : recommended ? (
                    <View className="rounded-full bg-brand/15 px-2.5 py-0.5">
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-brand">
                        Recommended
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-1 text-sm text-text-muted">
                  {item.period === 'ANNUAL' ? 'Billed yearly' : 'Billed monthly'}
                </Text>
              </View>

              <View className="items-end">
                <Text className="text-xl font-bold text-brand">{item.price}</Text>
                {item.monthlyPriceString && item.period === 'ANNUAL' ? (
                  <Text className="mt-0.5 text-xs text-text-muted">
                    {item.monthlyPriceString}/mo
                  </Text>
                ) : null}
              </View>
            </View>

            {item.introOffer ? (
              <View className="mt-3 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2">
                <Text className="text-xs leading-4 text-text-body">
                  {formatIntroOfferDisclosure(item.introOffer, item.price, item.period)}
                </Text>
              </View>
            ) : null}

            <View className="mt-4 gap-2 border-t border-border pt-4">
              {TIER_FEATURES[item.tier].map((feature) => (
                <View key={feature} className="flex-row gap-2">
                  <Text className="text-sm leading-5 text-brand">✓</Text>
                  <Text className="flex-1 text-sm leading-5 text-text-body">{feature}</Text>
                </View>
              ))}
            </View>

            <Button
              testID={`${planTestID}-cta`}
              className="mt-5"
              label={planActionLabel(kind, item)}
              disabled={isCurrent || busy}
              loading={busyPackageId === item.id}
              variant={isCurrent ? 'secondary' : 'primary'}
              onPress={() => onPurchase(item, kind)}
            />
          </View>
        );
      })}
    </View>
  );
}
