import { onlineManager } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { loadTokens } from '@/src/auth/tokenStorage';
import { createKeyedSingleFlight } from '@/src/lib/keyedSingleFlight';

import { fetchRemoteWorkoutsForMatch } from './fetchRemoteWorkouts';
import {
  beginLedgerAttempt,
  completeLedgerPending,
  completeLedgerFailure,
  completeLedgerSuccess,
  isWorkoutLedgerConverged,
  seedNeedsSync,
  wellnessLedgerId,
  workoutLedgerId,
} from './ledgerHelpers';
import { getLedgerItem, saveLedgerItem } from './ledger';
import {
  localDateYmd,
  mapSampleToWellnessPayload,
  sampleHasMetrics,
  wellnessContentFingerprint,
  wellnessHistoryTitle,
} from './mapToWellnessPayload';
import { matchRemoteWorkout, workoutHistoryTitle } from './matchRemoteWorkout';
import { readPlatformWellness, readPlatformWorkouts } from './readers';
import { isUnsyncedRecentStatus } from './recentWorkoutRows';
import { findPlatformWorkoutSession, listRecentPlatformWorkoutsWithStatus } from './recentWorkouts';
import { loadHealthSyncPreferences, markHealthSyncSuccess } from './syncPreferences';
import type {
  DailyWellnessSample,
  HealthPlatform,
  PlatformWorkoutSession,
  SyncLedgerItem,
} from './types';
import { LOOKBACK_DAYS } from './types';
import { uploadWellnessPayload } from './uploadWellness';
import { uploadPlatformWorkout } from './uploadWorkout';
import { clearWatermarks, resolveReadWindow, setWatermark } from './watermarks';

let inFlight: Promise<SyncPassResult> | null = null;

/**
 * Manual sync entry points (retryLedgerItem, syncWorkoutByPlatformSessionId,
 * syncUnsyncedWorkouts) run outside the single-flight `inFlight` pass and can be
 * triggered concurrently with each other and with a background pass. Each one's
 * promise is tracked here so clearHealthSyncOnSignOut can await all of them —
 * not just `inFlight` — before clearing local state.
 */
const manualSyncInFlight = new Set<Promise<unknown>>();

function trackManualSync<T>(op: Promise<T>): Promise<T> {
  const tracked = op.finally(() => {
    manualSyncInFlight.delete(tracked);
  });
  manualSyncInFlight.add(tracked);
  return tracked;
}

/**
 * Per-ledger-item lock (CW-343).
 *
 * `inFlight` above only single-flights a whole pass, and the manual entry points
 * deliberately run outside it. Syncing one item is a read-modify-write over its
 * ledger row — getLedgerItem → decide → beginLedgerAttempt → saveLedgerItem →
 * upload — so two overlapping callers targeting the same id both read the same
 * stale snapshot, both clear the converged/pending/backoff guards, and both
 * upload. Live trigger: tapping Retry exactly as the foreground poll or the
 * hourly background task picks up the same session.
 *
 * The gate has to be keyed on the ledger id, not global: keying it globally
 * would queue an unrelated retry behind a full pass. Every read-modify-write on
 * a single item now runs inside this lock, so a second caller for the same id
 * joins the running attempt (and gets its result) instead of issuing its own
 * upload, while different ids keep running in parallel.
 */
const ledgerItemLock = createKeyedSingleFlight();

/**
 * Monotonic generation bumped when sign-out begins (see clearHealthSyncOnSignOut).
 * A running `runHealthSyncPass` captures this value at start; if it goes stale
 * mid-pass, the pass refuses to persist any further ledger/watermark write —
 * closing the window where a sync started before sign-out could still write
 * (or upload with a token that's about to be invalidated) after the clear runs.
 */
let healthSyncGeneration = 0;

export function bumpHealthSyncGeneration(): number {
  healthSyncGeneration += 1;
  return healthSyncGeneration;
}

export function getHealthSyncGeneration(): number {
  return healthSyncGeneration;
}

function isHealthSyncGenerationCurrent(generation: number): boolean {
  return generation === healthSyncGeneration;
}

/**
 * Await any pass already in flight so its writes are guaranteed to either finish
 * or bail out (via the generation check) before the caller proceeds. Used by
 * clearHealthSyncOnSignOut so the ledger clear cannot race a stale pass.
 */
export async function awaitInFlightHealthSyncPass(): Promise<void> {
  const pending: Promise<unknown>[] = [...manualSyncInFlight];
  if (inFlight) pending.push(inFlight);
  if (pending.length === 0) return;
  await Promise.all(
    pending.map((p) =>
      p.catch(() => {
        // Any failure is the operation's own concern — nothing to surface here.
      }),
    ),
  );
}

export type SyncPassResult = {
  wellnessAttempted: number;
  wellnessSynced: number;
  wellnessFailed: number;
  workoutsAttempted: number;
  workoutsSynced: number;
  workoutsFailed: number;
  workoutsPending: number;
  /** Workouts given up on after repeated unresolved queued rounds (CW-463). */
  workoutsAbandoned: number;
  wellnessPassError: boolean;
  workoutPassError: boolean;
  /** False when the platform store returned no usable data at all (e.g. iOS silently denied reads). */
  foundLocalData: boolean;
  skipped: boolean;
  reason?: string;
  /** True when a sign-out happened mid-pass and the pass stopped writing early. */
  signedOutMidPass: boolean;
};

/** Stop auto-retrying an item after this many failed attempts (manual retry still works). */
const MAX_AUTO_SYNC_ATTEMPTS = 5;
const QUEUED_RETRY_AFTER_MS = 30 * 60 * 1000;
/** Give up on a workout the server keeps queueing without an id after this many rounds. */
const MAX_PENDING_UPLOAD_ROUNDS = 3;

function emptyResult(partial: Partial<SyncPassResult> & { skipped: boolean }): SyncPassResult {
  return {
    wellnessAttempted: 0,
    wellnessSynced: 0,
    wellnessFailed: 0,
    workoutsAttempted: 0,
    workoutsSynced: 0,
    workoutsFailed: 0,
    workoutsPending: 0,
    workoutsAbandoned: 0,
    wellnessPassError: false,
    workoutPassError: false,
    foundLocalData: false,
    signedOutMidPass: false,
    ...partial,
  };
}

async function ensureAuthenticated(): Promise<boolean> {
  const tokens = await loadTokens();
  return !!tokens?.accessToken;
}

/** Days at least this recent are always re-uploaded — their metrics still change. */
const WELLNESS_RESYNC_WINDOW_DAYS = 2;

function wellnessResyncCutoffYmd(): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (WELLNESS_RESYNC_WINDOW_DAYS - 1));
  return localDateYmd(cutoff);
}

function currentPlatform(): HealthPlatform | null {
  if (Platform.OS === 'ios') return 'healthkit';
  if (Platform.OS === 'android') return 'health_connect';
  return null;
}

type WellnessSyncStatus = 'synced' | 'failed' | 'skipped' | 'cancelled';

/**
 * Sync one wellness day. Serialised per ledger id — an overlapping caller for
 * the same day joins this attempt rather than starting a second upload.
 */
async function syncWellnessSample(
  sample: DailyWellnessSample,
  force = false,
  generation?: number,
): Promise<WellnessSyncStatus> {
  if (!sampleHasMetrics(sample)) return 'skipped';
  if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';

  const id = wellnessLedgerId(sample.date);
  return ledgerItemLock(id, () => syncWellnessSampleLocked(id, sample, force, generation));
}

async function syncWellnessSampleLocked(
  id: string,
  sample: DailyWellnessSample,
  force: boolean,
  generation: number | undefined,
): Promise<WellnessSyncStatus> {
  const existing = await getLedgerItem(id);
  const fingerprint = wellnessContentFingerprint(sample);

  // Older days rarely change once synced — skip unless forced or content changed.
  // Current + previous day always re-push (metrics still settle).
  if (!force && existing?.status === 'synced' && sample.date < wellnessResyncCutoffYmd()) {
    if (!existing.contentFingerprint || existing.contentFingerprint === fingerprint) {
      return 'skipped';
    }
  }

  // Back off items that keep failing; a manual retry (force) resumes them.
  if (!force && existing?.status === 'failed' && existing.attemptCount >= MAX_AUTO_SYNC_ATTEMPTS) {
    // Keep the pass unresolved so its watermark cannot move beyond an item
    // that still needs a manual retry.
    return 'failed';
  }
  let item: SyncLedgerItem =
    existing ??
    seedNeedsSync('wellness', {
      id,
      kind: 'wellness',
      platform: sample.platform,
      title: wellnessHistoryTitle(sample.date),
      localDate: sample.date,
    });

  item = beginLedgerAttempt(item);
  if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';
  await saveLedgerItem(item);

  try {
    await uploadWellnessPayload(mapSampleToWellnessPayload(sample));
    if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';
    item = completeLedgerSuccess(item, { contentFingerprint: fingerprint });
    await saveLedgerItem(item);
    await markHealthSyncSuccess(item.lastSuccessAt);
    return 'synced';
  } catch (err) {
    if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';
    const message = err instanceof Error ? err.message : 'Upload failed';
    item = completeLedgerFailure(item, message);
    await saveLedgerItem(item);
    return 'failed';
  }
}

type WorkoutSyncStatus = 'synced' | 'pending' | 'abandoned' | 'failed' | 'skipped' | 'cancelled';

/**
 * Sync one platform workout. Serialised per ledger id — an overlapping caller
 * for the same session joins this attempt rather than issuing a second upload
 * (CW-343); different sessions are unaffected and still run in parallel.
 */
async function syncWorkoutSession(
  session: PlatformWorkoutSession,
  remotes: Awaited<ReturnType<typeof fetchRemoteWorkoutsForMatch>>,
  force = false,
  generation?: number,
): Promise<WorkoutSyncStatus> {
  if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';

  const id = workoutLedgerId(session.platformSessionId);
  return ledgerItemLock(id, () =>
    syncWorkoutSessionLocked(id, session, remotes, force, generation),
  );
}

async function syncWorkoutSessionLocked(
  id: string,
  session: PlatformWorkoutSession,
  remotes: Awaited<ReturnType<typeof fetchRemoteWorkoutsForMatch>>,
  force: boolean,
  generation: number | undefined,
): Promise<WorkoutSyncStatus> {
  const existing = await getLedgerItem(id);

  // Already uploaded/matched — converge without re-upload unless forced.
  if (!force && isWorkoutLedgerConverged(existing)) {
    return 'skipped';
  }

  if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';

  const matched = matchRemoteWorkout(session, remotes);
  if (matched) {
    const item = completeLedgerSuccess(
      existing ??
        seedNeedsSync('workout', {
          id,
          kind: 'workout',
          platform: session.platform,
          title: workoutHistoryTitle(session),
          startedAt: session.startedAt,
        }),
      { remoteWorkoutId: matched.id },
    );
    await saveLedgerItem(item);
    await markHealthSyncSuccess(item.lastSuccessAt);
    return 'synced';
  }

  if (!force && existing?.status === 'pending') {
    // A queued item that never resolves must not pin the watermark forever:
    // give up after a bounded number of rounds, record why, and let the pass
    // move on (manual Retry still forces another attempt) — see CW-463.
    if (existing.attemptCount >= MAX_PENDING_UPLOAD_ROUNDS) {
      const abandoned = completeLedgerFailure(
        existing,
        `Server accepted the workout but never returned an id (${existing.attemptCount} attempts). Tap Retry to try again.`,
      );
      if (generation !== undefined && !isHealthSyncGenerationCurrent(generation))
        return 'cancelled';
      await saveLedgerItem(abandoned);
      return 'abandoned';
    }
    if (existing.lastAttemptAt) {
      const queuedAt = new Date(existing.lastAttemptAt).getTime();
      if (Number.isFinite(queuedAt) && Date.now() - queuedAt < QUEUED_RETRY_AFTER_MS) {
        return 'pending';
      }
    }
  }

  if (!force && existing?.status === 'failed' && existing.attemptCount >= MAX_AUTO_SYNC_ATTEMPTS) {
    // Preserve the failure and block watermark advancement without issuing
    // an unbounded number of automatic upload attempts.
    return 'failed';
  }

  let item: SyncLedgerItem =
    existing ??
    seedNeedsSync('workout', {
      id,
      kind: 'workout',
      platform: session.platform,
      title: workoutHistoryTitle(session),
      startedAt: session.startedAt,
    });

  if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';

  if (!existing) {
    await saveLedgerItem(item);
  }

  item = beginLedgerAttempt(item);
  if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';
  await saveLedgerItem(item);

  try {
    const result = await uploadPlatformWorkout(session);
    if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';
    if (result.queued && !result.remoteWorkoutId) {
      if (result.duplicate) {
        // The server already holds this workout — it just did not hand back an
        // id (e.g. the duplicate belongs to another source). Treat it as
        // converged instead of re-uploading it every 30 min forever (CW-463).
        item = completeLedgerSuccess(item, { serverDuplicateNoId: true });
        await saveLedgerItem(item);
        await markHealthSyncSuccess(item.lastSuccessAt);
        return 'synced';
      }
      item = completeLedgerPending(item);
      await saveLedgerItem(item);
      return 'pending';
    }
    item = completeLedgerSuccess(item, { remoteWorkoutId: result.remoteWorkoutId });
    await saveLedgerItem(item);
    await markHealthSyncSuccess(item.lastSuccessAt);
    return 'synced';
  } catch (err) {
    if (generation !== undefined && !isHealthSyncGenerationCurrent(generation)) return 'cancelled';
    const message = err instanceof Error ? err.message : 'Upload failed';
    item = completeLedgerFailure(item, message);
    await saveLedgerItem(item);
    return 'failed';
  }
}

/**
 * Full sync pass. Single-flight — concurrent callers await the same promise.
 * Incremental watermark reads by default; `fullResync` clears watermarks and
 * backfills the lookback window. Recent wellness days are always re-read.
 */
export async function runHealthSyncPass(
  options: { force?: boolean; fullResync?: boolean } = {},
): Promise<SyncPassResult> {
  if (inFlight) return inFlight;

  // Capture the generation this pass runs under. If sign-out bumps it mid-pass,
  // every write below is gated on it staying current — see isHealthSyncGenerationCurrent.
  const generation = healthSyncGeneration;

  inFlight = (async () => {
    const prefs = await loadHealthSyncPreferences();
    if (!prefs.syncEnabled) {
      return emptyResult({ skipped: true, reason: 'sync_disabled' });
    }
    if (!(await ensureAuthenticated())) {
      return emptyResult({ skipped: true, reason: 'not_authenticated' });
    }
    if (!onlineManager.isOnline()) {
      return emptyResult({ skipped: true, reason: 'offline' });
    }
    if (!isHealthSyncGenerationCurrent(generation)) {
      return emptyResult({ skipped: true, reason: 'signed_out', signedOutMidPass: true });
    }

    if (options.fullResync) {
      await clearWatermarks();
    }

    const force = options.force === true || options.fullResync === true;
    const result = emptyResult({ skipped: false });
    const platform = currentPlatform();
    const passEndedAt = new Date().toISOString();

    try {
      const wellnessWindow = await resolveReadWindow('wellness', {
        fullResync: options.fullResync,
        lookbackDays: LOOKBACK_DAYS,
      });
      const samples = await readPlatformWellness(wellnessWindow);
      let wellnessFoundData = false;
      for (const sample of samples) {
        if (!sampleHasMetrics(sample)) continue;
        wellnessFoundData = true;
        result.foundLocalData = true;
        const status = await syncWellnessSample(sample, force, generation);
        if (status === 'skipped') continue;
        if (status === 'cancelled') {
          result.signedOutMidPass = true;
          return result;
        }
        result.wellnessAttempted += 1;
        if (status === 'synced') result.wellnessSynced += 1;
        else result.wellnessFailed += 1;
      }
      // Advance watermark only after a successful push so failures retry next pass,
      // and only when the read actually surfaced usable data — an empty result can
      // mean the platform store is silently denying/unavailable rather than "nothing
      // new happened", and advancing on that would permanently skip the gap once
      // permission is later granted (see foundLocalData doc above). Also gated on
      // the sign-out generation staying current, so a stale pass can't write after
      // sign-out has cleared the ledger.
      if (
        platform &&
        result.wellnessFailed === 0 &&
        wellnessFoundData &&
        isHealthSyncGenerationCurrent(generation)
      ) {
        await setWatermark('wellness', passEndedAt, platform);
      }
    } catch (err) {
      result.wellnessPassError = true;
      console.warn(
        '[HealthSync] wellness pass error',
        err instanceof Error ? err.message : 'error',
      );
    }

    if (!isHealthSyncGenerationCurrent(generation)) {
      result.signedOutMidPass = true;
      return result;
    }

    if (prefs.syncWorkouts) {
      try {
        const workoutWindow = await resolveReadWindow('workout', {
          fullResync: options.fullResync,
          lookbackDays: LOOKBACK_DAYS,
        });
        const sessions = await readPlatformWorkouts(workoutWindow);
        const workoutsFoundData = sessions.length > 0;
        if (workoutsFoundData) result.foundLocalData = true;
        const remotes = await fetchRemoteWorkoutsForMatch(LOOKBACK_DAYS);
        for (const session of sessions) {
          if (!isHealthSyncGenerationCurrent(generation)) {
            result.signedOutMidPass = true;
            return result;
          }
          const id = workoutLedgerId(session.platformSessionId);
          const existing = await getLedgerItem(id);
          if (!existing) {
            if (!isHealthSyncGenerationCurrent(generation)) {
              result.signedOutMidPass = true;
              return result;
            }
            await saveLedgerItem(
              seedNeedsSync('workout', {
                id,
                kind: 'workout',
                platform: session.platform,
                title: workoutHistoryTitle(session),
                startedAt: session.startedAt,
              }),
            );
          }
          if (!force && isWorkoutLedgerConverged(existing)) continue;
          const status = await syncWorkoutSession(session, remotes, force, generation);
          if (status === 'skipped') continue;
          if (status === 'cancelled') {
            result.signedOutMidPass = true;
            return result;
          }
          result.workoutsAttempted += 1;
          if (status === 'synced') result.workoutsSynced += 1;
          else if (status === 'pending') result.workoutsPending += 1;
          // An abandoned item is terminal and recorded on its own ledger row —
          // it deliberately does not block watermark advancement (CW-463).
          else if (status === 'abandoned') result.workoutsAbandoned += 1;
          else result.workoutsFailed += 1;
        }
        // Same rule as wellness: only advance once the read actually returned
        // sessions, not merely "nothing failed" — an empty read may just mean
        // permission was denied or the store was unavailable this pass. Also
        // gated on the sign-out generation staying current.
        if (
          platform &&
          result.workoutsFailed === 0 &&
          result.workoutsPending === 0 &&
          workoutsFoundData &&
          isHealthSyncGenerationCurrent(generation)
        ) {
          await setWatermark('workout', passEndedAt, platform);
        }
      } catch (err) {
        result.workoutPassError = true;
        console.warn(
          '[HealthSync] workout pass error',
          err instanceof Error ? err.message : 'error',
        );
      }
    }

    return result;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Hard cap on how far back a manual retry may widen the platform read. */
const MAX_RETRY_LOOKBACK_DAYS = 400;

/** Parse a ledger anchor (`YYYY-MM-DD` local date or ISO timestamp) as a local day. */
function parseLedgerAnchor(anchor: string): Date | null {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor);
  if (ymd) {
    return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  }
  const parsed = new Date(anchor);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Lookback a manual retry needs so the platform read actually reaches the item's
 * own date. The ledger keeps 90 wellness days / 100 workouts, far beyond the
 * 14-day pass lookback, so retrying an older item used to read a window that
 * could never contain it and always threw "No on-device metrics for that day"
 * (CW-462). Readers treat `lookbackDays` as the floor of their window, so
 * widening it here is enough for both HealthKit and Health Connect.
 */
export function retryLookbackDays(anchor: string | undefined, now: Date = new Date()): number {
  if (!anchor) return LOOKBACK_DAYS;
  const anchorDate = parseLedgerAnchor(anchor);
  if (!anchorDate) return LOOKBACK_DAYS;
  const startOfAnchor = new Date(anchorDate);
  startOfAnchor.setHours(0, 0, 0, 0);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const days =
    Math.floor((startOfToday.getTime() - startOfAnchor.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (!Number.isFinite(days)) return LOOKBACK_DAYS;
  // +1 day of slack so a session started near local midnight stays inside.
  return Math.min(MAX_RETRY_LOOKBACK_DAYS, Math.max(LOOKBACK_DAYS, days + 1));
}

/**
 * Fail a manual retry *visibly*: the reason is written to the item's lastError
 * so the Sync history row explains itself, and re-thrown so the caller can
 * surface it too. Without this, precondition failures were invisible — the user
 * tapped Retry, felt an error haptic, and nothing on screen ever changed.
 */
async function failLedgerItemWith(item: SyncLedgerItem, message: string): Promise<never> {
  try {
    await saveLedgerItem(completeLedgerFailure(item, message));
  } catch {
    // Persisting the reason is best-effort — the throw below still surfaces it.
  }
  throw new Error(message);
}

async function throwLedgerFailure(id: string): Promise<never> {
  const updated = await getLedgerItem(id);
  throw new Error(updated?.lastError ?? 'Sync failed');
}

async function assertWorkoutSyncAllowed(): Promise<void> {
  const prefs = await loadHealthSyncPreferences();
  if (!prefs.syncEnabled) {
    throw new Error('Enable Sync to Coach Watts first');
  }
  if (!prefs.syncWorkouts) {
    throw new Error('Enable Sync workouts first');
  }
  if (!(await ensureAuthenticated())) {
    throw new Error('Sign in to sync');
  }
  if (!onlineManager.isOnline()) {
    throw new Error('No internet connection');
  }
}

export async function retryLedgerItem(id: string): Promise<void> {
  return trackManualSync(retryLedgerItemImpl(id));
}

async function retryLedgerItemImpl(id: string): Promise<void> {
  // Capture the generation this manual retry runs under. Threaded through the
  // sync helpers below so a sign-out mid-retry cancels the write instead of
  // racing clearHealthSyncOnSignOut — see isHealthSyncGenerationCurrent.
  const generation = getHealthSyncGeneration();

  const prefs = await loadHealthSyncPreferences();
  if (!prefs.syncEnabled) {
    throw new Error('Enable Sync to Coach Watts first');
  }
  if (!(await ensureAuthenticated())) {
    throw new Error('Sign in to sync');
  }
  if (!onlineManager.isOnline()) {
    throw new Error('No internet connection');
  }

  const item = await getLedgerItem(id);
  if (!item) throw new Error('Sync item not found');

  if (item.kind === 'wellness') {
    if (!item.localDate) throw await failLedgerItemWith(item, 'Missing wellness date');
    // Widen the read so it covers this item's own day, not just the pass window.
    const lookbackDays = retryLookbackDays(item.localDate);
    const samples = await readPlatformWellness({ lookbackDays });
    const sample = samples.find((s) => s.date === item.localDate);
    if (!sample || !sampleHasMetrics(sample)) {
      throw await failLedgerItemWith(item, 'No on-device metrics for that day');
    }
    const status = await syncWellnessSample(sample, true, generation);
    if (status === 'failed') await throwLedgerFailure(id);
    return;
  }

  if (!prefs.syncWorkouts) {
    throw new Error('Enable Sync workouts first');
  }
  const lookbackDays = retryLookbackDays(item.startedAt);
  const sessions = await readPlatformWorkouts({ lookbackDays });
  const sessionId = id.replace(/^workout:/, '');
  const session = sessions.find((s) => s.platformSessionId === sessionId);
  if (!session) throw await failLedgerItemWith(item, 'Workout no longer on device');
  const remotes = await fetchRemoteWorkoutsForMatch(lookbackDays);
  const status = await syncWorkoutSession(session, remotes, true, generation);
  if (status === 'failed' || status === 'abandoned') await throwLedgerFailure(id);
}

/**
 * Sync (or force resync) a single on-device workout by platform session id.
 */
export async function syncWorkoutByPlatformSessionId(
  platformSessionId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  return trackManualSync(syncWorkoutByPlatformSessionIdImpl(platformSessionId, options));
}

async function syncWorkoutByPlatformSessionIdImpl(
  platformSessionId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const generation = getHealthSyncGeneration();

  await assertWorkoutSyncAllowed();

  const session = await findPlatformWorkoutSession(platformSessionId);
  if (!session) throw new Error('Workout no longer on device');

  const remotes = await fetchRemoteWorkoutsForMatch(LOOKBACK_DAYS);
  const force = options.force === true;
  const status = await syncWorkoutSession(session, remotes, force, generation);
  if (status === 'failed' || status === 'abandoned') {
    await throwLedgerFailure(workoutLedgerId(platformSessionId));
  }
}

export type SyncUnsyncedWorkoutsResult = {
  attempted: number;
  synced: number;
  failed: number;
  pending: number;
};

/** Sync only inventory rows that are needs_sync / failed / pending. */
export async function syncUnsyncedWorkouts(): Promise<SyncUnsyncedWorkoutsResult> {
  return trackManualSync(syncUnsyncedWorkoutsImpl());
}

const UNREADABLE_WORKOUT_ERROR = 'Workout is no longer readable on this device';

/** Write the reason a listed workout could not be re-read onto its ledger row. */
async function recordUnreadableWorkout(
  row: { platformSessionId: string; platform: HealthPlatform; title: string; startedAt: string },
  generation: number,
): Promise<void> {
  if (!isHealthSyncGenerationCurrent(generation)) return;
  const id = workoutLedgerId(row.platformSessionId);
  const existing = await getLedgerItem(id);
  const item =
    existing ??
    seedNeedsSync('workout', {
      id,
      kind: 'workout',
      platform: row.platform,
      title: row.title,
      startedAt: row.startedAt,
    });
  if (!isHealthSyncGenerationCurrent(generation)) return;
  await saveLedgerItem(completeLedgerFailure(item, UNREADABLE_WORKOUT_ERROR));
}

async function syncUnsyncedWorkoutsImpl(): Promise<SyncUnsyncedWorkoutsResult> {
  const generation = getHealthSyncGeneration();

  await assertWorkoutSyncAllowed();

  const [rows, sessions, remotes] = await Promise.all([
    listRecentPlatformWorkoutsWithStatus(),
    readPlatformWorkouts({ lookbackDays: LOOKBACK_DAYS }),
    fetchRemoteWorkoutsForMatch(LOOKBACK_DAYS),
  ]);
  const sessionById = new Map(sessions.map((s) => [s.platformSessionId, s]));
  const targets = rows.filter((row) => isUnsyncedRecentStatus(row.status));
  const result: SyncUnsyncedWorkoutsResult = {
    attempted: 0,
    synced: 0,
    failed: 0,
    pending: 0,
  };

  for (const row of targets) {
    if (!isHealthSyncGenerationCurrent(generation)) break;
    const session = sessionById.get(row.platformSessionId);
    result.attempted += 1;
    if (!session) {
      result.failed += 1;
      // Record *why* on the row itself — otherwise "Sync all" reports that some
      // workouts could not be synced while every row still reads needs_sync
      // with no explanation (CW-465).
      await recordUnreadableWorkout(row, generation);
      continue;
    }
    const status = await syncWorkoutSession(session, remotes, true, generation);
    if (status === 'cancelled') {
      result.attempted -= 1;
      break;
    }
    if (status === 'synced' || status === 'skipped') result.synced += 1;
    else if (status === 'pending') result.pending += 1;
    else result.failed += 1;
  }
  return result;
}
