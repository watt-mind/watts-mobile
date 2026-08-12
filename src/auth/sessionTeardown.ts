/**
 * Ordering invariant for every identity transition (sign-out, server-revoked
 * refresh token, instance switch).
 *
 * The three steps must run in this order, each awaited before the next starts:
 *
 *   1. cancel in-flight queries
 *   2. clear the in-memory QueryClient
 *   3. clear the persisted (AsyncStorage) cache
 *
 * Wiping disk first is a privacy bug, not a style preference: a request that is
 * still in flight when teardown begins can resolve *after* the AsyncStorage key
 * is removed. Its cache write repopulates allowlisted queries (profile,
 * wellness, chat, today, activity, notifications inbox, performance — see
 * `shouldPersistQuery` in `src/query/persist.ts`), and the persister's throttled
 * write flushes that state straight back to disk with nothing left to erase it.
 * The next cold launch then rehydrates the previous athlete's data before auth
 * is even checked. Cancelling first shrinks the window to nothing; clearing
 * memory before disk means any straggler writes into an already-emptied client
 * whose dehydrated snapshot is empty too.
 *
 * Collaborators are injected rather than imported so this stays a pure module,
 * testable under the repo's node-environment vitest setup (no `expo-*`, no
 * React, no QueryClient instance).
 */
export type SessionTeardownSteps = {
  /** Drop in-flight fetches so none can resolve into the cache mid-teardown. */
  cancelQueries: () => void | Promise<void>;
  /** Empty the in-memory QueryClient (`queryClient.clear()`). */
  clearMemoryCache: () => void | Promise<void>;
  /** Remove the persisted cache entry (`clearPersistedQueryCache()`). */
  clearPersistedCache: () => void | Promise<void>;
};

async function runStep(label: string, step: () => void | Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    // Never let an earlier step's failure skip a later one: the disk wipe is the
    // privacy-critical step and must run even if cancellation rejected. Callers
    // may also fire this with `void` (the synchronous auth-failure handler), so
    // it must not surface an unhandled rejection either.
    console.warn(`Session teardown step "${label}" failed`, error);
  }
}

/** Tear down every session cache in the one safe order. Never rejects. */
export async function teardownSessionCaches({
  cancelQueries,
  clearMemoryCache,
  clearPersistedCache,
}: SessionTeardownSteps): Promise<void> {
  await runStep('cancelQueries', cancelQueries);
  await runStep('clearMemoryCache', clearMemoryCache);
  await runStep('clearPersistedCache', clearPersistedCache);
}
