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

type Store = {
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: number | null;
};

const store: Store = { accessToken: null, refreshToken: null, accessExpiresAt: null };
const mockClearTokens = vi.fn();

vi.mock('@/src/auth/tokenStorage', () => ({
  loadTokens: async () => (store.accessToken ? { ...store } : null),
  saveTokens: async (tokens: {
    accessToken: string;
    refreshToken?: string | null;
    expiresIn?: number | null;
  }) => {
    store.accessToken = tokens.accessToken;
    if (tokens.refreshToken !== undefined) {
      store.refreshToken = tokens.refreshToken;
    }
    return { ...store };
  },
  clearTokens: (...args: unknown[]) => {
    mockClearTokens(...args);
    store.accessToken = null;
    store.refreshToken = null;
  },
}));

import { apiFetch, setAuthFailureHandler } from '../client';
import { resetAuthSessionGenerationForTests } from '@/src/auth/authSessionGeneration';

const authHeaderOf = (init: RequestInit | undefined): string | null =>
  new Headers(init?.headers).get('Authorization');

describe('apiFetch concurrent-401 refresh race (CW-458)', () => {
  const failureHandler = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthSessionGenerationForTests();
    setAuthFailureHandler(failureHandler);
    store.accessToken = 'access-1';
    store.refreshToken = 'refresh-1';
    store.accessExpiresAt = null;
  });

  it('refreshes once for a burst of concurrent 401s and keeps the session', async () => {
    let refreshCount = 0;
    let staleRequests = 0;
    const authHeaders: (string | null)[] = [];

    // Released once the first of the two requests has fully completed (i.e. the refresh
    // rotated the tokens and the single-flight promise was already cleared) — this is the
    // exact window where the buggy code started a SECOND refresh with a consumed token.
    let releaseSecondRequest!: () => void;
    const secondRequestGate = new Promise<void>((resolve) => {
      releaseSecondRequest = resolve;
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/oauth/token')) {
        refreshCount += 1;
        const body = JSON.parse(String(init?.body)) as { refresh_token?: string };
        if (body.refresh_token !== 'refresh-1') {
          // A consumed (rotated) refresh token — the server rejects it with invalid_grant.
          return {
            status: 400,
            ok: false,
            json: async () => ({ error: 'invalid_grant' }),
          } as Response;
        }
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

      const auth = authHeaderOf(init);
      authHeaders.push(auth);

      if (auth === 'Bearer access-1') {
        staleRequests += 1;
        if (staleRequests === 2) {
          await secondRequestGate;
        }
        return { status: 401, ok: false } as Response;
      }

      return { status: 200, ok: true } as Response;
    }) as unknown as typeof fetch;

    const first = apiFetch('/api/first').then((res) => {
      releaseSecondRequest();
      return res;
    });
    const second = apiFetch('/api/second').then((res) => {
      releaseSecondRequest();
      return res;
    });

    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(refreshCount).toBe(1);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    // Both requests were retried with the freshly rotated access token.
    expect(authHeaders.filter((header) => header === 'Bearer access-2')).toHaveLength(2);
    expect(mockClearTokens).not.toHaveBeenCalled();
    expect(failureHandler).not.toHaveBeenCalled();
    expect(store.accessToken).toBe('access-2');
  });

  it('still clears the session when the refresh token is genuinely invalid', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/oauth/token')) {
        return {
          status: 400,
          ok: false,
          json: async () => ({ error: 'invalid_grant' }),
        } as Response;
      }
      return { status: 401, ok: false } as Response;
    }) as unknown as typeof fetch;

    const response = await apiFetch('/api/first');

    expect(response.status).toBe(401);
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(failureHandler).toHaveBeenCalledTimes(1);
  });
});
