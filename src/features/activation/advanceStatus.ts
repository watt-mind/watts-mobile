import { mergeActivationAdvance } from './mapStatus';
import type { ActivationStatus } from './types';

/**
 * Ceiling for anything an activation advance awaits before the caller navigates.
 * Nothing in the current implementation blocks, but a step that cannot advance
 * is a dead end for the athlete — so the wait is capped structurally rather than
 * by convention. (CW-466)
 */
export const ACTIVATION_ADVANCE_TIMEOUT_MS = 4_000;

/**
 * Resolve when `promise` settles, or after `ms`, whichever comes first.
 * A timeout resolves (never rejects) — the caller treats it as "carry on".
 */
export function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  // If the race is won by the timer, the original rejection would otherwise be
  // unhandled. This extra handler does not affect the race branch.
  void promise.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });

  return Promise.race([promise, guard]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** The slice of QueryClient an activation advance needs. */
export type ActivationAdvanceClient = {
  setQueryData: (
    key: readonly unknown[],
    updater: (prev: ActivationStatus | undefined) => ActivationStatus | undefined,
  ) => unknown;
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>;
};

type AdvanceOptions = {
  client: ActivationAdvanceClient;
  /** Identity-scoped cache key, or null when there is no identity to patch. */
  cacheKey: readonly unknown[] | null;
  /** Prefix key every activation status query shares. */
  invalidateKey: readonly unknown[];
  timeoutMs?: number;
};

/**
 * Optimistically patch activation status and hand control straight back so the
 * caller can navigate.
 *
 * The refetch is fired but deliberately NOT awaited: TanStack pauses queries
 * whenever `onlineManager` reports offline, and a paused refetch never settles,
 * so awaiting `invalidateQueries` stranded every activation step behind a
 * spinner that could not fail (invalidateQueries cannot reject). The forward
 * patch is re-applied once the refetch lands so a lagging server cannot bounce
 * the wizard back to a completed step. (CW-466)
 */
export async function advanceActivationStatus(
  patch: Partial<ActivationStatus>,
  { client, cacheKey, invalidateKey, timeoutMs = ACTIVATION_ADVANCE_TIMEOUT_MS }: AdvanceOptions,
): Promise<void> {
  const applyPatch = () => {
    if (!cacheKey) return;
    client.setQueryData(cacheKey, (prev) => (prev ? mergeActivationAdvance(prev, patch) : prev));
  };

  const run = async () => {
    applyPatch();
    void Promise.resolve(client.invalidateQueries({ queryKey: invalidateKey }))
      .then(applyPatch)
      .catch(() => {
        /* background refresh only — the optimistic patch already advanced the UI */
      });
  };

  await settleWithin(run(), timeoutMs);
}
