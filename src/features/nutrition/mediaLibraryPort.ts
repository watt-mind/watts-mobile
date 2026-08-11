/**
 * Device implementation of the media-library boundary used by
 * {@link ./saveMealPhotoToLibrary} (CW-475).
 *
 * `expo-media-library` is a real dependency and a config-plugin entry — this is
 * a static import on purpose. A missing native binary must fail loudly in a
 * build, not be swallowed at runtime.
 *
 * Everything here is *add-only* (`writeOnly: true`):
 *   - iOS asks for `PHAccessLevel.addOnly`, which needs
 *     `NSPhotoLibraryAddUsageDescription` (see app.json).
 *   - Android 13+ (API 33+) needs no runtime permission at all for an add —
 *     the write-only request resolves with an empty permission set. Older
 *     Android (our minSdk is 26) still needs `WRITE_EXTERNAL_STORAGE`, which
 *     the config plugin declares capped at `maxSdkVersion="32"`.
 * We pass an empty granular-permission list so no `READ_MEDIA_*` permission is
 * ever requested: this feature only writes.
 */
import { Asset, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';
import { Platform } from 'react-native';

import type {
  MediaLibraryPermissionSnapshot,
  MediaLibraryPort,
} from '@/src/features/nutrition/saveMealPhotoToLibrary';

/** Add-only access: never request read access for a save-only feature. */
const WRITE_ONLY = true;
/** Read scopes we deliberately do not request. */
const NO_GRANULAR_PERMISSIONS = [] as const;

/** The media library only exists on the native platforms. */
export const mediaLibraryAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

function toSnapshot(response: {
  granted: boolean;
  canAskAgain: boolean;
}): MediaLibraryPermissionSnapshot {
  return { granted: response.granted, canAskAgain: response.canAskAgain };
}

export const deviceMediaLibraryPort: MediaLibraryPort = {
  getPermissions: async () =>
    toSnapshot(await getPermissionsAsync(WRITE_ONLY, [...NO_GRANULAR_PERMISSIONS])),
  requestPermissions: async () =>
    toSnapshot(await requestPermissionsAsync(WRITE_ONLY, [...NO_GRANULAR_PERMISSIONS])),
  save: async (uri: string) => {
    await Asset.create(uri);
  },
};
