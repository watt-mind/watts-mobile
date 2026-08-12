import {
  APP_VERSION,
  SENTRY_DIST,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
} from '@/src/config/env';
import {
  SENTRY_IGNORE_ERRORS,
  isNonReportingEnvironment,
  shouldDropSentryEvent,
} from '@/src/lib/sentryFilter';

/**
 * True for any Metro-served / debug build, regardless of how
 * `EXPO_PUBLIC_SENTRY_ENVIRONMENT` happens to be set in the local `.env`.
 */
const IS_DEV_BUILD = typeof __DEV__ !== 'undefined' && __DEV__;

export function initSentry() {
  if (!SENTRY_DSN) return;

  /**
   * CW-510: dev-machine errors used to reach the production Sentry project and
   * auto-file Linear tickets. The SDK is still initialised in dev builds so
   * every lazy `require('@sentry/react-native')` consumer keeps working
   * unchanged — `enabled: false` simply makes its transport a no-op.
   */
  const reportingEnabled = !IS_DEV_BUILD && !isNonReportingEnvironment(SENTRY_ENVIRONMENT);

  // Lazy require so builds without a DSN stay lightweight.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: reportingEnabled,
    tracesSampleRate: reportingEnabled ? 0.1 : 0,
    enableAutoSessionTracking: reportingEnabled,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE ?? `coach-watts-mobile@${APP_VERSION}`,
    dist: SENTRY_DIST,
    ignoreErrors: [...SENTRY_IGNORE_ERRORS],
    // Second line of defence: drops dev/e2e events and Metro Fast Refresh
    // stacks (never actionable) even if `enabled` is ever flipped back on.
    beforeSend: (event) =>
      shouldDropSentryEvent(event, {
        isDevBuild: IS_DEV_BUILD,
        environment: SENTRY_ENVIRONMENT,
      }).drop
        ? null
        : event,
  });
}
