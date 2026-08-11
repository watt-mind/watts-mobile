import { unregisterHealthSyncBackgroundTask } from './backgroundTask';
import { clearSyncLedger } from './ledger';
import { awaitInFlightHealthSyncPass, bumpHealthSyncGeneration } from './orchestrator';
import { clearSyncDiagnostic } from './syncDiagnostics';
import { clearHealthSyncPreferences } from './syncPreferences';
import { clearWatermarks } from './watermarks';

/**
 * Clear local Health Sync state on sign-out (ledger + preferences + watermarks + BG).
 *
 * Bumps the health-sync generation *before* anything else so a sync pass that started
 * before sign-out (or is about to write) treats itself as cancelled, then awaits that
 * pass so its in-flight writes are guaranteed to settle before the ledger is cleared.
 * Without this, a pass started before sign-out could still call saveLedgerItem/setWatermark
 * after the clear ran — letting the next account signed into this device inherit the prior
 * user's ledger/watermarks, or upload using a token that's about to be invalidated.
 */
export async function clearHealthSyncOnSignOut(): Promise<void> {
  bumpHealthSyncGeneration();
  await awaitInFlightHealthSyncPass();
  try {
    await unregisterHealthSyncBackgroundTask();
  } catch {
    // ignore
  }
  await Promise.all([
    clearSyncLedger(),
    clearHealthSyncPreferences(),
    clearWatermarks(),
    clearSyncDiagnostic(),
  ]);
}
