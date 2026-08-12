import { describe, expect, it } from 'vitest';

import { assertNoE2ePublicVariablesInReleaseBuild } from './e2eBuildGuard';

describe('assertNoE2ePublicVariablesInReleaseBuild', () => {
  it('allows E2E variables for a local development build', () => {
    expect(() =>
      assertNoE2ePublicVariablesInReleaseBuild({
        NODE_ENV: 'development',
        EXPO_PUBLIC_E2E_AUTH: '1',
        EXPO_PUBLIC_E2E_ACCESS_TOKEN: 'fixture-access-token',
      }),
    ).not.toThrow();
  });

  it('rejects E2E auth and fixture tokens for a local release archive', () => {
    expect(() =>
      assertNoE2ePublicVariablesInReleaseBuild({
        NODE_ENV: 'production',
        EXPO_PUBLIC_SENTRY_ENVIRONMENT: 'development',
        EXPO_PUBLIC_E2E_AUTH: '1',
        EXPO_PUBLIC_E2E_ACCESS_TOKEN: 'fixture-access-token',
        EXPO_PUBLIC_E2E_REFRESH_TOKEN: 'fixture-refresh-token',
      }),
    ).toThrow(/EXPO_PUBLIC_E2E_AUTH.*EXPO_PUBLIC_E2E_ACCESS_TOKEN.*EXPO_PUBLIC_E2E_REFRESH_TOKEN/);
  });

  it('rejects fixture tokens in an EAS release even if the bypass flag is off', () => {
    expect(() =>
      assertNoE2ePublicVariablesInReleaseBuild({
        EAS_BUILD: 'true',
        EXPO_PUBLIC_E2E_ACCESS_TOKEN: 'fixture-access-token',
      }),
    ).toThrow(/EXPO_PUBLIC_E2E_ACCESS_TOKEN/);
  });

  it('allows a release build with no E2E public variables', () => {
    expect(() =>
      assertNoE2ePublicVariablesInReleaseBuild({
        NODE_ENV: 'production',
        EXPO_PUBLIC_SENTRY_ENVIRONMENT: 'production',
      }),
    ).not.toThrow();
  });
});
