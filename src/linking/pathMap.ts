/**
 * Deep-link constants shared by the scheme, push `data.path`, and https `/go/*` entry points:
 * `APP_SCHEME`, `UNIVERSAL_LINK_PREFIX`, `OAUTH_CALLBACK_PATH`, `PUSH_TYPE_DEFAULT_PATHS`.
 *
 * This file owns no path resolution. Path → Expo Router href lives in
 * `src/linking/resolveDeepLink.ts` (code source of truth); `docs/deep-links.md`
 * holds the canonical path table.
 *
 * Freeze aliases once the first store build ships.
 */

export const APP_SCHEME = 'coachwatts';

/** HTTPS universal-link path prefix on coachwatts.com (avoids web route collisions). */
export const UNIVERSAL_LINK_PREFIX = '/go';

export const OAUTH_CALLBACK_PATH = '/oauth/callback';

/** Default targets when push has `data.type` but no `data.path`. */
export const PUSH_TYPE_DEFAULT_PATHS = {
  RECOMMENDATION_READY: '/today',
  WORKOUT_ANALYSIS_READY: '/activities',
  SYNC_COMPLETED: '/today',
  COACH_MESSAGE: '/coach',
} as const;

export type PushEventType = keyof typeof PUSH_TYPE_DEFAULT_PATHS;
