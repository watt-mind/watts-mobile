import type { SyncLedgerItem, SyncLedgerKind, SyncLedgerStatus } from './types';
import { WELLNESS_LEDGER_MAX, WORKOUT_LEDGER_MAX } from './types';

export function wellnessLedgerId(date: string): string {
  return `wellness:${date}`;
}

export function workoutLedgerId(platformSessionId: string): string {
  return `workout:${platformSessionId}`;
}

export function sortLedgerNewestFirst(items: SyncLedgerItem[]): SyncLedgerItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.lastAttemptAt ?? a.lastSuccessAt ?? a.startedAt ?? a.localDate ?? '';
    const bTime = b.lastAttemptAt ?? b.lastSuccessAt ?? b.startedAt ?? b.localDate ?? '';
    return bTime.localeCompare(aTime);
  });
}

export function filterLedgerByAttention(
  items: SyncLedgerItem[],
  filter: 'all' | 'failed' | 'needs_sync',
): SyncLedgerItem[] {
  if (filter === 'failed') return items.filter((i) => i.status === 'failed');
  if (filter === 'needs_sync') return items.filter((i) => i.status === 'needs_sync');
  return items;
}

/** Cap retention: newest wellness dates and newest workouts kept. */
export function applyLedgerRetention(items: SyncLedgerItem[]): SyncLedgerItem[] {
  const wellness = sortLedgerNewestFirst(items.filter((i) => i.kind === 'wellness')).slice(
    0,
    WELLNESS_LEDGER_MAX,
  );
  const workouts = sortLedgerNewestFirst(items.filter((i) => i.kind === 'workout')).slice(
    0,
    WORKOUT_LEDGER_MAX,
  );
  return sortLedgerNewestFirst([...wellness, ...workouts]);
}

export function upsertLedgerItem(items: SyncLedgerItem[], patch: SyncLedgerItem): SyncLedgerItem[] {
  const idx = items.findIndex((i) => i.id === patch.id);
  if (idx === -1) return applyLedgerRetention([patch, ...items]);
  const next = [...items];
  next[idx] = patch;
  return applyLedgerRetention(next);
}

export function beginLedgerAttempt(
  item: SyncLedgerItem,
  at: string = new Date().toISOString(),
): SyncLedgerItem {
  return {
    ...item,
    status: 'syncing',
    lastAttemptAt: at,
    attemptCount: item.attemptCount + 1,
    lastError: undefined,
  };
}

export function completeLedgerSuccess(
  item: SyncLedgerItem,
  opts: { remoteWorkoutId?: string; contentFingerprint?: string; at?: string } = {},
): SyncLedgerItem {
  const at = opts.at ?? new Date().toISOString();
  return {
    ...item,
    status: 'synced',
    lastSuccessAt: at,
    lastAttemptAt: at,
    lastError: undefined,
    remoteWorkoutId: opts.remoteWorkoutId ?? item.remoteWorkoutId,
    contentFingerprint: opts.contentFingerprint ?? item.contentFingerprint,
  };
}

/**
 * Mark an item failed. An item that is already `synced` is never downgraded —
 * its data is on the server, and flipping it to `failed` (e.g. from an
 * unrelated pass-level error) would show a bogus "Failed" row with a Retry
 * button for work that actually succeeded (CW-461). A genuine re-upload
 * attempt always goes through beginLedgerAttempt first, so it is `syncing`
 * by the time it can fail here.
 */
export function completeLedgerFailure(
  item: SyncLedgerItem,
  error: string,
  at: string = new Date().toISOString(),
): SyncLedgerItem {
  if (item.status === 'synced') return item;
  return {
    ...item,
    status: 'failed',
    lastAttemptAt: at,
    lastError: error.slice(0, 160),
  };
}

export function completeLedgerPending(
  item: SyncLedgerItem,
  at: string = new Date().toISOString(),
): SyncLedgerItem {
  return {
    ...item,
    status: 'pending',
    lastAttemptAt: at,
    lastError: undefined,
  };
}

export function seedNeedsSync(
  kind: SyncLedgerKind,
  base: Omit<SyncLedgerItem, 'status' | 'attemptCount'>,
): SyncLedgerItem {
  return {
    ...base,
    kind,
    status: 'needs_sync',
    attemptCount: 0,
  };
}

export function isAttentionStatus(status: SyncLedgerStatus): boolean {
  return status === 'failed' || status === 'needs_sync';
}

export function formatLedgerStatusLabel(status: SyncLedgerStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'syncing':
      return 'Syncing';
    case 'synced':
      return 'Synced';
    case 'failed':
      return 'Failed';
    case 'needs_sync':
      return 'Needs sync';
    default:
      return status;
  }
}
