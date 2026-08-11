import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { SectionHeader } from '@/src/components/SectionHeader';

import type { PlannedListItem } from '@/src/features/activity/types';
import { useActivityGlanceWorkoutsQuery } from '@/src/features/activity/useActivity';
import { weekRangeContaining } from '@/src/lib/date';
import { resolveWeekGlanceStripState } from '@/src/features/today/weekGlance';

type WeekGlanceStripProps = {
  planned: PlannedListItem[] | undefined;
};

/**
 * Weekly totals come from the date-ranged glance query (pages up to 200 workouts in
 * the Mon–Sun window), not the fixed 10-item recent list — a multi-sport athlete blows
 * through 10 sessions in ~3 days and the week would silently under-report (CW-489).
 */
export function WeekGlanceStrip({ planned }: WeekGlanceStripProps) {
  const range = useMemo(() => weekRangeContaining(new Date()), []);
  const workoutsQuery = useActivityGlanceWorkoutsQuery(range.start, range.end);

  const state = resolveWeekGlanceStripState({
    workouts: workoutsQuery.data,
    planned,
    workoutsPending: workoutsQuery.isPending,
  });

  if (state.status === 'loading') {
    return (
      <View className="mt-8">
        <SectionHeader title="This week" />
        <View className="mt-2 h-4 w-40 animate-pulse rounded bg-border" />
        <View className="mt-3 h-8 animate-pulse rounded bg-border/60" />
      </View>
    );
  }

  const glance = state.glance;

  return (
    <View className="mt-8">
      <SectionHeader title="This week" />
      <Text className="mt-2 text-sm text-text-body">
        {glance.summaryLine.replace(/^This week:\s*/, '')}
      </Text>
      <View className="mt-3 flex-row items-end justify-between gap-1">
        {glance.days.map((day) => {
          const barH = Math.max(4, Math.round(day.height * 28));
          const fill = day.hasDone ? 'bg-brand' : day.hasPlanned ? 'bg-border-strong' : 'bg-border';
          return (
            <View key={day.dateKey} className="flex-1 items-center">
              <View className="h-8 w-full items-center justify-end">
                <View
                  accessibilityLabel={`${day.weekday}${day.hasDone ? ', completed' : day.hasPlanned ? ', planned' : ''}`}
                  className={`w-2 rounded-sm ${fill}`}
                  style={{ height: barH }}
                />
              </View>
              <Text className="mt-1 text-[10px] text-text-muted">{day.weekday.slice(0, 2)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
