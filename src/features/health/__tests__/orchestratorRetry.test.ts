/* eslint-disable import/first -- vi.mock factories must be declared before the modules under test are imported. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => true },
}));

vi.mock('@/src/auth/tokenStorage', () => ({
  loadTokens: vi.fn(async () => ({ accessToken: 'token-123' })),
}));

vi.mock('../syncPreferences', () => ({
  loadHealthSyncPreferences: vi.fn(async () => ({
    syncEnabled: true,
    syncWorkouts: true,
    workoutsDefaultApplied: true,
  })),
  markHealthSyncSuccess: vi.fn(async () => {}),
}));

const fetchRemoteWorkoutsForMatch = vi.fn(async (_lookbackDays?: number) => [] as unknown[]);
vi.mock('../fetchRemoteWorkouts', () => ({
  fetchRemoteWorkoutsForMatch: (...args: Parameters<typeof fetchRemoteWorkoutsForMatch>) =>
    fetchRemoteWorkoutsForMatch(...args),
}));

vi.mock('../uploadWellness', () => ({
  uploadWellnessPayload: vi.fn(async () => {}),
}));

vi.mock('../uploadWorkout', () => ({
  uploadPlatformWorkout: vi.fn(async () => ({ queued: false, remoteWorkoutId: 'r1' })),
}));

type ReadWindowArg = { lookbackDays?: number; from?: Date } | number | undefined;
const readPlatformWellness = vi.fn(async (_window?: ReadWindowArg) => [] as unknown[]);
const readPlatformWorkouts = vi.fn(async (_window?: ReadWindowArg) => [] as unknown[]);
vi.mock('../readers', () => ({
  readPlatformWellness: (...args: Parameters<typeof readPlatformWellness>) =>
    readPlatformWellness(...args),
  readPlatformWorkouts: (...args: Parameters<typeof readPlatformWorkouts>) =>
    readPlatformWorkouts(...args),
}));

import { _resetSyncLedgerForTests, getLedgerItem, saveLedgerItem } from '../ledger';
import { seedNeedsSync, wellnessLedgerId, workoutLedgerId } from '../ledgerHelpers';
import { localDateYmd } from '../mapToWellnessPayload';
import { retryLedgerItem, retryLookbackDays } from '../orchestrator';
import { LOOKBACK_DAYS } from '../types';

function ymdDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateYmd(d);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

describe('retryLookbackDays', () => {
  it('keeps the default pass window for recent items', () => {
    expect(retryLookbackDays(ymdDaysAgo(0))).toBe(LOOKBACK_DAYS);
    expect(retryLookbackDays(ymdDaysAgo(5))).toBe(LOOKBACK_DAYS);
    expect(retryLookbackDays(undefined)).toBe(LOOKBACK_DAYS);
  });

  // CW-462: retention keeps 90 wellness days, so a retry must reach past the
  // 14-day pass window rather than always throwing "no metrics for that day".
  it('widens far enough to cover an item older than the pass window', () => {
    expect(retryLookbackDays(ymdDaysAgo(60))).toBeGreaterThan(60);
    expect(retryLookbackDays(isoDaysAgo(45))).toBeGreaterThan(45);
  });

  it('caps the widened window', () => {
    expect(retryLookbackDays(ymdDaysAgo(5000))).toBe(400);
  });

  it('ignores an unparseable anchor', () => {
    expect(retryLookbackDays('not-a-date')).toBe(LOOKBACK_DAYS);
  });
});

describe('retryLedgerItem read window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSyncLedgerForTests();
    readPlatformWellness.mockResolvedValue([]);
    readPlatformWorkouts.mockResolvedValue([]);
    fetchRemoteWorkoutsForMatch.mockResolvedValue([]);
  });

  it('reads a window that covers an old wellness day and syncs it', async () => {
    const date = ymdDaysAgo(60);
    const id = wellnessLedgerId(date);
    await saveLedgerItem(
      seedNeedsSync('wellness', {
        id,
        kind: 'wellness',
        platform: 'healthkit',
        title: date,
        localDate: date,
      }),
    );
    readPlatformWellness.mockResolvedValue([{ date, platform: 'healthkit', steps: 5000 }]);

    await retryLedgerItem(id);

    const window = readPlatformWellness.mock.calls[0]?.[0] as { lookbackDays: number };
    expect(window.lookbackDays).toBeGreaterThan(60);
    expect((await getLedgerItem(id))?.status).toBe('synced');
  });

  it('records the reason on the item when the day is truly unreadable', async () => {
    const date = ymdDaysAgo(30);
    const id = wellnessLedgerId(date);
    await saveLedgerItem(
      seedNeedsSync('wellness', {
        id,
        kind: 'wellness',
        platform: 'healthkit',
        title: date,
        localDate: date,
      }),
    );
    readPlatformWellness.mockResolvedValue([]);

    await expect(retryLedgerItem(id)).rejects.toThrow('No on-device metrics for that day');

    const item = await getLedgerItem(id);
    expect(item?.status).toBe('failed');
    expect(item?.lastError).toBe('No on-device metrics for that day');
  });

  it('widens the workout read + remote match window to the session date', async () => {
    const startedAt = isoDaysAgo(50);
    const id = workoutLedgerId('sess-1');
    await saveLedgerItem(
      seedNeedsSync('workout', {
        id,
        kind: 'workout',
        platform: 'healthkit',
        title: 'Ride',
        startedAt,
      }),
    );
    readPlatformWorkouts.mockResolvedValue([
      { platformSessionId: 'sess-1', platform: 'healthkit', startedAt, durationSec: 3600 },
    ]);

    await retryLedgerItem(id);

    const window = readPlatformWorkouts.mock.calls[0]?.[0] as { lookbackDays: number };
    expect(window.lookbackDays).toBeGreaterThan(50);
    expect(fetchRemoteWorkoutsForMatch).toHaveBeenCalledWith(window.lookbackDays);
    expect((await getLedgerItem(id))?.status).toBe('synced');
  });

  it('records the reason when the workout is no longer on device', async () => {
    const startedAt = isoDaysAgo(20);
    const id = workoutLedgerId('sess-gone');
    await saveLedgerItem(
      seedNeedsSync('workout', {
        id,
        kind: 'workout',
        platform: 'healthkit',
        title: 'Ride',
        startedAt,
      }),
    );
    readPlatformWorkouts.mockResolvedValue([]);

    await expect(retryLedgerItem(id)).rejects.toThrow('Workout no longer on device');

    const item = await getLedgerItem(id);
    expect(item?.status).toBe('failed');
    expect(item?.lastError).toBe('Workout no longer on device');
  });
});
