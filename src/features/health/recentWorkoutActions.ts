/**
 * What an upload control on the Recent workouts screen should actually do
 * (CW-573).
 *
 * Uploading requires both `syncEnabled` and `syncWorkouts`. The screen used to
 * express that by rendering the Sync / Resync / Sync all buttons `disabled`,
 * which `Button` forwards to the underlying `Pressable` — so tapping produced
 * no haptic, no spinner, no error, and no state change. The guards inside the
 * press handlers that would have explained the problem were unreachable,
 * because the control that calls them was inert. An athlete who had not managed
 * to turn sync on saw a button, tapped it, and concluded the feature was broken.
 *
 * So the prerequisite becomes the action: when uploads are off, the control
 * still works — it just routes to the setting that unblocks it.
 *
 * Deliberately pure — no React, no react-native — so the copy and the branch
 * choice are unit-testable off-device. The screen is a thin caller.
 */

export type RecentWorkoutUploadPrefs = {
  syncEnabled: boolean;
  syncWorkouts: boolean;
};

export type RecentWorkoutAction =
  /** Both prerequisites met — the control performs the upload. */
  | { kind: 'upload' }
  /**
   * A prerequisite is missing. The control stays enabled and sends the athlete
   * to Health Sync settings; `label` and `reason` say which switch is off.
   */
  | { kind: 'enable-sync'; label: string; reason: string };

/**
 * Decide what an upload control does, given the current sync preferences.
 *
 * `syncEnabled` is checked first: `setHealthSyncEnabled(true)` force-sets
 * `syncWorkouts`, so "sync off" is the case an athlete actually lands in, and
 * naming the switch they need is more useful than a generic message.
 */
export function resolveRecentWorkoutAction(prefs: RecentWorkoutUploadPrefs): RecentWorkoutAction {
  if (!prefs.syncEnabled) {
    return {
      kind: 'enable-sync',
      label: 'Turn on sync to upload',
      reason: 'Sync to Coach Watts is off, so nothing can upload from this list.',
    };
  }

  if (!prefs.syncWorkouts) {
    return {
      kind: 'enable-sync',
      label: 'Turn on workout sync',
      reason: 'Sync workouts is off, so workouts stay on this phone.',
    };
  }

  return { kind: 'upload' };
}

/** True when the controls should perform uploads rather than route to settings. */
export function canUploadRecentWorkouts(prefs: RecentWorkoutUploadPrefs): boolean {
  return resolveRecentWorkoutAction(prefs).kind === 'upload';
}
