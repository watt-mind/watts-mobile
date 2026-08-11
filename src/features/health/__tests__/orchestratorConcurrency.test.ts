/* eslint-disable import/first -- vi.mock factories must be declared before the modules under test are imported. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformWorkoutSession } from '../types';

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

/**
 * Every upload hands back a promise the test resolves by hand, so an upload that
 * has started stays open long enough for a second caller to reach the same
 * ledger item. `uploadStarted()` resolves once the Nth upload call has begun.
 */
type PendingUpload = { session: PlatformWorkoutSession; resolve: () => void };
let pendingUploads: PendingUpload[] = [];
let uploadStartedWaiters: (() => void)[] = [];

const uploadPlatformWorkout = vi.fn((session: PlatformWorkoutSession) => {
  return new Promise<{ queued: boolean; remoteWorkoutId?: string }>((resolveUpload) => {
    pendingUploads.push({
      session,
      resolve: () =>
        resolveUpload({ queued: false, remoteWorkoutId: `remote-${pendingUploads.length}` }),
    });
    uploadStartedWaiters.splice(0).forEach((w) => w());
  });
});

vi.mock('../uploadWorkout', () => ({
  uploadPlatformWorkout: (...args: [PlatformWorkoutSession]) => uploadPlatformWorkout(...args),
}));

const readPlatformWorkouts = vi.fn(async () => [] as PlatformWorkoutSession[]);
vi.mock('../readers', () => ({
  readPlatformWellness: vi.fn(async () => []),
  readPlatformWorkouts: (...args: unknown[]) =>
    readPlatformWorkouts(...(args as Parameters<typeof readPlatformWorkouts>)),
}));

const findPlatformWorkoutSession = vi.fn(
  async (_id: string) => undefined as PlatformWorkoutSession | undefined,
);
vi.mock('../recentWorkouts', () => ({
  listRecentPlatformWorkoutsWithStatus: vi.fn(async () => []),
  findPlatformWorkoutSession: (...args: [string]) => findPlatformWorkoutSession(...args),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { _resetSyncLedgerForTests } from '../ledger';
import { runHealthSyncPass, syncWorkoutByPlatformSessionId } from '../orchestrator';

function session(platformSessionId: string): PlatformWorkoutSession {
  return {
    platformSessionId,
    platform: 'healthkit',
    startedAt: '2026-07-20T09:00:00.000Z',
    endedAt: '2026-07-20T10:00:00.000Z',
    durationSec: 3600,
    sportType: 'cycling',
  };
}

/** Resolve once at least `count` uploads have been started. */
function uploadsStarted(count: number): Promise<void> {
  if (pendingUploads.length >= count) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const check = () => {
      if (pendingUploads.length >= count) resolve();
      else uploadStartedWaiters.push(check);
    };
    uploadStartedWaiters.push(check);
  });
}

/** Let queued microtasks/timers drain so any second upload would have started. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
}

function resolveAllUploads(): void {
  pendingUploads.splice(0).forEach((u) => u.resolve());
}

// CW-343: a manual sync and a background pass could both read the same stale
// ledger snapshot and both issue an upload for one session.
describe('concurrent sync of the same workout', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    pendingUploads = [];
    uploadStartedWaiters = [];
    await AsyncStorage.clear();
    _resetSyncLedgerForTests();
    readPlatformWorkouts.mockResolvedValue([]);
    findPlatformWorkoutSession.mockResolvedValue(undefined);
  });

  it('uploads a session exactly once when a pass and a manual sync overlap', async () => {
    const target = session('sess-race');
    readPlatformWorkouts.mockResolvedValue([target]);
    findPlatformWorkoutSession.mockResolvedValue(target);

    const passPromise = runHealthSyncPass();
    // Wait until the pass is parked inside the upload for this session.
    await uploadsStarted(1);

    const manualPromise = syncWorkoutByPlatformSessionId('sess-race', { force: true });
    await settle();

    // The manual sync must join the in-flight upload, not start a second one.
    expect(uploadPlatformWorkout).toHaveBeenCalledTimes(1);

    resolveAllUploads();
    await Promise.all([passPromise, manualPromise]);
    await settle();
    resolveAllUploads();

    expect(uploadPlatformWorkout).toHaveBeenCalledTimes(1);
  });

  it('still uploads two different sessions concurrently', async () => {
    const a = session('sess-a');
    const b = session('sess-b');
    findPlatformWorkoutSession.mockImplementation(async (id: string) =>
      id === 'sess-a' ? a : id === 'sess-b' ? b : undefined,
    );

    const first = syncWorkoutByPlatformSessionId('sess-a', { force: true });
    const second = syncWorkoutByPlatformSessionId('sess-b', { force: true });

    // Both uploads must be open at the same time — the lock is per ledger id,
    // so unrelated work is never serialised behind another item.
    await uploadsStarted(2);
    expect(uploadPlatformWorkout).toHaveBeenCalledTimes(2);
    expect(pendingUploads.map((u) => u.session.platformSessionId).sort()).toEqual([
      'sess-a',
      'sess-b',
    ]);

    resolveAllUploads();
    await Promise.all([first, second]);
  });
});
