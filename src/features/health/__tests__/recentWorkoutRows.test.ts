import { describe, expect, it } from 'vitest';

import {
  buildRecentWorkoutRows,
  isUnsyncedRecentStatus,
  resolveRecentWorkoutStatus,
  SYNCING_STALE_AFTER_MS,
} from '../recentWorkoutRows';
import type { PlatformWorkoutSession, RemoteWorkoutMatchCandidate, SyncLedgerItem } from '../types';

describe('recentWorkoutRows', () => {
  const NOW = Date.parse('2026-07-26T12:00:00Z');
  /** Attempt that began well inside the staleness window — still plausibly running. */
  const FRESH_ATTEMPT_AT = new Date(NOW - 60 * 1000).toISOString();
  /** Attempt that began before the window — its writer is gone (app killed mid-attempt). */
  const STALE_ATTEMPT_AT = new Date(NOW - SYNCING_STALE_AFTER_MS - 60 * 1000).toISOString();

  const sampleSession: PlatformWorkoutSession = {
    platformSessionId: 'sess-123',
    platform: 'healthkit',
    sportType: 'cycling',
    startedAt: '2026-07-26T10:00:00Z',
    durationSec: 3600,
    distanceMeters: 30000,
  };

  const sampleRemote: RemoteWorkoutMatchCandidate = {
    id: 'remote-789',
    date: '2026-07-26T10:00:00Z',
    durationSec: 3600,
    type: 'cycling',
  };

  describe('isUnsyncedRecentStatus', () => {
    it('identifies unsynced statuses', () => {
      expect(isUnsyncedRecentStatus('needs_sync')).toBe(true);
      expect(isUnsyncedRecentStatus('failed')).toBe(true);
      expect(isUnsyncedRecentStatus('pending')).toBe(true);
      expect(isUnsyncedRecentStatus('synced')).toBe(false);
      expect(isUnsyncedRecentStatus('syncing')).toBe(false);
    });
  });

  describe('resolveRecentWorkoutStatus', () => {
    it('returns syncing if ledger is syncing', () => {
      const ledger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        lastAttemptAt: FRESH_ATTEMPT_AT,
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, ledger, [], NOW)).toBe('syncing');
    });

    it('honours a fresh syncing attempt even when the workout is already on the server', () => {
      const ledger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        lastAttemptAt: FRESH_ATTEMPT_AT,
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, ledger, [sampleRemote], NOW)).toBe(
        'syncing',
      );
    });

    it('resolves a stale syncing attempt to synced when the workout is on the server', () => {
      const ledger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        lastAttemptAt: STALE_ATTEMPT_AT,
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, ledger, [sampleRemote], NOW)).toBe('synced');
    });

    it('resolves a stale syncing attempt to needs_sync when there is no remote match', () => {
      const ledger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        lastAttemptAt: STALE_ATTEMPT_AT,
        attemptCount: 1,
      };
      const status = resolveRecentWorkoutStatus(sampleSession, ledger, [], NOW);
      expect(status).toBe('needs_sync');
      // The row must become retryable, without widening the unsynced set itself.
      expect(isUnsyncedRecentStatus(status)).toBe(true);
    });

    it('treats a syncing item with no lastAttemptAt as stale', () => {
      const ledger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, ledger, [], NOW)).toBe('needs_sync');
      expect(resolveRecentWorkoutStatus(sampleSession, ledger, [sampleRemote], NOW)).toBe('synced');
    });

    it('treats an unparseable or future-dated lastAttemptAt as stale', () => {
      const base: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        attemptCount: 1,
      };
      expect(
        resolveRecentWorkoutStatus(
          sampleSession,
          { ...base, lastAttemptAt: 'not-a-date' },
          [],
          NOW,
        ),
      ).toBe('needs_sync');
      // A backwards device-clock jump must not pin the row on Syncing forever.
      const future = new Date(NOW + 24 * 60 * 60 * 1000).toISOString();
      expect(
        resolveRecentWorkoutStatus(sampleSession, { ...base, lastAttemptAt: future }, [], NOW),
      ).toBe('needs_sync');
    });

    it('defaults now to the current clock so existing callers need no change', () => {
      const ledger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        lastAttemptAt: new Date(Date.now() - 60 * 1000).toISOString(),
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, ledger, [])).toBe('syncing');

      const stale: SyncLedgerItem = {
        ...ledger,
        lastAttemptAt: new Date(Date.now() - SYNCING_STALE_AFTER_MS - 1000).toISOString(),
      };
      expect(resolveRecentWorkoutStatus(sampleSession, stale, [])).toBe('needs_sync');
    });

    it('leaves non-syncing statuses untouched by the staleness check', () => {
      const stalePending: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'pending',
        lastAttemptAt: STALE_ATTEMPT_AT,
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, stalePending, [], NOW)).toBe('pending');

      const staleFailed: SyncLedgerItem = { ...stalePending, status: 'failed' };
      expect(resolveRecentWorkoutStatus(sampleSession, staleFailed, [], NOW)).toBe('failed');

      const staleSynced: SyncLedgerItem = { ...stalePending, status: 'synced' };
      expect(resolveRecentWorkoutStatus(sampleSession, staleSynced, [], NOW)).toBe('synced');
    });

    it('returns synced if ledger status is synced or remote workout is matched', () => {
      const ledger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'synced',
        remoteWorkoutId: 'remote-789',
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, ledger, [])).toBe('synced');
      expect(resolveRecentWorkoutStatus(sampleSession, undefined, [sampleRemote])).toBe('synced');
    });

    it('returns failed or pending or needs_sync based on ledger item', () => {
      const failedLedger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'failed',
        lastError: 'Network timeout',
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, failedLedger, [])).toBe('failed');

      const pendingLedger: SyncLedgerItem = {
        id: 'w:healthkit:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'pending',
        attemptCount: 1,
      };
      expect(resolveRecentWorkoutStatus(sampleSession, pendingLedger, [])).toBe('pending');
    });

    it('defaults to needs_sync when no remote match or ledger state', () => {
      expect(resolveRecentWorkoutStatus(sampleSession, undefined, [])).toBe('needs_sync');
    });
  });

  describe('buildRecentWorkoutRows', () => {
    it('builds sorted workout rows with accurate ledger and remote match details', () => {
      const sessionOlder: PlatformWorkoutSession = {
        platformSessionId: 'sess-100',
        platform: 'healthkit',
        sportType: 'running',
        startedAt: '2026-07-25T08:00:00Z',
        durationSec: 1800,
      };

      const rows = buildRecentWorkoutRows(
        [sessionOlder, sampleSession],
        [sampleRemote],
        [
          {
            // Must be what `workoutLedgerId` produces, or the row never finds it.
            id: 'workout:sess-123',
            kind: 'workout',
            platform: 'healthkit',
            title: 'Cycling',
            status: 'synced',
            remoteWorkoutId: 'remote-789',
            attemptCount: 1,
          },
        ],
      );

      expect(rows).toHaveLength(2);
      // Newest session first
      expect(rows[0]?.platformSessionId).toBe('sess-123');
      expect(rows[0]?.status).toBe('synced');
      expect(rows[0]?.remoteWorkoutId).toBe('remote-789');

      expect(rows[1]?.platformSessionId).toBe('sess-100');
      expect(rows[1]?.status).toBe('needs_sync');
    });

    it('overlays a ledger match onto the right row when nothing matches remotely', () => {
      const sessionOlder: PlatformWorkoutSession = {
        platformSessionId: 'sess-100',
        platform: 'healthkit',
        sportType: 'running',
        startedAt: '2026-07-25T08:00:00Z',
        durationSec: 1800,
      };

      // The ledger entry belongs to the *older* session, and there are no remotes
      // at all: the only way the second row can read `synced` is the ledger id
      // lookup landing on the right session rather than on row order.
      const rows = buildRecentWorkoutRows(
        [sessionOlder, sampleSession],
        [],
        [
          {
            id: 'workout:sess-100',
            kind: 'workout',
            platform: 'healthkit',
            title: 'Running',
            status: 'synced',
            remoteWorkoutId: 'remote-100',
            startedAt: '2026-07-25T08:00:00Z',
            attemptCount: 1,
          },
        ],
      );

      expect(rows.map((r) => r.platformSessionId)).toEqual(['sess-123', 'sess-100']);
      expect(rows[0]?.status).toBe('needs_sync');
      expect(rows[0]?.remoteWorkoutId).toBeUndefined();
      expect(rows[1]?.status).toBe('synced');
      expect(rows[1]?.remoteWorkoutId).toBe('remote-100');
    });

    it('threads now through so a stale syncing row is rescued, and a fresh one is not', () => {
      const staleLedger: SyncLedgerItem = {
        id: 'workout:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        lastAttemptAt: STALE_ATTEMPT_AT,
        attemptCount: 1,
      };

      const [stale] = buildRecentWorkoutRows([sampleSession], [], [staleLedger], NOW);
      expect(stale?.status).toBe('needs_sync');
      // Nothing was uploaded, so no remote id is invented and no error is shown.
      expect(stale?.remoteWorkoutId).toBeUndefined();
      expect(stale?.lastError).toBeUndefined();

      const [fresh] = buildRecentWorkoutRows(
        [sampleSession],
        [],
        [{ ...staleLedger, lastAttemptAt: FRESH_ATTEMPT_AT }],
        NOW,
      );
      expect(fresh?.status).toBe('syncing');
    });

    it('resolves a stale syncing row to synced when the remote match exists', () => {
      const staleLedger: SyncLedgerItem = {
        id: 'workout:sess-123',
        kind: 'workout',
        platform: 'healthkit',
        title: 'Cycling',
        status: 'syncing',
        lastAttemptAt: STALE_ATTEMPT_AT,
        attemptCount: 1,
      };

      const [row] = buildRecentWorkoutRows([sampleSession], [sampleRemote], [staleLedger], NOW);
      expect(row?.status).toBe('synced');
      expect(row?.remoteWorkoutId).toBe('remote-789');
    });
  });
});
