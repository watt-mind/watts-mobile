/**
 * Per-key single-flight de-duplication (CW-343).
 *
 * A plain global "one operation at a time" gate is the wrong granularity for a
 * queue of independent items: it stops two callers from working on the SAME
 * item, but it also serialises everything else behind whichever item happens to
 * be in flight. This keeps one entry per key instead — concurrent callers on the
 * same key share a single promise, while different keys run fully in parallel.
 *
 * The entry is released when the underlying promise SETTLES, resolve or reject,
 * so a failed operation never wedges its key: the next call re-runs the factory.
 * A caller that joins an in-flight operation receives that operation's result,
 * which means it also inherits its options — for a health-sync retry that joins
 * a running pass, the upload it wanted has already been issued, which is exactly
 * the point.
 *
 * Only meaningful within one JS runtime and one process — this is not a lock
 * across app launches, and it does not protect against a server-side duplicate
 * submitted by a different device.
 */

/** Runs `factory` under a lock scoped to `key`. */
export type KeyedSingleFlight = {
  <T>(key: string, factory: () => Promise<T>): Promise<T>;
  /** Number of keys currently in flight — for tests and diagnostics. */
  readonly size: number;
};

export function createKeyedSingleFlight(): KeyedSingleFlight {
  const inFlight = new Map<string, Promise<unknown>>();

  function run<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;

    let started: Promise<T>;
    try {
      // Called synchronously so the key is claimed before any caller can await:
      // registration below happens in the same tick, ahead of the first yield.
      started = factory();
    } catch (err) {
      // A factory that throws synchronously never held the key.
      return Promise.reject(err);
    }

    const tracked = started.finally(() => {
      // Release on settle — resolve or reject — so a failure does not wedge the
      // key. The identity check keeps a late release from evicting a newer entry.
      if (inFlight.get(key) === tracked) inFlight.delete(key);
    });
    inFlight.set(key, tracked);
    return tracked;
  }

  return Object.defineProperty(run, 'size', {
    get: () => inFlight.size,
  }) as KeyedSingleFlight;
}
