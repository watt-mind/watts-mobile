import { describe, expect, it, vi } from 'vitest';

import { teardownSessionCaches } from '../sessionTeardown';

/** Resolve after `ticks` microtask turns so "awaited?" is actually observable. */
function afterTicks(ticks: number): Promise<void> {
  let promise = Promise.resolve();
  for (let i = 0; i < ticks; i += 1) promise = promise.then(() => undefined);
  return promise;
}

describe('teardownSessionCaches', () => {
  it('cancels in-flight queries, then clears memory, then clears disk', async () => {
    const calls: string[] = [];
    const cancelQueries = vi.fn(async () => {
      calls.push('cancel');
    });
    const clearMemoryCache = vi.fn(() => {
      calls.push('memory');
    });
    const clearPersistedCache = vi.fn(async () => {
      calls.push('disk');
    });

    await teardownSessionCaches({ cancelQueries, clearMemoryCache, clearPersistedCache });

    expect(calls).toEqual(['cancel', 'memory', 'disk']);
    expect(cancelQueries).toHaveBeenCalledTimes(1);
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(clearPersistedCache).toHaveBeenCalledTimes(1);
  });

  it('awaits each step before starting the next', async () => {
    const calls: string[] = [];
    const cancelQueries = vi.fn(async () => {
      calls.push('cancel:start');
      await afterTicks(3);
      calls.push('cancel:end');
    });
    // Resolves on a later tick: the disk wipe must not start until it settles.
    const clearMemoryCache = vi.fn(async () => {
      calls.push('memory:start');
      await afterTicks(3);
      calls.push('memory:end');
    });
    const clearPersistedCache = vi.fn(async () => {
      calls.push('disk:start');
      await afterTicks(1);
      calls.push('disk:end');
    });

    await teardownSessionCaches({ cancelQueries, clearMemoryCache, clearPersistedCache });

    expect(calls).toEqual([
      'cancel:start',
      'cancel:end',
      'memory:start',
      'memory:end',
      'disk:start',
      'disk:end',
    ]);
  });

  it('does not start the disk wipe before the in-memory clear has run', async () => {
    const clearPersistedCache = vi.fn(async () => {
      expect(clearMemoryCache).toHaveBeenCalledTimes(1);
    });
    const clearMemoryCache = vi.fn(() => {
      expect(clearPersistedCache).not.toHaveBeenCalled();
    });

    await teardownSessionCaches({
      cancelQueries: vi.fn(async () => {
        expect(clearMemoryCache).not.toHaveBeenCalled();
      }),
      clearMemoryCache,
      clearPersistedCache,
    });

    expect(clearPersistedCache).toHaveBeenCalledTimes(1);
  });

  it('still clears memory and disk when cancellation rejects', async () => {
    const calls: string[] = [];
    const clearMemoryCache = vi.fn(() => {
      calls.push('memory');
    });
    const clearPersistedCache = vi.fn(async () => {
      calls.push('disk');
    });

    await teardownSessionCaches({
      cancelQueries: vi.fn(async () => {
        calls.push('cancel');
        throw new Error('cancel blew up');
      }),
      clearMemoryCache,
      clearPersistedCache,
    });

    expect(calls).toEqual(['cancel', 'memory', 'disk']);
  });

  it('still wipes disk when the in-memory clear throws', async () => {
    const clearPersistedCache = vi.fn(async () => undefined);

    await teardownSessionCaches({
      cancelQueries: vi.fn(async () => undefined),
      clearMemoryCache: vi.fn(() => {
        throw new Error('clear blew up');
      }),
      clearPersistedCache,
    });

    expect(clearPersistedCache).toHaveBeenCalledTimes(1);
  });
});
