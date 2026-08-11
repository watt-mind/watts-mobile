/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SectionHeader } from '@/src/components/SectionHeader';

import { StructureProfile } from '@/src/features/activity/charts/StructureProfile';
import { formatActivityDate, formatDuration } from '@/src/features/activity/mapActivity';
import { SportIcon } from '@/src/components/SportIcon';
import { humanizeWorkoutType } from '@/src/lib/humanizeWorkoutType';
import type { PlannedListItem } from '@/src/features/activity/types';
import { useUpcomingPlannedQuery } from '@/src/features/activity/useActivity';
import { localDateKey } from '@/src/lib/date';
import { APP_HREFS } from '@/src/linking/appHrefs';

const TEASER_LIMIT = 3;

type ComingUpStripProps = {
  /** Planned workout already shown in Today’s hero — omit from the teaser. */
  excludePlannedId?: string | null;
};

function isOnOrAfterToday(date: string | null): boolean {
  const key = localDateKey(date);
  const today = localDateKey(new Date());
  if (!key || !today) return false;
  return key >= today;
}

export function ComingUpStrip({ excludePlannedId }: ComingUpStripProps) {
  const { data, isError } = useUpcomingPlannedQuery();

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((item) => isOnOrAfterToday(item.date))
        .filter((item) => !excludePlannedId || item.id !== excludePlannedId)
        .slice(0, TEASER_LIMIT),
    [data, excludePlannedId],
  );

  if (isError) return null;

  return (
    <View className="mt-8">
      <View className="flex-row items-baseline justify-between">
        <SectionHeader title="Coming up" />
        <Pressable
          className="py-1 active:opacity-70"
          hitSlop={8}
          onPress={() => router.push(APP_HREFS.upcoming as Href)}
        >
          <Text className="text-sm font-semibold text-brand">See all</Text>
        </Pressable>
      </View>

      {rows.length === 0 ? (
        <Text className="mt-3 text-sm text-text-muted">No upcoming planned workouts.</Text>
      ) : (
        <View className="mt-2">
          {rows.map((item) => (
            <ComingUpRow key={item.id} item={item} />
          ))}
        </View>
      )}
    </View>
  );
}

function ComingUpRow({ item }: { item: PlannedListItem }) {
  const meta = [
    formatActivityDate(item.date),
    humanizeWorkoutType(item.type),
    formatDuration(item.durationSec),
  ]
    .filter(Boolean)
    .join(' · ');
  const chartBlocks = item.structureChartBlocks;

  return (
    <Pressable
      className="flex-row items-center gap-3 border-b border-border/80 py-3 active:opacity-80"
      onPress={() => router.push(APP_HREFS.plannedDetail(item.id) as Href)}
    >
      <SportIcon type={item.type} size={13} />
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium text-text-primary" numberOfLines={1}>
          {item.title}
        </Text>
        {meta ? <Text className="mt-1 text-sm text-text-muted">{meta}</Text> : null}
        {chartBlocks && chartBlocks.length >= 2 ? (
          <StructureProfile blocks={chartBlocks} compact />
        ) : null}
      </View>
      <Text className="text-text-muted">›</Text>
    </Pressable>
  );
}
