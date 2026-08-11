import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchTodayDailyCheckin } from '../dailyCheckinApi';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/src/api/client', () => ({ apiFetch }));

function jsonResponse(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

describe('fetchTodayDailyCheckin', () => {
  beforeEach(() => apiFetch.mockReset());

  it('parses a JSON check-in body', async () => {
    apiFetch.mockResolvedValue(jsonResponse(200, JSON.stringify({ id: 'c1', status: 'PENDING' })));

    await expect(fetchTodayDailyCheckin()).resolves.toMatchObject({ id: 'c1' });
  });

  it('returns null for empty and literal-null bodies', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(200, ''));
    await expect(fetchTodayDailyCheckin()).resolves.toBeNull();

    apiFetch.mockResolvedValueOnce(jsonResponse(200, 'null'));
    await expect(fetchTodayDailyCheckin()).resolves.toBeNull();
  });

  it('returns null for 204 and 404 without reading the body', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(204, ''));
    await expect(fetchTodayDailyCheckin()).resolves.toBeNull();

    apiFetch.mockResolvedValueOnce(jsonResponse(404, ''));
    await expect(fetchTodayDailyCheckin()).resolves.toBeNull();
  });

  it('reports a friendly error instead of a raw SyntaxError on a captive-portal 200', async () => {
    apiFetch.mockResolvedValue(jsonResponse(200, '<!doctype html><html>Sign in to WiFi</html>'));

    const error = await fetchTodayDailyCheckin().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SyntaxError);
    expect((error as Error).message).toBe("Failed to load today's check-in (unexpected response).");
  });

  it('keeps the status fallback for non-ok responses', async () => {
    apiFetch.mockResolvedValue(jsonResponse(500, 'boom'));

    await expect(fetchTodayDailyCheckin()).rejects.toThrow("Failed to load today's check-in (500)");
  });
});
