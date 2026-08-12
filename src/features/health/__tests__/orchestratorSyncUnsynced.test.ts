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

vi.mock('../uploadWorkout', () => ({
  uploadPlatformWorkout: vi.fn(async () => ({ queued: false, remoteWorkoutId: 'r1' })),
}));

const readPlatformWellness = vi.fn(async () => [] as unknown[]);
const readPlatformWorkouts = vi.fn(async () => [] as unknown[]);
vi.mock('../readers', () => ({
  readPlatformWellness: (...args: Parameters<typeof readPlatformWellness>) =>
    readPlatformWellness(...args),
  readPlatformWorkouts: (...args: Parameters<typeof readPlatformWorkouts>) =>
    readPlatformWorkouts(...args),
}));

const listRecentPlatformWorkoutsWithStatus = vi.fn(async () => [] as unknown[]);
vi.mock('../recentWorkouts', () => ({
  listRecentPlatformWorkoutsWithStatus: (
    ...args: Parameters<typeof listRecentPlatformWorkoutsWithStatus>
  ) => listRecentPlatformWorkoutsWithStatus(...args),
  findPlatformWorkoutSession: vi.fn(async () => undefined),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { _resetSyncLedgerForTests, getLedgerItem } from '../ledger';
import { workoutLedgerId } from '../ledgerHelpers';
import { syncUnsyncedWorkouts } from '../orchestrator';

const ROW = {
  platformSessionId: 'sess-gone',
  platform: 'healthkit' as const,
  title: 'Ride · 60 min',
  startedAt: '2026-07-20T09:00:00.000Z',
  status: 'needs_sync' as const,
  ledgerId: workoutLedgerId('sess-gone'),
};

// CW-465(b): "Sync all" reported that some workouts could not be synced while
// every row still showed a bare needs_sync with no explanation.
describe('syncUnsyncedWorkouts on a no-longer-readable session', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await AsyncStorage.clear();
    _resetSyncLedgerForTests();
    readPlatformWellness.mockResolvedValue([]);
    readPlatformWorkouts.mockResolvedValue([]);
    listRecentPlatformWorkoutsWithStatus.mockResolvedValue([ROW]);
  });

  it('writes the reason to the ledger item and counts it as failed', async () => {
    const result = await syncUnsyncedWorkouts();

    expect(result.attempted).toBe(1);
    expect(result.failed).toBe(1);

    const item = await getLedgerItem(ROW.ledgerId);
    expect(item?.status).toBe('failed');
    expect(item?.lastError).toBe('Workout is no longer readable on this device');
    expect(item?.title).toBe(ROW.title);
  });
});
