/**
 * Pure decision logic for which Sentry events this app is allowed to send.
 *
 * Background (CW-510): four Linear tickets (CW-306, CW-308, CW-309, CW-454)
 * were auto-filed from single-event, single-user errors captured on a
 * developer's own machine — Metro Fast Refresh mid-edit and an emulator
 * verifying a sideloaded debug APK. `Sentry.init()` had no filtering at all,
 * so every local dev session shipped errors into the production project and
 * the Sentry -> Linear intake filed a ticket for each.
 *
 * Kept free of imports on purpose so it can be unit-tested without the Sentry
 * SDK, Expo constants, or a React Native runtime.
 */

export type SentryStackFrame = {
  function?: string | null;
  module?: string | null;
  filename?: string | null;
  abs_path?: string | null;
};

export type SentryExceptionValue = {
  type?: string | null;
  value?: string | null;
  stacktrace?: { frames?: SentryStackFrame[] | null } | null;
};

/**
 * Structural subset of a Sentry `ErrorEvent` — everything this module reads.
 * A real Sentry event is assignable to it.
 */
export type FilterableSentryEvent = {
  environment?: string | null;
  message?: string | null;
  exception?: { values?: SentryExceptionValue[] | null } | null;
};

export type SentryDropReason = 'dev-build' | 'non-reporting-environment' | 'fast-refresh';

export type SentryFilterDecision = { drop: boolean; reason?: SentryDropReason };

export type SentryFilterContext = {
  /** `__DEV__` — true for any Metro-served / debug build, whatever it is tagged as. */
  isDevBuild: boolean;
  /** Build-time `SENTRY_ENVIRONMENT`; the event's own environment wins when set. */
  environment?: string | null;
};

/**
 * Environments whose errors never come from a real user, so never from a real
 * defect worth a ticket: a developer's machine (`development` and its common
 * aliases) and Maestro's `e2e` profile, which extends the development build.
 * `preview` (internal testers) and `production` are deliberately absent — those
 * are real installs on real devices and must keep reporting.
 */
export const NON_REPORTING_ENVIRONMENTS: readonly string[] = [
  'development',
  'dev',
  'local',
  'e2e',
  'test',
];

/**
 * Frame identifiers that only ever appear when Metro swaps a module into a
 * running bundle. Errors thrown through these are artefacts of editing files
 * mid-session (a half-saved import, a symbol that does not exist yet) and are
 * never actionable — in any environment.
 */
export const FAST_REFRESH_FRAME_MARKERS: readonly string[] = [
  'metroHotUpdateModule',
  'performReactRefresh',
  'HMRClient',
  'setupFastRefresh',
];

/** Passed to `Sentry.init({ ignoreErrors })` — message-level counterpart of the frame markers. */
export const SENTRY_IGNORE_ERRORS: readonly (string | RegExp)[] = [
  /metroHotUpdateModule/i,
  /performReactRefresh/i,
  /HMRClient/i,
];

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** True when `environment` identifies a developer machine or CI robot, not a user. */
export function isNonReportingEnvironment(environment: string | null | undefined): boolean {
  const normalized = normalize(environment);
  if (!normalized) return false;
  return NON_REPORTING_ENVIRONMENTS.includes(normalized);
}

function frameLooksLikeFastRefresh(frame: SentryStackFrame): boolean {
  const haystack = normalize(
    [frame.function, frame.module, frame.filename, frame.abs_path].filter(Boolean).join(' '),
  );
  if (!haystack) return false;
  return FAST_REFRESH_FRAME_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()));
}

/** True when any stack frame of the event came from Metro Fast Refresh / HMR. */
export function isFastRefreshEvent(event: FilterableSentryEvent): boolean {
  const values = event.exception?.values ?? [];
  return values.some((value) => (value.stacktrace?.frames ?? []).some(frameLooksLikeFastRefresh));
}

/**
 * The single decision point for `beforeSend`.
 *
 * Dropped: anything from a `__DEV__` build, anything tagged with a
 * non-reporting environment, and Fast Refresh / HMR stacks in every
 * environment. Everything else — including unsymbolicated production crashes
 * and events with no stack trace — still ships.
 */
export function shouldDropSentryEvent(
  event: FilterableSentryEvent,
  context: SentryFilterContext,
): SentryFilterDecision {
  if (context.isDevBuild) return { drop: true, reason: 'dev-build' };

  const environment = normalize(event.environment) || normalize(context.environment);
  if (isNonReportingEnvironment(environment)) {
    return { drop: true, reason: 'non-reporting-environment' };
  }

  if (isFastRefreshEvent(event)) return { drop: true, reason: 'fast-refresh' };

  return { drop: false };
}
