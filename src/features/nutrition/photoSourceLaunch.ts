import type { PhotoSourceMode } from './photoMealSettings';

/** What a photo shortcut should do for the athlete's saved source preference. */
export type PhotoSourceLaunch = 'camera' | 'library' | 'ask';

export type PhotoCaptureSettings = {
  sourceMode: PhotoSourceMode;
  saveToLibrary: boolean;
};

export function resolvePhotoSourceLaunch(mode: PhotoSourceMode): PhotoSourceLaunch {
  if (mode === 'camera') return 'camera';
  if (mode === 'library') return 'library';
  return 'ask';
}

/**
 * Settings to use for a capture. An explicit `override` (read straight from
 * storage by the quick-action auto-open path) always wins over the values the
 * component rendered with, which can still be the pre-hydration defaults.
 */
export function resolvePhotoCaptureSettings(
  rendered: PhotoCaptureSettings,
  override?: Partial<PhotoCaptureSettings> | null,
): PhotoCaptureSettings {
  return {
    sourceMode: override?.sourceMode ?? rendered.sourceMode,
    saveToLibrary: override?.saveToLibrary ?? rendered.saveToLibrary,
  };
}
