import { describe, expect, it, vi } from 'vitest';

import type { GoalApi } from '../types';
import { GOALS_LIST_KEY, seedCreatedGoal, type GoalCacheClient } from '../goalCache';

const created: GoalApi = { id: 'g-2', type: 'EVENT', title: 'Spring gran fondo' };
const existing: GoalApi = { id: 'g-1', type: 'PERFORMANCE', title: 'FTP 300' };

function makeClient(invalidate: () => Promise<unknown>, seed?: GoalApi[]) {
  let list = seed;
  const client: GoalCacheClient & { read: () => GoalApi[] | undefined } = {
    setQueryData: vi.fn((_key, updater) => {
      list = updater(list);
    }),
    invalidateQueries: vi.fn(invalidate),
    read: () => list,
  };
  return client;
}

describe('seedCreatedGoal', () => {
  it('returns synchronously even when the refetch never settles', () => {
    // The goal step awaits mutateAsync -> onSuccess before navigating; a paused
    // invalidateQueries never settles and used to hang the wizard. (CW-466)
    const client = makeClient(() => new Promise<never>(() => {}));
    expect(() => seedCreatedGoal(client, created)).not.toThrow();
    expect(client.read()).toEqual([created]);
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: GOALS_LIST_KEY });
  });

  it('swallows a rejected background refresh', async () => {
    const client = makeClient(() => Promise.reject(new Error('offline')));
    seedCreatedGoal(client, created);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.read()).toEqual([created]);
  });

  it('prepends to an existing list', () => {
    const client = makeClient(() => Promise.resolve(), [existing]);
    seedCreatedGoal(client, created);
    expect(client.read()?.map((g) => g.id)).toEqual(['g-2', 'g-1']);
  });

  it('merges rather than duplicating a goal already in cache', () => {
    const client = makeClient(() => Promise.resolve(), [{ ...created, title: 'stale' }]);
    seedCreatedGoal(client, created);
    expect(client.read()).toEqual([created]);
  });
});
