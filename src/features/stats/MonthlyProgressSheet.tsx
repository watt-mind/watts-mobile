/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spinner } from '@/src/components/Spinner';
import { friendlyError } from '@/src/api/errors';
import { useAuth } from '@/src/auth/AuthContext';
import { LineSeriesChart } from '@/src/features/activity/charts/LineSeriesChart';
import { openInstanceWeb } from '@/src/features/account/openInstanceWeb';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';

import {
  dashboardWebPath,
  formatDeltaPercent,
  formatMetricValue,
  formatSportLabel,
  mapMonthlyChartSeries,
  summarizeMonthlyProgress,
} from './mapMonthlyComparison';
import { monthlyMetricLabel } from './monthlyProgressPreference';
import type { MonthlyMetric, MonthlyViewMode } from './types';
import { useMonthlyComparisonQuery, useWorkoutSportsQuery } from './useMonthlyProgress';
import { useMonthlyProgressMetric } from './useMonthlyProgressPreference';

const METRICS: MonthlyMetric[] = ['tss', 'duration', 'distance', 'elevation', 'count'];

export function MonthlyProgressSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { instanceUrl } = useAuth();
  const { metric, setMetric } = useMonthlyProgressMetric();
  const [sport, setSport] = useState('all');
  const [viewMode, setViewMode] = useState<MonthlyViewMode>('cumulative');

  const query = useMonthlyComparisonQuery(sport, visible);
  const sportsQuery = useWorkoutSportsQuery(visible);
  const profileQuery = useAthleteProfileQuery();
  const distanceUnits = profileQuery.data?.distanceUnits ?? 'Kilometers';

  const summary = query.data ? summarizeMonthlyProgress(query.data, metric, distanceUnits) : null;
  const chart = query.data
    ? mapMonthlyChartSeries(query.data, metric, viewMode, distanceUnits)
    : null;

  const sportOptions = useMemo(() => {
    const list = sportsQuery.data || [];
    return ['all', ...list];
  }, [sportsQuery.data]);

  const deltaClass =
    summary && summary.percentDiff > 0
      ? 'text-success'
      : summary && summary.percentDiff < 0
        ? 'text-modify'
        : 'text-text-muted';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
        <View className="flex-row items-start justify-between border-b border-border px-5 py-4">
          <View className="min-w-0 flex-1 pr-3">
            <Text className="text-xl font-semibold text-text-primary">Monthly Progress</Text>
            <Text className="mt-1 text-sm text-text-muted">This month vs last month.</Text>
          </View>
          <Pressable onPress={onClose} className="active:opacity-70" hitSlop={8}>
            <Text className="text-sm font-semibold text-brand">Done</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-5">
          <Text className="text-xs uppercase tracking-wide text-text-muted">Metric</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {METRICS.map((key) => {
              const selected = key === metric;
              return (
                <Pressable
                  key={key}
                  onPress={() => void setMetric(key)}
                  className={`rounded-full px-3 py-1.5 ${
                    selected ? 'bg-brand' : 'border border-border-strong bg-card'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${selected ? 'text-ink' : 'text-text-body'}`}
                  >
                    {monthlyMetricLabel(key)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mt-5 text-xs uppercase tracking-wide text-text-muted">Sport</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
            <View className="flex-row gap-2 pr-4">
              {sportOptions.map((value) => {
                const selected = value === sport;
                const label = value === 'all' ? 'All sports' : formatSportLabel(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() => setSport(value)}
                    className={`rounded-full px-3 py-1.5 ${
                      selected ? 'bg-brand' : 'border border-border-strong bg-card'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        selected ? 'text-ink' : 'text-text-body'
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text className="mt-5 text-xs uppercase tracking-wide text-text-muted">View</Text>
          <View className="mt-2 flex-row gap-2">
            {(
              [
                ['cumulative', 'Cumulative'],
                ['daily', 'Daily'],
              ] as const
            ).map(([key, label]) => {
              const selected = viewMode === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setViewMode(key)}
                  className={`rounded-full px-3 py-1.5 ${
                    selected ? 'bg-brand' : 'border border-border-strong bg-card'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${selected ? 'text-ink' : 'text-text-body'}`}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {query.isLoading && !query.data ? (
            <Spinner className="mt-10" />
          ) : query.isError ? (
            <Text className="mt-6 text-sm text-danger">
              {friendlyError(query.error, 'Could not load monthly progress')}
            </Text>
          ) : chart && summary && query.data ? (
            <>
              <View className="mt-6">
                <LineSeriesChart
                  series={chart.series}
                  durationSec={chart.durationSec}
                  height={200}
                  startXLabel="1"
                  endXLabel={String(chart.endDay)}
                />
              </View>
              <View className="mt-4 flex-row flex-wrap items-center gap-x-4 gap-y-2">
                <Text className="text-xs text-text-muted">
                  {query.data.currentMonthName}:{' '}
                  <Text className="font-semibold text-text-primary">
                    {summary.formattedCurrent}
                  </Text>
                </Text>
                <Text className="text-xs text-text-muted">
                  {query.data.lastMonthName}:{' '}
                  <Text className="font-semibold text-text-primary">{summary.formattedLast}</Text>
                </Text>
                <Text className={`text-xs font-semibold ${deltaClass}`}>
                  Delta {formatDeltaPercent(summary.percentDiff)}
                </Text>
              </View>
              <Text className="mt-2 text-[11px] text-text-muted">
                Totals use month-to-date through day {query.data.todayDay} (
                {formatMetricValue(summary.currentTotal, metric, distanceUnits)} vs last month same
                day).
              </Text>
            </>
          ) : null}

          <Pressable
            className="mt-8 active:opacity-70"
            onPress={() => void openInstanceWeb(instanceUrl, dashboardWebPath())}
          >
            <Text className="text-sm font-semibold text-brand">Open dashboard</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
