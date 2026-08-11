import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
  openBrowserAsync: vi.fn(),
}));

vi.mock('expo-auth-session', () => ({
  makeRedirectUri: vi.fn(() => 'coachwatts://oauth/callback'),
}));

vi.mock('@/src/config/env', () => ({
  APP_SCHEME: 'coachwatts',
  OAUTH_CLIENT_ID: 'mock-client-id',
}));

vi.mock('@/src/config/instance', () => ({
  getInstanceUrl: vi.fn(async () => 'https://coachwatts.com'),
}));

vi.mock('@/src/auth/tokenStorage', () => ({
  loadTokens: async () => ({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessExpiresAt: null,
  }),
  saveTokens: async (tokens: { accessToken: string; refreshToken?: string | null }) => ({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? 'refresh-1',
    accessExpiresAt: null,
  }),
  clearTokens: vi.fn(),
}));

import {
  apiFetch,
  DEFAULT_REQUEST_TIMEOUT_MS,
  UPLOAD_REQUEST_TIMEOUT_MS,
  setAuthFailureHandler,
} from '../client';
import { resetAuthSessionGenerationForTests } from '@/src/auth/authSessionGeneration';

/** A fetch that never resolves on its own — it only settles when its signal aborts. */
function stalledFetch(seen: { signal?: AbortSignal | null }[] = []) {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ signal: init?.signal });
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(signal.reason ?? new Error('aborted'));
        return;
      }
      signal.addEventListener('abort', () => {
        reject(signal.reason ?? new Error('aborted'));
      });
    });
  }) as unknown as typeof fetch;
}

describe('apiFetch request timeout / abort (CW-459)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthSessionGenerationForTests();
    setAuthFailureHandler(null);
  });

  it('exposes sensible named defaults, with more headroom for uploads', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(UPLOAD_REQUEST_TIMEOUT_MS).toBe(120_000);
    expect(UPLOAD_REQUEST_TIMEOUT_MS).toBeGreaterThan(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it('aborts a request that never resolves once the timeout elapses', async () => {
    global.fetch = stalledFetch();

    await expect(apiFetch('/api/stalled', { timeoutMs: 25 })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('attaches a default timeout signal when the caller supplies none', async () => {
    const seen: { signal?: AbortSignal | null }[] = [];
    global.fetch = stalledFetch(seen);

    const pending = apiFetch('/api/stalled', { timeoutMs: 25 }).catch(() => undefined);
    await pending;

    expect(seen).toHaveLength(1);
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('still aborts when a caller-supplied signal fires before the timeout', async () => {
    global.fetch = stalledFetch();
    const controller = new AbortController();

    const pending = apiFetch('/api/stalled', {
      signal: controller.signal,
      timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    });
    controller.abort(new Error('caller cancelled'));

    await expect(pending).rejects.toThrow('caller cancelled');
  });

  it('does not abort when the caller opts out of the timeout', async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeUndefined();
      return { status: 200, ok: true } as Response;
    }) as unknown as typeof fetch;

    const response = await apiFetch('/api/stream', { timeoutMs: 0 });
    expect(response.status).toBe(200);
  });

  it('applies a fresh timeout to the post-refresh retry', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/oauth/token')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: 'access-2',
            refresh_token: 'refresh-2',
            expires_in: 3600,
          }),
        } as Response;
      }
      signals.push(init?.signal);
      const auth = new Headers(init?.headers).get('Authorization');
      return { status: auth === 'Bearer access-2' ? 200 : 401, ok: auth === 'Bearer access-2' };
    }) as unknown as typeof fetch;

    const response = await apiFetch('/api/needs-refresh');

    expect(response.status).toBe(200);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBeInstanceOf(AbortSignal);
    // Two independent deadlines, not the same (already partly consumed) one.
    expect(signals[0]).not.toBe(signals[1]);
  });
});
