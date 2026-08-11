import { useQuery } from '@tanstack/react-query';

import type { WeightUnits } from '@/src/features/profile/types';
import { useAthleteProfileQuery } from '@/src/features/profile/useProfile';

import { fetchWellnessOverview } from './api';

export function wellnessOverviewQueryKey(date: string, weightUnits: WeightUnits = 'Kilograms') {
  return ['wellness', 'overview', date, weightUnits] as const;
}

export function useWellnessOverviewQuery(date: string | null, enabled: boolean) {
  const profileQuery = useAthleteProfileQuery();
  // Units live in the key, never read inside queryFn: a cached result must not outlive
  // the preference it was formatted with (same hazard as CW-491).
  const weightUnits: WeightUnits = profileQuery.data?.weightUnits ?? 'Kilograms';

  return useQuery({
    queryKey: wellnessOverviewQueryKey(date ?? '', weightUnits),
    queryFn: () => fetchWellnessOverview(date!, weightUnits),
    enabled: Boolean(enabled && date),
    staleTime: 30_000,
  });
}
