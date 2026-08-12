/* eslint-disable import/first -- vi.mock factories must be declared before the modules under test are imported. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformWorkoutSession, RemoteWorkoutMatchCandidate, SyncLedgerItem } from '../types';

/**
 * The three pure helpers (`resolveRecentWorkoutStatus`, `buildRecentWorkoutRows`,
 * `isUnsyncedRecentStatus`) live in `recentWorkoutRows.ts` and are asserted on
 * only in `recentWorkoutRows.test.ts` (CW-521). This suite covers what is unique
 * to `recentWorkouts.ts`: the two IO wrappers and how they feed those helpers.
 * `recentWorkoutRows` is deliberately left un-mocked so the rows below are the
 * real thing — that is what makes the remote-failure fallback observable.
 */

const readPlatformWorkouts = vi.fn(async (_opts: { lookbackDays: number }) => [...deviceSessions]);
vi.mock('../readers', () => ({
  readPlatformWorkouts: (...args: Parameters<typeof readPlatformWorkouts>) =>
    readPlatformWorkouts(...args),
}));

const loadSyncLedger = vi.fn(async () => [...ledgerItems]);
vi.mock('../ledger', () => ({
  loadSyncLedger: (...args: Parameters<typeof loadSyncLedger>) => loadSyncLedger(...args),
}));

const fetchRemoteWorkoutsForMatch = vi.fn(async (_lookbackDays: number) => [...remotes]);
vi.mock('../fetchRemoteWorkouts', () => ({
  fetchRemoteWorkoutsForMatch: (...args: Parameters<typeof fetchRemoteWorkoutsForMatch>) =>
    fetchRemoteWorkoutsForMatch(...args),
}));

import {
  findPlatformWorkoutSession,
  listRecentPlatformWorkoutsWithStatus,
} from '../recentWorkouts';
import { LOOKBACK_DAYS } from '../types';

const sampleSession: PlatformWorkoutSession = {
  platformSessionId: 'sess-123',
  platform: 'healthkit',
  sportType: 'cycling',
  startedAt: '2026-07-26T10:00:00Z',
  durationSec: 3600,
  distanceMeters: 30000,
};

const olderSession: PlatformWorkoutSession = {
  platformSessionId: 'sess-100',
  platform: 'healthkit',
  sportType: 'running',
  startedAt: '2026-07-25T08:00:00Z',
  durationSec: 1800,
};

/** Matches `sampleSession` on start time, duration and sport. */
const sampleRemote: RemoteWorkoutMatchCandidate = {
  id: 'remote-789',
  date: '2026-07-26T10:00:00Z',
  durationSec: 3600,
  type: 'cycling',
};

let deviceSessions: PlatformWorkoutSession[] = [];
let ledgerItems: SyncLedgerItem[] = [];
let remotes: RemoteWorkoutMatchCandidate[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  deviceSessions = [sampleSession];
  ledgerItems = [];
  remotes = [];
  fetchRemoteWorkoutsForMatch.mockImplementation(async () => [...remotes]);
});

describe('listRecentPlatformWorkoutsWithStatus', () => {
  it('overlays the ledger and the remote match onto the device sessions, newest first', async () => {
    deviceSessions = [olderSession, sampleSession];
    remotes = [sampleRemote];
    ledgerItems = [
      {
        id: 'workout:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'synced',
        remoteWorkoutId: 'remote-789',
        attemptCount: 1,
      },
    ];

    const rows = await listRecentPlatformWorkoutsWithStatus();

    expect(rows.map((r) => r.platformSessionId)).toEqual(['sess-123', 'sess-100']);
    expect(rows[0]?.status).toBe('synced');
    expect(rows[0]?.remoteWorkoutId).toBe('remote-789');
    expect(rows[1]?.status).toBe('needs_sync');
  });

  it('reads the default lookback window, and an explicit one when given', async () => {
    await listRecentPlatformWorkoutsWithStatus();
    expect(readPlatformWorkouts).toHaveBeenCalledWith({ lookbackDays: LOOKBACK_DAYS });
    expect(fetchRemoteWorkoutsForMatch).toHaveBeenCalledWith(LOOKBACK_DAYS);

    await listRecentPlatformWorkoutsWithStatus(3);
    expect(readPlatformWorkouts).toHaveBeenLastCalledWith({ lookbackDays: 3 });
    expect(fetchRemoteWorkoutsForMatch).toHaveBeenLastCalledWith(3);
  });

  it('still builds rows when the remote match fails, falling back to an empty remote list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Control: with the remote reachable this exact session resolves to `synced`
    // purely via the match, so the fallback below is the only thing that can
    // change the outcome. If the try/catch in recentWorkouts.ts is removed, this
    // call rejects and the test fails rather than reporting `needs_sync`.
    remotes = [sampleRemote];
    const [matched] = await listRecentPlatformWorkoutsWithStatus();
    expect(matched?.status).toBe('synced');

    fetchRemoteWorkoutsForMatch.mockRejectedValueOnce(new Error('offline'));

    const rows = await listRecentPlatformWorkoutsWithStatus();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.platformSessionId).toBe('sess-123');
    // Built from an empty `remotes` list: no match, no ledger, so needs_sync —
    // and no remote id invented from the failed lookup.
    expect(rows[0]?.status).toBe('needs_sync');
    expect(rows[0]?.remoteWorkoutId).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[HealthSync] recent workouts remote match failed',
      'offline',
    );
    warn.mockRestore();
  });

  it('keeps the ledger overlay when the remote match fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ledgerItems = [
      {
        id: 'workout:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'failed',
        lastError: 'Upload failed',
        attemptCount: 2,
      },
    ];
    fetchRemoteWorkoutsForMatch.mockRejectedValueOnce(new Error('offline'));

    const [row] = await listRecentPlatformWorkoutsWithStatus();

    expect(row?.status).toBe('failed');
    expect(row?.lastError).toBe('Upload failed');
    warn.mockRestore();
  });

  it('returns an empty list when the device has no sessions in the window', async () => {
    deviceSessions = [];
    await expect(listRecentPlatformWorkoutsWithStatus()).resolves.toEqual([]);
  });
});

describe('findPlatformWorkoutSession', () => {
  it('returns the session with the given platform id', async () => {
    deviceSessions = [olderSession, sampleSession];

    await expect(findPlatformWorkoutSession('sess-123')).resolves.toEqual(sampleSession);
    expect(readPlatformWorkouts).toHaveBeenCalledWith({ lookbackDays: LOOKBACK_DAYS });
  });

  it('returns undefined when the session is no longer readable', async () => {
    deviceSessions = [olderSession];

    await expect(findPlatformWorkoutSession('sess-123')).resolves.toBeUndefined();
  });

  it('honours an explicit lookback window', async () => {
    await findPlatformWorkoutSession('sess-123', 3);
    expect(readPlatformWorkouts).toHaveBeenCalledWith({ lookbackDays: 3 });
  });
});
