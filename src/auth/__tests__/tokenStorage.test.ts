import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bumpAuthSessionGeneration,
  resetAuthSessionGenerationForTests,
} from '../authSessionGeneration';
import { clearTokens, loadTokens, saveTokens } from '../tokenStorage';

const store = new Map<string, string>();
let bumpDuringAccessWrite = false;

vi.mock('@/src/storage/secureStorage', () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
    if (key === 'cw.accessToken' && bumpDuringAccessWrite) {
      bumpDuringAccessWrite = false;
      bumpAuthSessionGeneration();
    }
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

describe('saveTokens', () => {
  beforeEach(() => {
    store.clear();
    bumpDuringAccessWrite = false;
    resetAuthSessionGenerationForTests();
  });

  it('deletes refresh token and expiry when explicitly null', async () => {
    await saveTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 3600 });
    expect(store.get('cw.refreshToken')).toBe('r1');
    expect(store.has('cw.accessExpiresAt')).toBe(true);

    const next = await saveTokens({
      accessToken: 'a2',
      refreshToken: null,
      expiresIn: null,
    });
    expect(next.refreshToken).toBeNull();
    expect(next.accessExpiresAt).toBeNull();
    expect(store.has('cw.refreshToken')).toBe(false);
    expect(store.has('cw.accessExpiresAt')).toBe(false);
  });

  it('preserves refresh token and expiry when omitted (undefined)', async () => {
    await saveTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 3600 });
    const kept = await saveTokens({ accessToken: 'a2' });
    expect(kept.refreshToken).toBe('r1');
    expect(kept.accessExpiresAt).not.toBeNull();
    expect(store.get('cw.refreshToken')).toBe('r1');
  });

  it('clears all keys', async () => {
    await saveTokens({ accessToken: 'a1', refreshToken: 'r1', expiresIn: 60 });
    await clearTokens();
    expect(await loadTokens()).toBeNull();
  });

  it('does not clear tokens tagged with a newer auth session generation', async () => {
    await saveTokens({ accessToken: 'old', refreshToken: 'r-old', expiresIn: 60 });
    const staleGeneration = 0;
    bumpAuthSessionGeneration();
    await saveTokens({ accessToken: 'new', refreshToken: 'r-new', expiresIn: 60 });

    await clearTokens(staleGeneration);

    const loaded = await loadTokens();
    expect(loaded?.accessToken).toBe('new');
    expect(loaded?.refreshToken).toBe('r-new');
  });

  it('removes a partial token save when the auth generation changes during persistence', async () => {
    bumpDuringAccessWrite = true;

    await expect(
      saveTokens({ accessToken: 'stale', refreshToken: 'r-stale', expiresIn: 60 }, 0),
    ).rejects.toThrow('Auth session changed during token save');

    expect(await loadTokens()).toBeNull();
    expect(store.has('cw.refreshToken')).toBe(false);
    expect(store.has('cw.authSessionGeneration')).toBe(false);
  });
});
