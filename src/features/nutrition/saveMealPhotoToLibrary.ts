/**
 * "Save Photos to Library" decision logic for meal capture (CW-475).
 *
 * Saving the captured meal photo to the device camera roll is a *side effect*
 * of logging a meal — it must never break the capture/analysis flow, and it
 * must never fail silently either (the athlete flipped a switch and expects
 * photos to show up in Photos).
 *
 * All platform/native access is injected through {@link MediaLibraryPort} so
 * this module stays pure and unit-testable in the node test environment.
 */

/** The subset of a media-library permission response this feature cares about. */
export type MediaLibraryPermissionSnapshot = {
  granted: boolean;
  /** `false` once the OS will no longer show the prompt (iOS never re-prompts). */
  canAskAgain: boolean;
};

/** Injectable boundary around `expo-media-library`. */
export type MediaLibraryPort = {
  /** Current add-to-library permission, without prompting. */
  getPermissions: () => Promise<MediaLibraryPermissionSnapshot>;
  /** Prompts for add-to-library permission. */
  requestPermissions: () => Promise<MediaLibraryPermissionSnapshot>;
  /** Writes the local file at `uri` into the device media library. */
  save: (uri: string) => Promise<void>;
};

export type SaveToLibraryOutcome =
  | { status: 'saved' }
  | { status: 'skipped'; reason: 'setting-off' | 'no-photo' | 'unsupported-platform' }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'error'; message: string };

export type SaveMealPhotoInput = {
  /** The athlete's "Save Photos to Library" setting. */
  enabled: boolean;
  /** Local file URI of the freshly captured photo. */
  uri?: string | null;
  /** Whether the media library exists on this platform (false on web). */
  supported?: boolean;
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/**
 * Attempts to save a captured meal photo to the device library.
 *
 * Never throws and never prompts unless the athlete has the setting on and a
 * photo was actually captured — so nothing here can run at app start.
 */
export async function saveMealPhotoToLibrary(
  input: SaveMealPhotoInput,
  port: MediaLibraryPort,
): Promise<SaveToLibraryOutcome> {
  if (!input.enabled) return { status: 'skipped', reason: 'setting-off' };
  if (input.supported === false) return { status: 'skipped', reason: 'unsupported-platform' };
  if (!input.uri) return { status: 'skipped', reason: 'no-photo' };

  let permission: MediaLibraryPermissionSnapshot;
  try {
    permission = await port.getPermissions();
    if (!permission.granted) {
      // Asking again when the OS will not prompt just burns a round trip and
      // returns the same denial — surface it instead.
      if (!permission.canAskAgain) {
        return { status: 'denied', canAskAgain: false };
      }
      permission = await port.requestPermissions();
    }
  } catch (err) {
    return {
      status: 'error',
      message: errorMessage(err, 'Could not check photo library permission'),
    };
  }

  if (!permission.granted) {
    return { status: 'denied', canAskAgain: permission.canAskAgain };
  }

  try {
    await port.save(input.uri);
  } catch (err) {
    return { status: 'error', message: errorMessage(err, 'Could not save photo to your library') };
  }

  return { status: 'saved' };
}

export type SaveToLibraryFeedback = {
  /** User-facing notice, or `null` when there is nothing worth saying. */
  notice: string | null;
  /**
   * Whether the "Save Photos to Library" setting should be switched off, so the
   * toggle stops promising something the OS will not let us do.
   */
  disableSetting: boolean;
};

/**
 * Turns an outcome into what the UI should do about it. A permanent denial
 * flips the setting off (it cannot work until the athlete changes it in system
 * settings); a recoverable denial or a write failure is only reported.
 */
export function resolveSaveToLibraryFeedback(outcome: SaveToLibraryOutcome): SaveToLibraryFeedback {
  switch (outcome.status) {
    case 'saved':
    case 'skipped':
      return { notice: null, disableSetting: false };
    case 'denied':
      return outcome.canAskAgain
        ? {
            notice:
              'Meal photo was not saved to your library — photo access was declined. Your meal was still analyzed.',
            disableSetting: false,
          }
        : {
            notice:
              'Coach Watts cannot save meal photos without photo library access, so “Save Photos to Library” has been turned off. Allow photo access in system settings to turn it back on.',
            disableSetting: true,
          };
    case 'error':
      return {
        notice: `Meal photo was not saved to your library (${outcome.message}). Your meal was still analyzed.`,
        disableSetting: false,
      };
  }
}
