import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'watts.health.syncDiagnostic.v1';

/**
 * Where a background/pass-level failure came from. These are *not* per-item sync
 * failures (those live on their own ledger entry) — they are whole-pass or
 * platform-level problems that must stay visible for diagnostics without being
 * mis-attributed to an unrelated ledger item (see CW-461).
 */
export type SyncDiagnosticScope = 'background_task' | 'sync_pass' | 'health_connect_changes';

export type SyncDiagnostic = {
  scope: SyncDiagnosticScope;
  message: string;
  /** ISO timestamp of when the failure was recorded. */
  at: string;
};

let memory: SyncDiagnostic | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

async function ensureHydrated(): Promise<void> {
  if (hydrated) return;
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      let next: SyncDiagnostic | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SyncDiagnostic;
          next = parsed && typeof parsed.message === 'string' ? parsed : null;
        }
      } catch {
        next = null;
      }
      // A write (record/clear) that landed while we were reading wins.
      if (hydrated) return;
      memory = next;
      hydrated = true;
      notify();
    })().finally(() => {
      hydrationPromise = null;
    });
  }
  return hydrationPromise;
}

export async function loadSyncDiagnostic(): Promise<SyncDiagnostic | null> {
  await ensureHydrated();
  return memory;
}

/** Stable snapshot for useSyncExternalStore — must not allocate on each call. */
export function getSyncDiagnosticSync(): SyncDiagnostic | null {
  return memory;
}

export function subscribeSyncDiagnostic(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function recordSyncDiagnostic(
  scope: SyncDiagnosticScope,
  message: string,
  at: string = new Date().toISOString(),
): Promise<SyncDiagnostic> {
  const entry: SyncDiagnostic = { scope, message: message.slice(0, 240), at };
  memory = entry;
  hydrated = true;
  notify();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Persistence is best-effort — the in-memory value still surfaces this run.
  }
  return entry;
}

export async function clearSyncDiagnostic(): Promise<void> {
  memory = null;
  hydrated = true;
  notify();
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function describeSyncDiagnosticScope(scope: SyncDiagnosticScope): string {
  switch (scope) {
    case 'background_task':
      return 'Background sync';
    case 'sync_pass':
      return 'Sync pass';
    case 'health_connect_changes':
      return 'Health Connect changes';
    default:
      return 'Health sync';
  }
}

/** Test helper */
export function _resetSyncDiagnosticsForTests(): void {
  memory = null;
  hydrated = false;
  hydrationPromise = null;
  listeners.clear();
}
