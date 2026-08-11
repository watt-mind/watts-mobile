import { describe, expect, it, vi } from 'vitest';

import { advanceActivationStatus, settleWithin } from '../advanceStatus';
import type { ActivationStatus } from '../types';

const cached: ActivationStatus = {
  supportsActivation: true,
  softActivated: false,
  fullyActivated: false,
  mobileActivationStep: 'consent',
  primaryGoalId: null,
  activePlanId: null,
  hasUsableData: false,
};

function makeClient(invalidateQueries: () => Promise<unknown>) {
  const store = new Map<string, ActivationStatus | undefined>();
  store.set('key', cached);
  return {
    store,
    setQueryData: vi.fn(
      (
        _key: readonly unknown[],
        updater: (prev: ActivationStatus | undefined) => ActivationStatus | undefined,
      ) => {
        store.set('key', updater(store.get('key')));
      },
    ),
    invalidateQueries: vi.fn(invalidateQueries),
  };
}

const keys = {
  cacheKey: ['activation', 'onboarding-status', 'id'] as const,
  invalidateKey: ['activation', 'onboarding-status'] as const,
};

describe('advanceActivationStatus', () => {
  it('resolves without waiting for a refetch that never settles', async () => {
    // A paused TanStack query never settles its invalidate promise; awaiting it
    // is what stranded every activation step behind a spinner. (CW-466)
    const client = makeClient(() => new Promise<never>(() => {}));

    await expect(
      advanceActivationStatus({ mobileActivationStep: 'goal' }, { client, ...keys }),
    ).resolves.toBeUndefined();

    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: keys.invalidateKey });
    expect(client.store.get('key')?.mobileActivationStep).toBe('goal');
  });

  it('applies the optimistic patch before returning', async () => {
    const client = makeClient(() => new Promise<never>(() => {}));
    await advanceActivationStatus(
      { mobileActivationStep: 'plan', primaryGoalId: 'goal-1' },
      { client, ...keys },
    );
    expect(client.store.get('key')?.primaryGoalId).toBe('goal-1');
  });

  it('re-applies the patch once a lagging refetch lands', async () => {
    let resolveInvalidate: (() => void) | undefined;
    const client = makeClient(
      () =>
        new Promise<void>((resolve) => {
          resolveInvalidate = resolve;
        }),
    );

    await advanceActivationStatus({ mobileActivationStep: 'goal' }, { client, ...keys });
    // Server answer lags behind the optimistic advance.
    client.store.set('key', { ...cached, mobileActivationStep: 'consent' });
    resolveInvalidate?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.store.get('key')?.mobileActivationStep).toBe('goal');
  });

  it('still resolves when a rejecting refetch is fired in the background', async () => {
    const client = makeClient(() => Promise.reject(new Error('offline')));
    await expect(
      advanceActivationStatus({ mobileActivationStep: 'goal' }, { client, ...keys }),
    ).resolves.toBeUndefined();
  });

  it('does not touch the cache when there is no identity key', async () => {
    const client = makeClient(() => Promise.resolve());
    await advanceActivationStatus(
      { mobileActivationStep: 'goal' },
      { client, cacheKey: null, invalidateKey: keys.invalidateKey },
    );
    expect(client.setQueryData).not.toHaveBeenCalled();
  });
});

describe('settleWithin', () => {
  it('resolves with the promise value when it settles in time', async () => {
    await expect(settleWithin(Promise.resolve('done'), 1000)).resolves.toBe('done');
  });

  it('resolves undefined instead of hanging when the promise never settles', async () => {
    await expect(settleWithin(new Promise<string>(() => {}), 5)).resolves.toBeUndefined();
  });

  it('propagates a rejection that wins the race', async () => {
    await expect(settleWithin(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('does not leave a late rejection unhandled', async () => {
    const late = new Promise<string>((_resolve, reject) =>
      setTimeout(() => reject(new Error('late')), 20),
    );
    await expect(settleWithin(late, 1)).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
});
