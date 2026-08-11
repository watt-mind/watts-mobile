import type { SyncPassResult } from './orchestrator';

/**
 * What the athlete is told after a sync pass that was triggered by flipping a
 * preference on, rather than by tapping "Sync now" (CW-336).
 *
 * HealthKit deliberately never reveals per-category *read* grants, so
 * `requestHealthSyncPermissions()` resolves `true` even when every category was
 * denied in the system sheet. The only honest signal we have is the outcome of
 * the first pass: it completed, and the platform store handed us nothing.
 *
 * Deliberately pure — no React and no react-native imports — so the decision of
 * what to say is unit-testable off-device. The screen is a thin caller.
 */

/**
 * The fields of a {@link SyncPassResult} this decision reads. `reason` is
 * accepted but deliberately ignored: *every* skip reason stays silent, so no
 * new reason added to the orchestrator can accidentally start showing the hint.
 */
export type EnableSyncOutcomeInput = Pick<SyncPassResult, 'foundLocalData' | 'skipped' | 'reason'>;

export type EnableSyncOutcome = {
  /** True when a completed pass read nothing usable — likely denied read access. */
  noDataFound: boolean;
  /** Banner copy to show, or null when there is nothing worth saying. */
  hint: string | null;
};

export const NO_DATA_HINT_IOS =
  'No Health data was found on this device. If you granted access recently, open Health → Profile → Apps → Coach Watts and check that read access is on.';

export const NO_DATA_HINT_ANDROID =
  'No Health Connect data was found on this device. Check that your fitness apps write to Health Connect and that Coach Watts has read access.';

/**
 * Map a finished sync pass to the hint the athlete should see.
 *
 * A `skipped` pass (offline, not authenticated, sync disabled, signed out
 * mid-pass) read nothing because it never tried — that is not evidence of
 * denial, so it must stay silent. Warning someone who is merely offline that no
 * health data exists on their phone is worse than saying nothing.
 *
 * @param result The pass result, or null/undefined when no pass ran.
 * @param platformOS `Platform.OS` from the caller (kept as a plain string so
 *   this module stays free of react-native imports).
 */
export function resolveEnableSyncOutcome(
  result: EnableSyncOutcomeInput | null | undefined,
  platformOS: string,
): EnableSyncOutcome {
  if (!result || result.skipped || result.foundLocalData) {
    return { noDataFound: false, hint: null };
  }

  return {
    noDataFound: true,
    hint: platformOS === 'ios' ? NO_DATA_HINT_IOS : NO_DATA_HINT_ANDROID,
  };
}
