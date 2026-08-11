import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchLoggedNutritionDateKeys,
  fetchNextFuelingWindow,
  fetchNutritionActiveFeed,
  fetchNutritionExtendedWave,
  fetchNutritionGrocery,
  fetchNutritionPlan,
  fetchNutritionStrategy,
  fetchTodayNutrition,
  generateNutritionPlanDraft,
  lockNutritionPlanMeal,
  logNutritionItem,
  patchNutritionItems,
  patchNutritionNotes,
  patchNutritionPlanMeal,
  quickAddHydration,
  regenerateDayFuelingPlan,
  requestMealRecommendationOptions,
  resetNutritionHydration,
  type MealRecommendationTrigger,
  type NutritionItemPatchPayload,
  type NutritionMealAction,
} from './api';
import { localDateYmd } from '@/src/lib/date';
import { removeItemFromDay } from './mapNutrition';
import {
  MOBILE_ENERGY_HORIZON_DAYS_AHEAD,
  mapActiveFuelFeed,
  mapEnergyHorizonPoints,
  mapNutritionStrategy,
} from './mapNutritionStrategy';
import type { HydrationQuickAddPayload, NutritionDayTotals, NutritionUploadPayload } from './types';

export const TODAY_NUTRITION_KEY = ['nutrition', 'today'] as const;
export const NEXT_FUELING_WINDOW_KEY = ['nutrition', 'next-window'] as const;
export const NUTRITION_GLANCE_KEY = ['nutrition', 'glance', 'logged-days'] as const;
export const NUTRITION_STRATEGY_KEY = ['nutrition', 'strategy'] as const;
export const NUTRITION_EXTENDED_WAVE_KEY = ['nutrition', 'extended-wave'] as const;
export const NUTRITION_ACTIVE_FEED_KEY = ['nutrition', 'active-feed'] as const;

export function useTodayNutritionQuery(
  dateOrOptions?: string | { enabled?: boolean },
  options?: { enabled?: boolean },
) {
  const date = typeof dateOrOptions === 'string' ? dateOrOptions : localDateYmd();
  const opts = typeof dateOrOptions === 'object' ? dateOrOptions : options;
  return useQuery({
    queryKey: ['nutrition', 'day', date],
    queryFn: () => fetchTodayNutrition(date),
    enabled: opts?.enabled ?? true,
  });
}

export function useLogNutritionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NutritionUploadPayload) => logNutritionItem(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['nutrition'] });
    },
  });
}

async function invalidateNutritionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ['nutrition'] });
}

export function usePatchNutritionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      nutritionId,
      payload,
    }: {
      nutritionId: string;
      payload: NutritionItemPatchPayload;
      date: string;
    }) => patchNutritionItems(nutritionId, payload),
    onSuccess: async () => {
      await invalidateNutritionQueries(queryClient);
    },
  });
}

export function useDeleteNutritionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      nutritionId,
      mealType,
      itemId,
    }: {
      nutritionId: string;
      mealType: NutritionItemPatchPayload['mealType'];
      itemId: string;
      date: string;
    }) =>
      patchNutritionItems(nutritionId, {
        action: 'delete',
        mealType,
        itemId,
      }),
    onMutate: async ({ date, itemId }) => {
      const key = ['nutrition', 'day', date] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NutritionDayTotals>(key);
      if (previous) {
        queryClient.setQueryData(key, removeItemFromDay(previous, itemId));
      }
      return { previous, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: async () => {
      await invalidateNutritionQueries(queryClient);
    },
  });
}

export function usePatchNutritionNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nutritionId, notes }: { nutritionId: string; notes: string | null }) =>
      patchNutritionNotes(nutritionId, notes),
    onSuccess: async () => {
      await invalidateNutritionQueries(queryClient);
    },
  });
}

export function useNextFuelingWindowQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: NEXT_FUELING_WINDOW_KEY,
    queryFn: fetchNextFuelingWindow,
    enabled: options?.enabled ?? true,
  });
}

export function useQuickAddHydration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: HydrationQuickAddPayload) => quickAddHydration(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['nutrition'] });
    },
  });
}

export function useNutritionGlanceLoggedDaysQuery(
  startYmd: string,
  endYmd: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...NUTRITION_GLANCE_KEY, startYmd, endYmd] as const,
    queryFn: () => fetchLoggedNutritionDateKeys(startYmd, endYmd),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export const NUTRITION_PLAN_KEY = ['nutrition', 'plan'] as const;
export const NUTRITION_GROCERY_KEY = ['nutrition', 'grocery'] as const;

export function useNutritionPlanQuery(start: string, end: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...NUTRITION_PLAN_KEY, start, end] as const,
    queryFn: () => fetchNutritionPlan(start, end),
    enabled: options?.enabled ?? true,
  });
}

export function useNutritionGroceryQuery(
  start: string,
  end: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...NUTRITION_GROCERY_KEY, start, end] as const,
    queryFn: () => fetchNutritionGrocery(start, end),
    enabled: options?.enabled ?? true,
  });
}

export function useGenerateNutritionPlanDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) =>
      generateNutritionPlanDraft(startDate, endDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: NUTRITION_PLAN_KEY });
      await queryClient.invalidateQueries({ queryKey: NUTRITION_GROCERY_KEY });
    },
  });
}

export function useRegenerateDayFuelingPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => regenerateDayFuelingPlan(date),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: NUTRITION_PLAN_KEY });
    },
  });
}

export function usePatchNutritionPlanMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mealId,
      action,
      meal,
    }: {
      mealId: string;
      action: NutritionMealAction;
      meal?: unknown;
    }) => patchNutritionPlanMeal(mealId, action, meal),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: NUTRITION_PLAN_KEY });
      await queryClient.invalidateQueries({ queryKey: NUTRITION_GROCERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['nutrition'] });
    },
  });
}

export function useMealRecommendations() {
  return useMutation({
    mutationFn: (input: MealRecommendationTrigger) => requestMealRecommendationOptions(input),
  });
}

export function useLockNutritionPlanMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      date: string;
      windowType: string;
      windowKey?: string;
      meal: unknown;
      slotName?: string;
    }) => lockNutritionPlanMeal(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: NUTRITION_PLAN_KEY });
      await queryClient.invalidateQueries({ queryKey: NUTRITION_GROCERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['nutrition'] });
    },
  });
}

/** Strategy standing — fetch only when the Strategy segment is focused. */
export function useNutritionStrategyQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: NUTRITION_STRATEGY_KEY,
    queryFn: fetchNutritionStrategy,
    select: mapNutritionStrategy,
    enabled: options.enabled ?? true,
  });
}

export function useNutritionExtendedWaveQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...NUTRITION_EXTENDED_WAVE_KEY, MOBILE_ENERGY_HORIZON_DAYS_AHEAD] as const,
    queryFn: () => fetchNutritionExtendedWave(MOBILE_ENERGY_HORIZON_DAYS_AHEAD),
    select: mapEnergyHorizonPoints,
    enabled: options.enabled ?? true,
  });
}

export function useNutritionActiveFeedQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: NUTRITION_ACTIVE_FEED_KEY,
    queryFn: fetchNutritionActiveFeed,
    select: mapActiveFuelFeed,
    enabled: options.enabled ?? true,
  });
}

export function useResetNutritionHydrationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetNutritionHydration(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: NUTRITION_STRATEGY_KEY }),
        queryClient.invalidateQueries({ queryKey: NUTRITION_EXTENDED_WAVE_KEY }),
        queryClient.invalidateQueries({ queryKey: ['nutrition'] }),
      ]);
    },
  });
}
