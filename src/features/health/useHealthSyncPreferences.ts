import { useCallback, useEffect, useSyncExternalStore } from 'react';

import {
  getHealthSyncPreferencesSync,
  isHealthSyncPreferencesHydrated,
  loadHealthSyncPreferences,
  setHealthSyncEnabled,
  setHealthSyncWorkouts,
  subscribeHealthSyncPreferences,
} from './syncPreferences';
import type { HealthSyncPreferences } from './types';
import {
  registerHealthSyncBackgroundTask,
  unregisterHealthSyncBackgroundTask,
} from './backgroundTask';
import { requestHealthSyncPermissions } from './syncPermissions';
import { runHealthSyncPass, type SyncPassResult } from './orchestrator';

/**
 * Result of a preference change, including the first sync pass it kicked off.
 *
 * The pass result is what tells the caller whether anything was actually
 * readable — on iOS, granting permission is not evidence that reads will
 * return data (CW-336).
 */
export type HealthSyncPreferenceChange = {
  preferences: HealthSyncPreferences;
  /** The first pass triggered by this change, or null when none ran or it threw. */
  syncPass: SyncPassResult | null;
};

/**
 * Run the first pass after enabling, surfacing its result instead of dropping it.
 *
 * A failing pass must not fail the preference change itself — the preference is
 * already persisted at this point, and the toggle should stay on. Callers treat
 * a null result as "nothing to say about it".
 */
async function runFirstSyncPass(): Promise<SyncPassResult | null> {
  try {
    return await runHealthSyncPass();
  } catch (err) {
    console.warn('[HealthSync] First sync pass after preference change failed:', err);
    return null;
  }
}

export function useHealthSyncPreferences() {
  const prefs = useSyncExternalStore(
    subscribeHealthSyncPreferences,
    getHealthSyncPreferencesSync,
    getHealthSyncPreferencesSync,
  );

  useEffect(() => {
    if (!isHealthSyncPreferencesHydrated()) {
      void loadHealthSyncPreferences();
    }
  }, []);

  const setEnabled = useCallback(async (enabled: boolean): Promise<HealthSyncPreferenceChange> => {
    if (enabled) {
      const granted = await requestHealthSyncPermissions();
      if (!granted) {
        throw new Error('Health permissions are required to enable sync');
      }
      const next = await setHealthSyncEnabled(true);
      await registerHealthSyncBackgroundTask();
      return { preferences: next, syncPass: await runFirstSyncPass() };
    }
    const next = await setHealthSyncEnabled(false);
    await unregisterHealthSyncBackgroundTask();
    return { preferences: next, syncPass: null };
  }, []);

  const setWorkouts = useCallback(async (enabled: boolean): Promise<HealthSyncPreferenceChange> => {
    if (enabled) {
      const granted = await requestHealthSyncPermissions();
      if (!granted) {
        throw new Error('Workout health permissions are required to enable workout sync');
      }
    }
    const next = await setHealthSyncWorkouts(enabled);
    if (next.syncEnabled && enabled) {
      return { preferences: next, syncPass: await runFirstSyncPass() };
    }
    return { preferences: next, syncPass: null };
  }, []);

  return {
    preferences: prefs as HealthSyncPreferences,
    setEnabled,
    setWorkouts,
    hydrated: isHealthSyncPreferencesHydrated(),
  };
}
