/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { router, type Href } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SectionHeader } from '@/src/components/SectionHeader';

import { AppSymbol } from '@/src/components/AppSymbol';
import { useRecentWellness } from '@/src/features/profile/useRecentWellness';
import type { RecoveryContextItem } from '@/src/features/recovery/types';
import { WellnessOverviewSheet } from '@/src/features/wellness/WellnessOverviewSheet';
import { localDateYmd } from '@/src/lib/date';
import { useThemeColors } from '@/src/theme/useThemeColors';

function staleCaption(
  hasCurrentDayWellness: boolean,
  latestWellnessDate: string | null,
): string | null {
  if (hasCurrentDayWellness || !latestWellnessDate) return null;
  const day = latestWellnessDate.slice(0, 10);
  const today = localDateYmd();
  if (day === today) return null;

  const latest = new Date(`${day}T12:00:00`);
  const now = new Date(`${today}T12:00:00`);
  const diffDays = Math.round((now.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return null;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

function TrendBadge({
  value,
  lowerIsBetter = false,
}: {
  value: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value == null || value === 0) return null;

  const isGood = lowerIsBetter ? value < 0 : value > 0;
  const sign = value > 0 ? '↑' : '↓';
  const percent = Math.abs(value);

  const bgClass = isGood
    ? 'bg-success/10 border border-success/25'
    : 'bg-danger/10 border border-danger/25';
  const textClass = isGood ? 'text-success' : 'text-danger';

  return (
    <View className={`rounded-full px-2 py-0.5 ${bgClass}`}>
      <Text className={`text-[9px] font-bold ${textClass}`}>
        {sign} {percent}%
      </Text>
    </View>
  );
}

function WellnessTile({
  label,
  value,
  unit,
  trend,
  lowerIsBetter = false,
  sfIcon,
  emojiIcon,
}: {
  label: string;
  value: string | number;
  unit: string;
  trend: number | null;
  lowerIsBetter?: boolean;
  sfIcon: SFSymbol;
  emojiIcon: string;
}) {
  const theme = useThemeColors();
  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-1.5">
        <AppSymbol sf={sfIcon} size={13} tintColor={theme.textMuted} fallback={emojiIcon} />
        <Text className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
          {label}
        </Text>
      </View>
      <View className="mt-1 flex-row items-baseline gap-0.5">
        <Text className="text-xl font-semibold text-text-primary">{value}</Text>
        <Text className="text-[10px] font-semibold text-text-muted"> {unit}</Text>
      </View>
      <View className="mt-1.5 min-h-5 flex-row items-center">
        <TrendBadge value={trend} lowerIsBetter={lowerIsBetter} />
      </View>
    </View>
  );
}

function goToWellnessCheckIn() {
  router.push('/(app)/(tabs)/log?section=wellness' as Href);
}

function openRecoveryEvent(item?: RecoveryContextItem) {
  if (item) {
    router.push(`/(app)/recovery-event?id=${encodeURIComponent(item.sourceRecordId)}` as Href);
    return;
  }
  router.push('/(app)/recovery-event' as Href);
}

type WellnessSectionProps = {
  recoveryItems: RecoveryContextItem[] | undefined;
  recoveryError?: boolean;
  recoveryErrorMessage?: string | null;
  onRetryRecovery?: () => void;
};

/** Merged wellness card: recent metrics, active recovery context, and check-in entry points. */
export function WellnessSection({
  recoveryItems,
  recoveryError,
  recoveryErrorMessage,
  onRetryRecovery,
}: WellnessSectionProps) {
  const { profile, sleepTrend, hrvTrend, rhrTrend, isLoading } = useRecentWellness();
  const [overviewOpen, setOverviewOpen] = useState(false);

  if (isLoading && !profile) {
    return (
      <View className="mt-6 flex-row gap-2.5">
        {[1, 2, 3].map((i) => (
          <View key={i} className="h-16 flex-1 animate-pulse rounded-lg bg-border/40" />
        ))}
      </View>
    );
  }

  const sleepVal = profile?.recentSleep != null ? profile.recentSleep.toFixed(1) : null;
  const hrvVal = profile?.recentHRV ?? null;
  const rhrVal = profile?.restingHr ?? null;
  const hasAnyMetric = sleepVal != null || hrvVal != null || rhrVal != null;
  const caption = profile
    ? staleCaption(profile.hasCurrentDayWellness, profile.latestWellnessDate)
    : null;
  const overviewDate = profile?.latestWellnessDate
    ? profile.latestWellnessDate.slice(0, 10)
    : localDateYmd();
  const hasRecoveryItems = Boolean(recoveryItems?.length);

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between">
        <SectionHeader title="Wellness" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wellness history"
          onPress={() => router.push('/(app)/(tabs)/log?section=recovery' as Href)}
          hitSlop={8}
        >
          <Text className="text-xs font-semibold text-brand">History</Text>
        </Pressable>
      </View>

      {!hasAnyMetric ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="No recent wellness. Check in"
          onPress={goToWellnessCheckIn}
          className="mt-3 active:opacity-90"
        >
          <Text className="text-sm text-text-body">No recent wellness · Check in</Text>
        </Pressable>
      ) : (
        <>
          {caption ? <Text className="mt-1 text-[11px] text-text-muted">{caption}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open wellness overview"
            onPress={() => setOverviewOpen(true)}
            className="mt-3 flex-row gap-2.5 active:opacity-90"
          >
            {sleepVal != null ? (
              <WellnessTile
                label="Sleep"
                value={sleepVal}
                unit="hrs"
                trend={sleepTrend}
                sfIcon="moon.stars"
                emojiIcon="🌙"
              />
            ) : null}
            {hrvVal != null ? (
              <WellnessTile
                label="HRV"
                value={hrvVal}
                unit="ms"
                trend={hrvTrend}
                sfIcon="waveform.path.ecg"
                emojiIcon="💓"
              />
            ) : null}
            {rhrVal != null ? (
              <WellnessTile
                label="Resting HR"
                value={rhrVal}
                unit="bpm"
                trend={rhrTrend}
                sfIcon="heart.fill"
                emojiIcon="❤️"
                lowerIsBetter
              />
            ) : null}
          </Pressable>
        </>
      )}

      {recoveryError ? (
        <View className="mt-3 rounded-xl border border-danger/40 bg-tint-error p-3">
          <Text className="text-sm text-danger">
            {recoveryErrorMessage || 'Couldn’t load recovery events'}
          </Text>
          {onRetryRecovery ? (
            <Pressable className="mt-2" hitSlop={8} onPress={onRetryRecovery}>
              <Text className="font-semibold text-brand">Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!recoveryError ? (
        <View className="mt-3">
          {hasRecoveryItems ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View recovery context"
              className="active:opacity-80"
              hitSlop={8}
              onPress={() => openRecoveryEvent(recoveryItems![0])}
            >
              <Text className="text-sm text-text-body">
                {recoveryItems![0]!.label}
                {recoveryItems![0]!.severity != null ? ` · ${recoveryItems![0]!.severity}/10` : ''}
                {recoveryItems!.length > 1 ? ` · +${recoveryItems!.length - 1} more` : ''}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log recovery event"
            className="mt-1 self-start active:opacity-80"
            hitSlop={8}
            onPress={() => openRecoveryEvent()}
          >
            <Text className="text-sm font-semibold text-brand">Log recovery event</Text>
          </Pressable>
        </View>
      ) : null}

      <WellnessOverviewSheet
        visible={overviewOpen}
        date={overviewDate}
        onClose={() => setOverviewOpen(false)}
      />
    </View>
  );
}
