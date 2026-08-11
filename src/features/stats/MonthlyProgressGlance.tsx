/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { LineSeriesChart } from '@/src/features/activity/charts/LineSeriesChart';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';

import {
  formatDeltaPercent,
  mapMonthlyChartSeries,
  summarizeMonthlyProgress,
} from './mapMonthlyComparison';
import { monthlyMetricLabel } from './monthlyProgressPreference';
import { MonthlyProgressSheet } from './MonthlyProgressSheet';
import { useMonthlyComparisonQuery } from './useMonthlyProgress';
import { useMonthlyProgressMetric } from './useMonthlyProgressPreference';

export function MonthlyProgressGlance() {
  const query = useMonthlyComparisonQuery('all');
  const { metric } = useMonthlyProgressMetric();
  const profileQuery = useAthleteProfileQuery();
  const distanceUnits = profileQuery.data?.distanceUnits ?? 'Kilometers';
  const [open, setOpen] = useState(false);

  if (query.isLoading && !query.data) {
    return (
      // key forces a remount when swapping to content: reusing the native view keeps
      // the skeleton's fixed height and the loaded card overflows into the next section.
      <View
        key="skeleton"
        className="mt-6 h-20 animate-pulse rounded-xl border border-border bg-card/40"
      />
    );
  }

  if (query.isError || !query.data) {
    return null;
  }

  const summary = summarizeMonthlyProgress(query.data, metric, distanceUnits);
  const chart = mapMonthlyChartSeries(query.data, metric, 'cumulative', distanceUnits);
  const deltaClass =
    summary.percentDiff > 0
      ? 'text-success'
      : summary.percentDiff < 0
        ? 'text-modify'
        : 'text-text-muted';

  return (
    <View key="content" className="mt-6">
      <Text className="text-xs uppercase tracking-wide text-text-muted">Monthly Progress</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open monthly progress"
        onPress={() => setOpen(true)}
        className="mt-3 active:opacity-90"
      >
        <View className="flex-row items-end justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
              {query.data.currentMonthName} {monthlyMetricLabel(metric)}
            </Text>
            <Text className="mt-1 text-xl font-semibold text-text-primary">
              {summary.formattedCurrent}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
              vs {query.data.lastMonthName}
            </Text>
            <Text className={`mt-1 text-lg font-semibold ${deltaClass}`}>
              {formatDeltaPercent(summary.percentDiff)}
            </Text>
          </View>
        </View>
        {chart.series.length > 0 ? (
          <View className="mt-2" pointerEvents="none">
            <LineSeriesChart
              series={chart.series}
              durationSec={chart.durationSec}
              height={64}
              showLegend={false}
              showGrid={false}
              showXLabels={false}
              insets={{ left: 0, right: 4, top: 4, bottom: 4 }}
            />
          </View>
        ) : null}
        <Text className="mt-2 text-[11px] text-text-muted">
          Month-to-date through day {query.data.todayDay} · tap for details & filters
        </Text>
      </Pressable>

      <MonthlyProgressSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}
