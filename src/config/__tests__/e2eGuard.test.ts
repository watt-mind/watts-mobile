import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveE2eAuthEnabled } from '../e2eGuard';

afterEach(() => {
  vi.restoreAllMocks();
});

function silenceConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('resolveE2eAuthEnabled', () => {
  it('enables when the flag is on and the build is a dev build', () => {
    const errorSpy = silenceConsoleError();

    expect(
      resolveE2eAuthEnabled({ flagEnabled: true, isDev: true, sentryEnvironment: 'development' }),
    ).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('enables on a non-dev build when the sentry environment is e2e', () => {
    const errorSpy = silenceConsoleError();

    expect(
      resolveE2eAuthEnabled({ flagEnabled: true, isDev: false, sentryEnvironment: 'e2e' }),
    ).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('refuses on a production build even when the flag is on', () => {
    const errorSpy = silenceConsoleError();

    expect(
      resolveE2eAuthEnabled({ flagEnabled: true, isDev: false, sentryEnvironment: 'production' }),
    ).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('EXPO_PUBLIC_E2E_AUTH');
  });

  it('refuses on a preview build even when the flag is on', () => {
    const errorSpy = silenceConsoleError();

    expect(
      resolveE2eAuthEnabled({ flagEnabled: true, isDev: false, sentryEnvironment: 'preview' }),
    ).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('never throws when it detects the misconfiguration', () => {
    silenceConsoleError();

    expect(() =>
      resolveE2eAuthEnabled({ flagEnabled: true, isDev: false, sentryEnvironment: 'production' }),
    ).not.toThrow();
  });

  it('refuses for an unknown non-dev environment', () => {
    silenceConsoleError();

    expect(resolveE2eAuthEnabled({ flagEnabled: true, isDev: false, sentryEnvironment: '' })).toBe(
      false,
    );
    expect(
      resolveE2eAuthEnabled({ flagEnabled: true, isDev: false, sentryEnvironment: 'staging' }),
    ).toBe(false);
  });

  it('tolerates padding and casing on the sentry environment', () => {
    silenceConsoleError();

    expect(
      resolveE2eAuthEnabled({ flagEnabled: true, isDev: false, sentryEnvironment: '  E2E ' }),
    ).toBe(true);
    expect(
      resolveE2eAuthEnabled({ flagEnabled: true, isDev: false, sentryEnvironment: ' Production ' }),
    ).toBe(false);
  });

  it('stays disabled whenever the flag is off, in every environment', () => {
    const errorSpy = silenceConsoleError();

    for (const isDev of [true, false]) {
      for (const sentryEnvironment of ['development', 'e2e', 'preview', 'production', '']) {
        expect(resolveE2eAuthEnabled({ flagEnabled: false, isDev, sentryEnvironment })).toBe(false);
      }
    }

    // Flag off is a normal build, not a misconfiguration: nothing to report.
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
