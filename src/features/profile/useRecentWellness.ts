import { useQuery } from '@tanstack/react-query';

import {
  isPlausibleRestingHr,
  isPlausibleSleepHours,
  plausibleRestingHrHistory,
  plausibleSleepHistory,
} from '@/src/features/wellness/plausibility';

import { fetchDashboardProfile, fetchWellnessTrend } from './dashboardApi';
import { calculateTrend } from './trend';
import { priorWellnessHistory, wellnessTrendWindow } from './wellnessTrendWindow';

export const DASHBOARD_PROFILE_KEY = ['profile', 'dashboard'] as const;

export function useRecentWellness() {
  const profileQuery = useQuery({
    queryKey: DASHBOARD_PROFILE_KEY,
    queryFn: fetchDashboardProfile,
    staleTime: 30_000,
  });

  const profile = profileQuery.data;

  // 7-day range calculation — look back 8 local days so we have 7 prior days
  // excluding the latest one.
  const latestDate = profile?.latestWellnessDate
    ? new Date(profile.latestWellnessDate)
    : new Date();
  const { latestDateKey, startDateStr, endDateStr } = wellnessTrendWindow(latestDate);

  const trendQuery = useQuery({
    queryKey: ['wellness', 'trend', startDateStr, endDateStr] as const,
    queryFn: () => fetchWellnessTrend(startDateStr, endDateStr),
    enabled: Boolean(profile),
    staleTime: 30_000,
  });

  const trendData = trendQuery.data || [];

  // Filter out latest day's wellness from history to get prior baseline
  const priorHistory = priorWellnessHistory(trendData, latestDateKey);

  const recentSleep = isPlausibleSleepHours(profile?.recentSleep) ? profile!.recentSleep : null;
  const restingHr = isPlausibleRestingHr(profile?.restingHr) ? profile!.restingHr : null;
  const recentHRV = profile?.recentHRV ?? null;

  const sleepTrend =
    recentSleep != null
      ? calculateTrend(recentSleep, plausibleSleepHistory(priorHistory.map((h) => h.hoursSlept)))
      : null;

  const hrvTrend = calculateTrend(
    recentHRV,
    priorHistory.map((h) => h.hrv),
  );

  const rhrTrend =
    restingHr != null
      ? calculateTrend(restingHr, plausibleRestingHrHistory(priorHistory.map((h) => h.restingHr)))
      : null;

  const isLoading = profileQuery.isLoading || trendQuery.isLoading;
  const isError = profileQuery.isError || trendQuery.isError;

  const gatedProfile = profile
    ? {
        ...profile,
        recentSleep,
        restingHr,
        recentHRV,
      }
    : null;

  return {
    profile: gatedProfile,
    sleepTrend,
    hrvTrend,
    rhrTrend,
    isLoading,
    isError,
    refetch: async () => {
      await profileQuery.refetch();
      if (profile) await trendQuery.refetch();
    },
  };
}
