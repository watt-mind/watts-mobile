import AsyncStorage from '@react-native-async-storage/async-storage';
import { onlineManager } from '@tanstack/react-query';

import { saveWellnessCheckin } from './api';
import type { WellnessUploadPayload } from './types';

/** Multi-entry queue. `v1` was a single slot and is migrated on first read. */
const QUEUE_KEY = 'watts.offline.wellnessCheckin.v2';
const LEGACY_QUEUE_KEY = 'watts.offline.wellnessCheckin.v1';

/**
 * Upper bound on queued check-ins. One entry per date, so this is ~2 weeks of
 * fully offline logging — well past any realistic trip — while keeping the
 * stored blob small and bounded. Oldest entries are dropped first.
 */
export const MAX_PENDING_WELLNESS_CHECKINS = 14;

export type PendingWellnessCheckin = {
  payload: WellnessUploadPayload;
  queuedAt: number;
};

// `Date.now()` alone can collide when two check-ins are queued within the
// same millisecond (e.g. a save arriving while a flush's POST is in flight).
// A monotonic per-process counter as a tiebreaker guarantees each enqueue
// gets a strictly increasing `queuedAt`, so `clearEntryIfUnchanged` below can
// reliably tell "still the entry we flushed" from "a newer one arrived".
let queuedAtSequence = 0;
function nextQueuedAt(): number {
  queuedAtSequence = (queuedAtSequence + 1) % 1000;
  return Date.now() * 1000 + queuedAtSequence;
}

function isPendingEntry(value: unknown): value is PendingWellnessCheckin {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as PendingWellnessCheckin;
  return typeof entry.payload?.date === 'string' && typeof entry.queuedAt === 'number';
}

function sortByQueuedAt(entries: PendingWellnessCheckin[]): PendingWellnessCheckin[] {
  return [...entries].sort((a, b) => a.queuedAt - b.queuedAt);
}

/**
 * Insert an entry, keeping at most one entry per date: a re-submission for a
 * date replaces the older queued entry for that same date rather than
 * duplicating it (the server-side check-in is per-date anyway).
 */
function upsertByDate(
  entries: PendingWellnessCheckin[],
  entry: PendingWellnessCheckin,
): PendingWellnessCheckin[] {
  const existing = entries.find((item) => item.payload.date === entry.payload.date);
  const winner = existing && existing.queuedAt > entry.queuedAt ? existing : entry;
  const rest = entries.filter((item) => item.payload.date !== entry.payload.date);
  return sortByQueuedAt([...rest, winner]);
}

async function writeQueue(entries: PendingWellnessCheckin[]): Promise<void> {
  if (entries.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
    return;
  }
  // Drop the oldest entries first when over the cap.
  const capped = sortByQueuedAt(entries).slice(-MAX_PENDING_WELLNESS_CHECKINS);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(capped));
}

/**
 * Take (and remove) the pre-v2 single-slot entry, if any. Called on every read
 * so an app upgrade can never drop a check-in that was queued by the old build.
 */
async function takeLegacyEntry(): Promise<PendingWellnessCheckin | null> {
  let legacy: PendingWellnessCheckin | null = null;
  try {
    const raw = await AsyncStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isPendingEntry(parsed)) legacy = parsed;
  } catch {
    legacy = null;
  }
  await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
  return legacy;
}

async function readQueue(): Promise<PendingWellnessCheckin[]> {
  let entries: PendingWellnessCheckin[] = [];
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed.filter(isPendingEntry);
    }
  } catch {
    entries = [];
  }

  const legacy = await takeLegacyEntry();
  if (legacy) {
    entries = upsertByDate(entries, legacy);
    await writeQueue(entries);
  }

  return sortByQueuedAt(entries);
}

/** All queued check-ins, oldest first. */
export async function loadPendingWellnessCheckins(): Promise<PendingWellnessCheckin[]> {
  return readQueue();
}

/** The oldest queued check-in, or null when the queue is empty. */
export async function loadPendingWellnessCheckin(): Promise<PendingWellnessCheckin | null> {
  const entries = await readQueue();
  return entries[0] ?? null;
}

export async function enqueueWellnessCheckin(payload: WellnessUploadPayload): Promise<void> {
  const entries = await readQueue();
  await writeQueue(upsertByDate(entries, { payload, queuedAt: nextQueuedAt() }));
}

/** Drop every queued check-in (used on sign-out / identity transitions). */
export async function clearPendingWellnessCheckin(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
  await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
}

/**
 * Remove one flushed entry, but only if it is still the same entry that was
 * just synced (matched by date + `queuedAt`). If the athlete re-saved that
 * date while the POST was in flight, the newer entry stays queued.
 */
async function clearEntryIfUnchanged(entry: PendingWellnessCheckin): Promise<void> {
  const entries = await readQueue();
  const current = entries.find((item) => item.payload.date === entry.payload.date);
  if (current && current.queuedAt !== entry.queuedAt) return;
  await writeQueue(entries.filter((item) => item.payload.date !== entry.payload.date));
}

/**
 * Flush every queued check-in, oldest first. Returns true if at least one
 * payload was synced. A failure part-way through keeps the un-synced entries
 * queued for the next attempt; it only rethrows when nothing synced at all.
 */
export async function flushPendingWellnessCheckin(): Promise<boolean> {
  if (!onlineManager.isOnline()) return false;
  const entries = await readQueue();
  if (entries.length === 0) return false;

  let synced = false;
  for (const entry of entries) {
    try {
      await saveWellnessCheckin(entry.payload);
    } catch (error) {
      // Almost certainly connectivity: stop here so the rest stay queued.
      if (!synced) throw error;
      console.warn('Partial offline wellness flush; remaining check-ins stay queued', error);
      return synced;
    }
    await clearEntryIfUnchanged(entry);
    synced = true;
  }
  return synced;
}
