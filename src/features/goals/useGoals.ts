import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createGoal, fetchGoals } from './api';
import { GOALS_LIST_KEY, seedCreatedGoal } from './goalCache';
import type { CreateGoalInput } from './types';
import {
  mapGoalDetail,
  mapGoalGlance,
  pickGoalById,
  pickPrimaryGoal,
  sortGoalsForList,
} from './mapGoals';

export { GOALS_LIST_KEY } from './goalCache';

export function useCreateGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => createGoal(input),
    onSuccess: (created) => seedCreatedGoal(queryClient, created),
  });
}

export function useGoalsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: GOALS_LIST_KEY,
    queryFn: fetchGoals,
    enabled: options?.enabled ?? true,
    select: (goals) => sortGoalsForList(goals).map(mapGoalGlance),
  });
}

/** Athlete teaser: coach-wattz primary ordering (priority desc, oldest createdAt). */
export function usePrimaryGoalQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: GOALS_LIST_KEY,
    queryFn: fetchGoals,
    enabled: options?.enabled ?? true,
    select: (goals) => {
      const primary = pickPrimaryGoal(goals);
      return primary ? mapGoalGlance(primary) : null;
    },
  });
}

export function useGoalDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: GOALS_LIST_KEY,
    queryFn: fetchGoals,
    enabled: Boolean(id),
    select: (goals) => {
      const raw = pickGoalById(goals, id);
      return raw ? mapGoalDetail(raw) : null;
    },
  });
}
