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

vi.mock('../fetchRemoteWorkouts', () => ({
  fetchRemoteWorkoutsForMatch: vi.fn(async () => []),
}));

vi.mock('../uploadWellness', () => ({
  uploadWellnessPayload: vi.fn(async () => {}),
}));

const uploadPlatformWorkout = vi.fn(async () => ({
  queued: true,
  duplicate: false,
  remoteWorkoutId: undefined as string | undefined,
}));
vi.mock('../uploadWorkout', () => ({
  uploadPlatformWorkout: (...args: unknown[]) =>
    uploadPlatformWorkout(...(args as Parameters<typeof uploadPlatformWorkout>)),
}));

const readPlatformWellness = vi.fn(async () => [] as unknown[]);
const readPlatformWorkouts = vi.fn(async () => [] as unknown[]);
vi.mock('../readers', () => ({
  readPlatformWellness: (...args: Parameters<typeof readPlatformWellness>) =>
    readPlatformWellness(...args),
  readPlatformWorkouts: (...args: Parameters<typeof readPlatformWorkouts>) =>
    readPlatformWorkouts(...args),
}));

const setWatermark = vi.fn(async () => {});
vi.mock('../watermarks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../watermarks')>();
  return {
    ...actual,
    setWatermark: (...args: Parameters<typeof setWatermark>) => setWatermark(...args),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

import { _resetSyncLedgerForTests, getLedgerItem } from '../ledger';
import { workoutLedgerId } from '../ledgerHelpers';
import { runHealthSyncPass } from '../orchestrator';
import { _resetWatermarksForTests } from '../watermarks';

const SESSION = {
  platformSessionId: 'sess-dup',
  platform: 'healthkit' as const,
  startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  durationSec: 3600,
};
const LEDGER_ID = workoutLedgerId(SESSION.platformSessionId);

describe('workout uploads that come back queued (CW-463)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await AsyncStorage.clear();
    _resetSyncLedgerForTests();
    await _resetWatermarksForTests();
    readPlatformWellness.mockResolvedValue([]);
    readPlatformWorkouts.mockResolvedValue([SESSION]);
  });

  it('treats duplicate-without-id as synced and stops re-uploading it', async () => {
    uploadPlatformWorkout.mockResolvedValue({
      queued: true,
      duplicate: true,
      remoteWorkoutId: undefined,
    });

    const first = await runHealthSyncPass();
    expect(first.workoutsSynced).toBe(1);
    expect(first.workoutsPending).toBe(0);

    const item = await getLedgerItem(LEDGER_ID);
    expect(item?.status).toBe('synced');
    expect(item?.serverDuplicateNoId).toBe(true);

    // Watermark may advance because nothing is pending/failed any more.
    expect(setWatermark).toHaveBeenCalledWith('workout', expect.any(String), 'healthkit');

    // A later pass must not upload it again.
    uploadPlatformWorkout.mockClear();
    await runHealthSyncPass();
    expect(uploadPlatformWorkout).not.toHaveBeenCalled();
  });

  it('abandons a workout the server keeps queueing without an id so the watermark can advance', async () => {
    uploadPlatformWorkout.mockResolvedValue({
      queued: true,
      duplicate: false,
      remoteWorkoutId: undefined,
    });

    // Round 1: uploaded, server queued it without an id.
    const first = await runHealthSyncPass();
    expect(first.workoutsPending).toBe(1);
    expect(setWatermark).not.toHaveBeenCalledWith('workout', expect.any(String), 'healthkit');

    // Force further rounds (force bypasses the 30-minute queued backoff and
    // stands in for the passes that would happen every QUEUED_RETRY_AFTER_MS).
    await runHealthSyncPass({ force: true });
    await runHealthSyncPass({ force: true });

    setWatermark.mockClear();
    uploadPlatformWorkout.mockClear();

    // Next unforced pass gives up rather than re-uploading forever.
    const last = await runHealthSyncPass();
    expect(uploadPlatformWorkout).not.toHaveBeenCalled();
    expect(last.workoutsAbandoned).toBe(1);
    expect(last.workoutsPending).toBe(0);
    expect(last.workoutsFailed).toBe(0);
    expect(setWatermark).toHaveBeenCalledWith('workout', expect.any(String), 'healthkit');

    const item = await getLedgerItem(LEDGER_ID);
    expect(item?.status).toBe('failed');
    expect(item?.lastError).toContain('never returned an id');
  });
});
