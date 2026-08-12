/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { router, Stack, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';

import { friendlyError } from '@/src/api/errors';
import { AppSymbol } from '@/src/components/AppSymbol';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { ListSkeleton } from '@/src/components/Skeleton';
import { SportIcon } from '@/src/components/SportIcon';
import { StructureProfile } from '@/src/features/activity/charts/StructureProfile';
import { formatDuration } from '@/src/features/activity/mapActivity';
import { buildComplianceIndex, type ComplianceMark } from '@/src/features/activity/compliance';
import { ComplianceMarkView } from '@/src/features/activity/ComplianceMark';
import { groupUpcomingByDay } from '@/src/features/activity/groupUpcoming';
import type { PlannedListItem } from '@/src/features/activity/types';
import {
  useRecentActivityQuery,
  useUpcomingPlannedQuery,
} from '@/src/features/activity/useActivity';
import { localDateKey } from '@/src/lib/date';
import { useOfflineCached } from '@/src/hooks/useOfflineCached';
import { humanizeWorkoutType } from '@/src/lib/humanizeWorkoutType';
import { APP_HREFS } from '@/src/linking/appHrefs';
import { useThemeColors } from '@/src/theme/useThemeColors';

/** Root-stack lists opened from tabs/deep links often omit the native back chevron. */
function goBackFromUpcomingList() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(APP_HREFS.today as Href);
}

function PlannedRow({ item, mark }: { item: PlannedListItem; mark: ComplianceMark | undefined }) {
  // Date lives in the section header — keep type · duration · TSS only.
  const meta = [
    humanizeWorkoutType(item.type),
    formatDuration(item.durationSec),
    item.tss != null ? `TSS ${Math.round(item.tss)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const chartBlocks = item.structureChartBlocks;

  return (
    <Pressable
      className="mb-3 rounded-xl border border-border bg-card/80 px-4 py-3.5 active:opacity-80"
      onPress={() => router.push(APP_HREFS.plannedDetail(item.id) as Href)}
    >
      <View className="flex-row items-center gap-3">
        <SportIcon type={item.type} size={14} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center">
            <Text className="shrink text-base font-semibold text-text-primary" numberOfLines={1}>
              {item.title}
            </Text>
            <ComplianceMarkView mark={mark} />
          </View>
          {meta ? <Text className="mt-1.5 text-sm text-text-muted">{meta}</Text> : null}
          {chartBlocks && chartBlocks.length >= 2 ? (
            <StructureProfile blocks={chartBlocks} compact />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function UpcomingPlannedScreen() {
  const theme = useThemeColors();
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useUpcomingPlannedQuery();
  const recent = useRecentActivityQuery();
  const { showCachedOffline, lastUpdatedLabel } = useOfflineCached({
    data,
    isError,
    dataUpdatedAt,
  });

  const [manualRefreshing, setManualRefreshing] = useState(false);
  const handleRefresh = async () => {
    setManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setManualRefreshing(false);
    }
  };

  const futurePlanned = useMemo(
    () =>
      (data ?? []).filter((item) => {
        const itemKey = localDateKey(item.date);
        if (!itemKey) return false;
        const todayKey = localDateKey(new Date())!;
        return itemKey >= todayKey;
      }),
    [data],
  );
  const sections = useMemo(() => groupUpcomingByDay(futurePlanned), [futurePlanned]);
  const compliance = useMemo(() => buildComplianceIndex(recent.data, data), [recent.data, data]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Upcoming workouts',
          headerShown: true,
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              onPress={goBackFromUpcomingList}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: Platform.OS === 'ios' ? -6 : 0,
              }}
            >
              <AppSymbol sf="chevron.left" size={22} tintColor={theme.textPrimary} fallback="←" />
            </Pressable>
          ),
        }}
      />
      {isLoading && !data ? (
        <ListSkeleton />
      ) : isError && !data ? (
        <View className="flex-1 bg-surface px-6 pt-6">
          <View className="rounded-xl border border-danger/40 bg-tint-error p-4">
            <Text className="text-base text-danger">
              {friendlyError(error, 'Failed to load upcoming workouts')}
            </Text>
            <Pressable className="mt-3" hitSlop={8} onPress={() => void refetch()}>
              <Text className="text-sm font-semibold text-brand">Retry</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <SectionList
          className="flex-1 bg-surface"
          contentContainerClassName="px-6 pb-10 pt-4"
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={manualRefreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={theme.brandOnSurface}
            />
          }
          ListHeaderComponent={
            <View>
              <OfflineBanner visible={showCachedOffline} lastUpdatedLabel={lastUpdatedLabel} />
              <Text className="mb-2 text-sm text-text-muted">
                Next two weeks. Full season and adjust live on Plan.
              </Text>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Open Plan tab"
                onPress={() => router.push(APP_HREFS.plan as Href)}
                className="mb-2 self-start py-1"
              >
                <Text className="text-sm font-semibold text-brand">Open Plan</Text>
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <View className="pt-8">
              <Text className="text-base text-text-muted">
                No upcoming planned workouts in the next two weeks.
              </Text>
              <Pressable
                className="mt-3"
                hitSlop={8}
                onPress={() => router.push(APP_HREFS.plan as Href)}
              >
                <Text className="text-sm font-semibold text-brand">Open Plan</Text>
              </Pressable>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <PlannedRow item={item} mark={compliance.forPlanned.get(item.id)} />
          )}
        />
      )}
    </>
  );
}
