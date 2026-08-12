const E2E_PUBLIC_VARIABLES = [
  'EXPO_PUBLIC_E2E_AUTH',
  'EXPO_PUBLIC_E2E_INSTANCE_URL',
  'EXPO_PUBLIC_E2E_ACCESS_TOKEN',
  'EXPO_PUBLIC_E2E_REFRESH_TOKEN',
  'EXPO_PUBLIC_E2E_ALLOWED_HOSTS',
  'EXPO_PUBLIC_E2E_ALLOW_ANY_HOST',
] as const;

type BuildEnvironment = Record<string, string | undefined>;

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/**
 * Reject public E2E configuration during any store/release config resolution.
 *
 * `EXPO_PUBLIC_*` values are embedded in the JavaScript bundle, so merely
 * disabling the bypass at runtime does not prevent fixture tokens from being
 * shipped. A local Xcode/Gradle release archive does not set `EAS_BUILD`; its
 * `NODE_ENV=production` is therefore part of the release discriminator.
 */
export function assertNoE2ePublicVariablesInReleaseBuild(environment: BuildEnvironment): void {
  const sentryEnvironment = environment.EXPO_PUBLIC_SENTRY_ENVIRONMENT?.trim().toLowerCase();
  const isReleaseBuild =
    environment.EAS_BUILD === 'true' ||
    environment.NODE_ENV?.trim().toLowerCase() === 'production' ||
    sentryEnvironment === 'production';

  if (!isReleaseBuild) return;

  const configuredVariables = E2E_PUBLIC_VARIABLES.filter((key) => {
    const value = environment[key];
    return key === 'EXPO_PUBLIC_E2E_AUTH' ? isTruthyEnv(value) : Boolean(value?.trim());
  });

  if (configuredVariables.length === 0) return;

  throw new Error(
    `Refusing to resolve app config for a release build with ${configuredVariables.join(', ')} set. ` +
      'EXPO_PUBLIC_E2E_* values, including fixture tokens, are embedded in the JavaScript bundle. ' +
      'Unset them for store/release builds or use the dedicated e2e profile.',
  );
}
