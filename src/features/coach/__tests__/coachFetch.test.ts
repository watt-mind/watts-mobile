import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/src/api/errors';

const { expoFetch, singleFlightRefresh, notifyAuthFailure, clearTokens, loadTokens } = vi.hoisted(
  () => ({
    expoFetch: vi.fn(),
    singleFlightRefresh: vi.fn(),
    notifyAuthFailure: vi.fn(),
    clearTokens: vi.fn(),
    loadTokens: vi.fn(),
  }),
);

vi.mock('expo/fetch', () => ({ fetch: expoFetch }));

vi.mock('@/src/api/client', () => ({
  singleFlightRefresh,
  notifyAuthFailure,
  getAuthSessionGeneration: () => 0,
}));

vi.mock('@/src/auth/tokenStorage', () => ({ clearTokens, loadTokens }));

vi.mock('@/src/config/instance', () => ({
  getInstanceUrl: vi.fn(async () => 'https://coachwatts.com'),
}));

import { COACH_CHAT_TTFB_TIMEOUT_MS, coachChatFetch } from '../coachFetch';

const CHAT_URL = 'https://coachwatts.com/api/chat/messages';

/**
 * Stand-in for a request whose response headers never arrive, but which still
 * honours its `AbortSignal` the way a real `fetch` does. Lets the tests observe
 * both the timeout path and the composed-signal path.
 */
function neverSettlesButAbortable(init?: { signal?: AbortSignal }): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const signal = init?.signal;
    const fail = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    if (!signal) return;
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener('abort', fail);
  });
}

describe('coachChatFetch refresh failure classification (CW-460)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadTokens.mockResolvedValue({
      accessToken: 'stale-access-token',
      refreshToken: 'valid-refresh-token',
      accessExpiresAt: null,
    });
  });

  it('propagates a network error from refresh instead of returning the stale 401', async () => {
    expoFetch.mockResolvedValueOnce({ status: 401, ok: false } as Response);
    singleFlightRefresh.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(coachChatFetch('https://coachwatts.com/api/chat/messages')).rejects.toThrow(
      'Network request failed',
    );
    expect(clearTokens).not.toHaveBeenCalled();
    expect(notifyAuthFailure).not.toHaveBeenCalled();
  });

  it('propagates a 5xx token-endpoint failure from refresh', async () => {
    expoFetch.mockResolvedValueOnce({ status: 401, ok: false } as Response);
    singleFlightRefresh.mockRejectedValueOnce(new ApiError('Token refresh failed (502)', 502));

    await expect(coachChatFetch('https://coachwatts.com/api/chat/messages')).rejects.toMatchObject({
      status: 502,
    });
    expect(clearTokens).not.toHaveBeenCalled();
    expect(notifyAuthFailure).not.toHaveBeenCalled();
  });

  it('still clears the session when refresh is explicitly invalidated', async () => {
    expoFetch.mockResolvedValueOnce({ status: 401, ok: false } as Response);
    singleFlightRefresh.mockRejectedValueOnce(new ApiError('invalid_grant', 400));

    const response = await coachChatFetch('https://coachwatts.com/api/chat/messages');

    expect(response.status).toBe(401);
    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(notifyAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('retries with the refreshed access token on a recoverable 401', async () => {
    expoFetch
      .mockResolvedValueOnce({ status: 401, ok: false } as Response)
      .mockResolvedValueOnce({ status: 200, ok: true } as Response);
    singleFlightRefresh.mockResolvedValueOnce({
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
      accessExpiresAt: null,
    });

    const response = await coachChatFetch('https://coachwatts.com/api/chat/messages');

    expect(response.status).toBe(200);
    const retryHeaders = new Headers(expoFetch.mock.calls[1][1].headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-access-token');
    expect(clearTokens).not.toHaveBeenCalled();
  });
});

describe('coachChatFetch time-to-first-byte timeout (CW-339)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expoFetch.mockReset();
    loadTokens.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    expoFetch.mockReset();
  });

  it('rejects with a timeout error when response headers never arrive', async () => {
    vi.useFakeTimers();
    expoFetch.mockImplementation((_url: string, init?: { signal?: AbortSignal }) =>
      neverSettlesButAbortable(init),
    );

    const promise = coachChatFetch(CHAT_URL);
    const assertion = expect(promise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(COACH_CHAT_TTFB_TIMEOUT_MS + 1);
    await assertion;

    // A timeout is not an auth failure: the session must survive it (CW-460).
    expect(clearTokens).not.toHaveBeenCalled();
    expect(notifyAuthFailure).not.toHaveBeenCalled();
  });

  it('aborts the in-flight request when the timeout fires', async () => {
    vi.useFakeTimers();
    let observed: AbortSignal | undefined;
    expoFetch.mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
      observed = init?.signal;
      return neverSettlesButAbortable(init);
    });

    const promise = coachChatFetch(CHAT_URL);
    const assertion = expect(promise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(COACH_CHAT_TTFB_TIMEOUT_MS + 1);
    await assertion;

    expect(observed?.aborted).toBe(true);
  });

  it('does not abort a response whose headers arrived in time, however long the body streams', async () => {
    vi.useFakeTimers();
    let observed: AbortSignal | undefined;
    expoFetch.mockImplementation(async (_url: string, init?: { signal?: AbortSignal }) => {
      observed = init?.signal;
      return { status: 200, ok: true } as Response;
    });

    const response = await coachChatFetch(CHAT_URL);
    expect(response.status).toBe(200);

    // The SSE body is still streaming long after the TTFB budget would have elapsed.
    await vi.advanceTimersByTimeAsync(COACH_CHAT_TTFB_TIMEOUT_MS * 5);

    expect(observed?.aborted).toBe(false);
  });

  it('composes a caller-supplied signal rather than replacing it', async () => {
    const caller = new AbortController();
    expoFetch.mockImplementation((_url: string, init?: { signal?: AbortSignal }) =>
      neverSettlesButAbortable(init),
    );

    const promise = coachChatFetch(CHAT_URL, { signal: caller.signal });
    const assertion = expect(promise).rejects.toThrow(/abort/i);
    caller.abort();
    await assertion;

    const forwarded = expoFetch.mock.calls[0][1].signal as AbortSignal;
    expect(forwarded).toBeDefined();
    expect(forwarded).not.toBe(caller.signal);
    expect(forwarded.aborted).toBe(true);
  });

  it('rejects a caller signal that is already aborted before the request starts', async () => {
    expoFetch.mockImplementation((_url: string, init?: { signal?: AbortSignal }) =>
      neverSettlesButAbortable(init),
    );

    await expect(coachChatFetch(CHAT_URL, { signal: AbortSignal.abort() })).rejects.toThrow(
      /abort/i,
    );
  });

  it('applies the same timeout to the post-refresh retry without clearing the session', async () => {
    vi.useFakeTimers();
    expoFetch
      .mockResolvedValueOnce({ status: 401, ok: false } as Response)
      .mockImplementation((_url: string, init?: { signal?: AbortSignal }) =>
        neverSettlesButAbortable(init),
      );
    singleFlightRefresh.mockResolvedValueOnce({
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
      accessExpiresAt: null,
    });

    const promise = coachChatFetch(CHAT_URL);
    const assertion = expect(promise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(COACH_CHAT_TTFB_TIMEOUT_MS + 1);
    await assertion;

    expect(expoFetch).toHaveBeenCalledTimes(2);
    expect(clearTokens).not.toHaveBeenCalled();
    expect(notifyAuthFailure).not.toHaveBeenCalled();
  });
});
