import { describe, expect, it } from 'vitest';

import {
  buildRecentWorkoutRows,
  isUnsyncedRecentStatus,
  resolveRecentWorkoutStatus,
} from '../recentWorkoutRows';
import type { PlatformWorkoutSession, SyncLedgerItem } from '../types';

function session(
  partial: Partial<PlatformWorkoutSession> & Pick<PlatformWorkoutSession, 'platformSessionId'>,
): PlatformWorkoutSession {
  return {
    platform: 'healthkit',
    startedAt: '2026-07-20T08:00:00.000Z',
    durationSec: 3600,
    sportType: 'running',
    title: 'Morning run',
    ...partial,
  };
}

function ledger(
  partial: Partial<SyncLedgerItem> & Pick<SyncLedgerItem, 'id' | 'status'>,
): SyncLedgerItem {
  return {
    kind: 'workout',
    platform: 'healthkit',
    title: 'Workout',
    attemptCount: 0,
    ...partial,
  };
}

describe('resolveRecentWorkoutStatus', () => {
  it('marks on-device-only workouts as needs_sync', () => {
    expect(resolveRecentWorkoutStatus(session({ platformSessionId: 'a' }), undefined, [])).toBe(
      'needs_sync',
    );
  });

  it('marks remote match as synced even without ledger', () => {
    const status = resolveRecentWorkoutStatus(session({ platformSessionId: 'a' }), undefined, [
      {
        id: 'remote-1',
        date: '2026-07-20T08:02:00.000Z',
        type: 'run',
        durationSec: 3500,
      },
    ]);
    expect(status).toBe('synced');
  });

  it('prefers ledger synced', () => {
    const status = resolveRecentWorkoutStatus(
      session({ platformSessionId: 'a' }),
      ledger({
        id: 'workout:a',
        status: 'synced',
        remoteWorkoutId: 'cw-1',
      }),
      [],
    );
    expect(status).toBe('synced');
  });

  it('surfaces failed ledger when unmatched', () => {
    const status = resolveRecentWorkoutStatus(
      session({ platformSessionId: 'a' }),
      ledger({ id: 'workout:a', status: 'failed', lastError: 'Upload failed' }),
      [],
    );
    expect(status).toBe('failed');
  });

  it('keeps syncing while an attempt is in flight', () => {
    const status = resolveRecentWorkoutStatus(
      session({ platformSessionId: 'a' }),
      // An attempt is only believed to be in flight while it is recent (CW-352).
      ledger({
        id: 'workout:a',
        status: 'syncing',
        lastAttemptAt: new Date(Date.now() - 60 * 1000).toISOString(),
      }),
      [],
    );
    expect(status).toBe('syncing');
  });
});

describe('buildRecentWorkoutRows', () => {
  it('sorts newest first and overlays status', () => {
    const rows = buildRecentWorkoutRows(
      [
        session({ platformSessionId: 'old', startedAt: '2026-07-18T08:00:00.000Z' }),
        session({ platformSessionId: 'new', startedAt: '2026-07-21T08:00:00.000Z' }),
      ],
      [],
      [
        ledger({
          id: 'workout:old',
          status: 'synced',
          remoteWorkoutId: 'r1',
          startedAt: '2026-07-18T08:00:00.000Z',
        }),
      ],
    );
    expect(rows.map((r) => r.platformSessionId)).toEqual(['new', 'old']);
    expect(rows[0]?.status).toBe('needs_sync');
    expect(rows[1]?.status).toBe('synced');
  });
});

describe('isUnsyncedRecentStatus', () => {
  it('flags needs_sync / failed / pending only', () => {
    expect(isUnsyncedRecentStatus('needs_sync')).toBe(true);
    expect(isUnsyncedRecentStatus('failed')).toBe(true);
    expect(isUnsyncedRecentStatus('pending')).toBe(true);
    expect(isUnsyncedRecentStatus('synced')).toBe(false);
    expect(isUnsyncedRecentStatus('syncing')).toBe(false);
  });
});
