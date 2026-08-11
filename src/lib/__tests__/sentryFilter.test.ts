import { describe, expect, it } from 'vitest';

import {
  FAST_REFRESH_FRAME_MARKERS,
  NON_REPORTING_ENVIRONMENTS,
  SENTRY_IGNORE_ERRORS,
  isFastRefreshEvent,
  isNonReportingEnvironment,
  shouldDropSentryEvent,
  type FilterableSentryEvent,
} from '../sentryFilter';

function eventWithFrames(
  functions: (string | undefined)[],
  extra: Partial<FilterableSentryEvent> = {},
): FilterableSentryEvent {
  return {
    exception: {
      values: [
        {
          type: 'ReferenceError',
          value: "Property 'Colors' doesn't exist",
          stacktrace: { frames: functions.map((fn) => ({ function: fn })) },
        },
      ],
    },
    ...extra,
  };
}

describe('isNonReportingEnvironment', () => {
  it('treats the local/CI environments as non-reporting', () => {
    for (const environment of NON_REPORTING_ENVIRONMENTS) {
      expect(isNonReportingEnvironment(environment)).toBe(true);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isNonReportingEnvironment('  Development ')).toBe(true);
    expect(isNonReportingEnvironment('E2E')).toBe(true);
  });

  it('keeps real user environments reporting', () => {
    expect(isNonReportingEnvironment('production')).toBe(false);
    expect(isNonReportingEnvironment('preview')).toBe(false);
    expect(isNonReportingEnvironment('staging')).toBe(false);
  });

  it('does not treat an unknown or missing environment as local', () => {
    expect(isNonReportingEnvironment(undefined)).toBe(false);
    expect(isNonReportingEnvironment('')).toBe(false);
    expect(isNonReportingEnvironment('some-new-env')).toBe(false);
  });
});

describe('isFastRefreshEvent', () => {
  it('detects Metro hot-update frames', () => {
    expect(isFastRefreshEvent(eventWithFrames(['metroHotUpdateModule', 'renderScreen']))).toBe(
      true,
    );
  });

  it('detects React Refresh and HMR client frames', () => {
    expect(isFastRefreshEvent(eventWithFrames(['performReactRefresh']))).toBe(true);
    expect(isFastRefreshEvent(eventWithFrames([undefined, 'HMRClient.setup']))).toBe(true);
  });

  it('matches markers in module and filename too', () => {
    expect(
      isFastRefreshEvent({
        exception: {
          values: [{ stacktrace: { frames: [{ filename: 'node_modules/.../HMRClient.js' }] } }],
        },
      }),
    ).toBe(true);
    expect(
      isFastRefreshEvent({
        exception: { values: [{ stacktrace: { frames: [{ module: 'metroHotUpdateModule' }] } }] },
      }),
    ).toBe(true);
  });

  it('leaves ordinary application stacks alone', () => {
    expect(isFastRefreshEvent(eventWithFrames(['HomeScreen', 'useTodayQuery']))).toBe(false);
  });

  it('tolerates events with no exception or frames', () => {
    expect(isFastRefreshEvent({})).toBe(false);
    expect(isFastRefreshEvent({ exception: { values: [] } })).toBe(false);
    expect(isFastRefreshEvent({ exception: { values: [{ stacktrace: { frames: [] } }] } })).toBe(
      false,
    );
  });

  it('exports the documented marker set', () => {
    expect(FAST_REFRESH_FRAME_MARKERS).toEqual(
      expect.arrayContaining(['metroHotUpdateModule', 'performReactRefresh', 'HMRClient']),
    );
  });
});

describe('shouldDropSentryEvent', () => {
  const productionContext = { isDevBuild: false, environment: 'production' };

  it('drops everything from a __DEV__ build', () => {
    expect(
      shouldDropSentryEvent(eventWithFrames(['HomeScreen']), {
        isDevBuild: true,
        environment: 'production',
      }),
    ).toEqual({ drop: true, reason: 'dev-build' });
  });

  it('drops events tagged with a non-reporting environment', () => {
    expect(
      shouldDropSentryEvent(eventWithFrames(['HomeScreen']), {
        isDevBuild: false,
        environment: 'development',
      }),
    ).toEqual({ drop: true, reason: 'non-reporting-environment' });
  });

  it('prefers the environment carried on the event itself', () => {
    expect(
      shouldDropSentryEvent(eventWithFrames(['HomeScreen'], { environment: 'development' }), {
        isDevBuild: false,
        environment: 'production',
      }),
    ).toEqual({ drop: true, reason: 'non-reporting-environment' });
  });

  it('drops Fast Refresh / HMR events even in production', () => {
    expect(
      shouldDropSentryEvent(eventWithFrames(['metroHotUpdateModule']), productionContext),
    ).toEqual({ drop: true, reason: 'fast-refresh' });
  });

  it('keeps genuine production errors', () => {
    expect(shouldDropSentryEvent(eventWithFrames(['HomeScreen']), productionContext)).toEqual({
      drop: false,
    });
  });

  it('keeps genuine preview (internal tester) errors', () => {
    expect(
      shouldDropSentryEvent(eventWithFrames(['HomeScreen']), {
        isDevBuild: false,
        environment: 'preview',
      }),
    ).toEqual({ drop: false });
  });

  it('keeps events with no stack trace in production', () => {
    expect(shouldDropSentryEvent({ message: 'Background ANR' }, productionContext)).toEqual({
      drop: false,
    });
  });
});

describe('SENTRY_IGNORE_ERRORS', () => {
  const matches = (message: string) =>
    SENTRY_IGNORE_ERRORS.some((pattern) =>
      typeof pattern === 'string' ? message.includes(pattern) : pattern.test(message),
    );

  it('ignores Fast Refresh / HMR messages', () => {
    expect(matches('metroHotUpdateModule failed')).toBe(true);
    expect(matches('Error in performReactRefresh')).toBe(true);
    expect(matches('HMRClient: connection lost')).toBe(true);
  });

  it('does not ignore real application errors', () => {
    expect(matches('Maximum update depth exceeded')).toBe(false);
    expect(matches('Network request failed')).toBe(false);
  });
});
