import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { coachChatFetch } from '../coachFetch';

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
