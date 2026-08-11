import { describe, expect, it } from 'vitest';

import {
  applyLedgerRetention,
  beginLedgerAttempt,
  completeLedgerFailure,
  completeLedgerPending,
  completeLedgerSuccess,
  filterLedgerByAttention,
  seedNeedsSync,
  upsertLedgerItem,
  wellnessLedgerId,
} from '../ledgerHelpers';
import type { SyncLedgerItem } from '../types';

function item(
  partial: Partial<SyncLedgerItem> & Pick<SyncLedgerItem, 'id' | 'kind'>,
): SyncLedgerItem {
  return {
    platform: 'health_connect',
    title: partial.id,
    status: 'needs_sync',
    attemptCount: 0,
    ...partial,
  };
}

describe('ledgerHelpers', () => {
  it('builds wellness ids', () => {
    expect(wellnessLedgerId('2026-07-20')).toBe('wellness:2026-07-20');
  });

  it('upserts and retains newest', () => {
    let items: SyncLedgerItem[] = [];
    items = upsertLedgerItem(
      items,
      item({ id: 'wellness:a', kind: 'wellness', lastAttemptAt: '2026-07-01T00:00:00Z' }),
    );
    items = upsertLedgerItem(
      items,
      item({
        id: 'wellness:a',
        kind: 'wellness',
        status: 'synced',
        lastAttemptAt: '2026-07-02T00:00:00Z',
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe('synced');
  });

  it('filters attention statuses', () => {
    const items = [
      item({ id: '1', kind: 'wellness', status: 'failed' }),
      item({ id: '2', kind: 'workout', status: 'needs_sync' }),
      item({ id: '3', kind: 'wellness', status: 'synced' }),
    ];
    expect(filterLedgerByAttention(items, 'failed').map((i) => i.id)).toEqual(['1']);
    expect(filterLedgerByAttention(items, 'needs_sync').map((i) => i.id)).toEqual(['2']);
  });

  it('tracks attempt lifecycle', () => {
    let row = seedNeedsSync('wellness', {
      id: 'wellness:d',
      kind: 'wellness',
      platform: 'healthkit',
      title: 'Wellness',
      localDate: '2026-07-20',
    });
    row = beginLedgerAttempt(row, '2026-07-20T10:00:00Z');
    expect(row.status).toBe('syncing');
    expect(row.attemptCount).toBe(1);
    row = completeLedgerSuccess(row, { at: '2026-07-20T10:01:00Z' });
    expect(row.status).toBe('synced');
    row = beginLedgerAttempt(row, '2026-07-20T10:01:30Z');
    row = completeLedgerFailure(row, 'network down');
    expect(row.status).toBe('failed');
    expect(row.lastError).toContain('network');
    row = completeLedgerPending(row, '2026-07-20T10:02:00Z');
    expect(row.status).toBe('pending');
    expect(row.lastAttemptAt).toBe('2026-07-20T10:02:00Z');
    expect(row.lastError).toBeUndefined();
  });

  // CW-461: a synced item must never be downgraded by an unrelated failure.
  it('never downgrades an already-synced item to failed', () => {
    const synced = completeLedgerSuccess(item({ id: 'wellness:2026-07-20', kind: 'wellness' }), {
      at: '2026-07-20T10:00:00Z',
    });
    const after = completeLedgerFailure(synced, 'Health Connect changes drain error');
    expect(after.status).toBe('synced');
    expect(after.lastError).toBeUndefined();
    expect(after).toBe(synced);
  });

  it('applies retention caps', () => {
    const many = Array.from({ length: 95 }, (_, i) =>
      item({
        id: `wellness:${i}`,
        kind: 'wellness',
        lastAttemptAt: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      }),
    );
    expect(
      applyLedgerRetention(many).filter((i) => i.kind === 'wellness').length,
    ).toBeLessThanOrEqual(90);
  });
});
