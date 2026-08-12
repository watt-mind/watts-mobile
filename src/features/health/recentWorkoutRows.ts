import { workoutLedgerId } from './ledgerHelpers';
import { matchRemoteWorkout, workoutHistoryTitle } from './matchRemoteWorkout';
import type {
  PlatformWorkoutSession,
  RemoteWorkoutMatchCandidate,
  SyncLedgerItem,
  SyncLedgerStatus,
} from './types';

export type RecentWorkoutRow = {
  platformSessionId: string;
  platform: PlatformWorkoutSession['platform'];
  title: string;
  startedAt: string;
  durationSec?: number;
  status: SyncLedgerStatus;
  remoteWorkoutId?: string;
  lastError?: string;
  ledgerId: string;
};

const UNSYNCED: ReadonlySet<SyncLedgerStatus> = new Set(['needs_sync', 'failed', 'pending']);

export function isUnsyncedRecentStatus(status: SyncLedgerStatus): boolean {
  return UNSYNCED.has(status);
}

/**
 * How long a persisted `syncing` attempt stays believable (CW-352).
 *
 * `beginLedgerAttempt` writes `status: 'syncing'` + `lastAttemptAt` and persists
 * it *before* the upload starts; the matching success/failure write only happens
 * after the upload settles. If the process dies in that window — OS kill, crash,
 * background-task budget exhaustion, force-quit — the row survives at `syncing`
 * with no writer left alive to resolve it. The per-ledger-id lock added in
 * CW-343 does not help here: it is an in-memory single-flight that dies with the
 * process, so nothing on the next launch knows the attempt is over.
 *
 * 15 minutes matches the Health Connect poll interval — comfortably longer than
 * any real upload, short enough that the athlete sees a stuck row recover within
 * one poll rather than never.
 */
export const SYNCING_STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Is this item's in-flight attempt still plausibly running?
 *
 * Requires a parseable `lastAttemptAt` inside the staleness window. A missing or
 * unparseable timestamp is treated as stale — we cannot date the attempt, so we
 * cannot claim it is live. So is a future-dated one: a backwards device-clock
 * jump would otherwise leave `now - lastAttemptAt` permanently negative and pin
 * the row on "Syncing" forever, which is the exact bug this guards against.
 */
function isSyncingAttemptLive(ledgerItem: SyncLedgerItem | undefined, now: number): boolean {
  if (ledgerItem?.status !== 'syncing') return false;
  if (!ledgerItem.lastAttemptAt) return false;

  const startedAt = Date.parse(ledgerItem.lastAttemptAt);
  if (!Number.isFinite(startedAt)) return false;

  const elapsed = now - startedAt;
  return elapsed >= 0 && elapsed < SYNCING_STALE_AFTER_MS;
}

/**
 * Resolve display status for an on-device workout from ledger + remote match.
 * Remote match or ledger `synced` → synced; otherwise prefer ledger attention
 * statuses; bare on-device rows are `needs_sync`.
 *
 * A `syncing` item short-circuits ahead of the remote match only while its
 * attempt is still plausibly live. Once stale it falls through the normal order,
 * so an abandoned attempt resolves to `synced` if the workout actually reached
 * the server, and otherwise to `needs_sync` — which `isUnsyncedRecentStatus`
 * already covers, making the row retryable again by hand and by
 * `syncUnsyncedWorkouts`. The unsynced set itself is deliberately unchanged.
 */
export function resolveRecentWorkoutStatus(
  session: PlatformWorkoutSession,
  ledgerItem: SyncLedgerItem | undefined,
  remotes: RemoteWorkoutMatchCandidate[],
  now: number = Date.now(),
): SyncLedgerStatus {
  if (isSyncingAttemptLive(ledgerItem, now)) return 'syncing';

  if (ledgerItem?.status === 'synced') return 'synced';

  const matched = matchRemoteWorkout(session, remotes);
  if (matched || ledgerItem?.remoteWorkoutId) return 'synced';

  if (ledgerItem?.status === 'failed') return 'failed';
  if (ledgerItem?.status === 'pending') return 'pending';
  if (ledgerItem?.status === 'needs_sync') return 'needs_sync';

  return 'needs_sync';
}

export function buildRecentWorkoutRows(
  sessions: PlatformWorkoutSession[],
  remotes: RemoteWorkoutMatchCandidate[],
  ledgerItems: SyncLedgerItem[],
  now: number = Date.now(),
): RecentWorkoutRow[] {
  const ledgerById = new Map(ledgerItems.map((item) => [item.id, item]));

  const rows = sessions.map((session) => {
    const ledgerId = workoutLedgerId(session.platformSessionId);
    const ledgerItem = ledgerById.get(ledgerId);
    const matched = matchRemoteWorkout(session, remotes);
    const status = resolveRecentWorkoutStatus(session, ledgerItem, remotes, now);

    return {
      platformSessionId: session.platformSessionId,
      platform: session.platform,
      title: workoutHistoryTitle(session),
      startedAt: session.startedAt,
      durationSec: session.durationSec,
      status,
      remoteWorkoutId: ledgerItem?.remoteWorkoutId ?? matched?.id,
      lastError: status === 'failed' ? ledgerItem?.lastError : undefined,
      ledgerId,
    };
  });

  return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
