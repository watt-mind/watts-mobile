import type { GoalApi } from './types';

export const GOALS_LIST_KEY = ['goals', 'list'] as const;

/** The slice of QueryClient the create-goal success handler needs. */
export type GoalCacheClient = {
  setQueryData: (
    key: readonly unknown[],
    updater: (prev: GoalApi[] | undefined) => GoalApi[],
  ) => unknown;
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>;
};

/**
 * Seed the list cache with the created goal, then fire a background refresh.
 *
 * The caller (EventGoalWizard, activation goal step) awaits `mutateAsync` before
 * navigating, and a mutation does not resolve until its `onSuccess` does — so
 * this must never await `invalidateQueries`, which does not settle while the
 * query is paused. That await left the goal step as a labelless spinner with no
 * error and no timeout. (CW-466)
 */
export function seedCreatedGoal(client: GoalCacheClient, created: GoalApi): void {
  client.setQueryData(GOALS_LIST_KEY, (prev) => {
    if (!Array.isArray(prev)) return [created];
    if (prev.some((g) => g.id === created.id)) {
      return prev.map((g) => (g.id === created.id ? { ...g, ...created } : g));
    }
    return [created, ...prev];
  });
  void Promise.resolve(client.invalidateQueries({ queryKey: GOALS_LIST_KEY })).catch(() => {
    /* background refresh only — the cache was already seeded above */
  });
}
