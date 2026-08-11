import { readFileSync } from 'node:fs';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config. Static chrome lives in `app.json`; env/EAS injects
 * release observability without committing secrets.
 *
 * User-facing `version` is owned by package.json (release-it). Store build
 * numbers (versionCode / buildNumber) are managed remotely by EAS when
 * `cli.appVersionSource` is `remote`.
 *
 * Set `IOS_FREE_TEAM=1` before `expo prebuild` / `expo run:ios` to strip
 * paid Apple capabilities (Push, Associated Domains, HealthKit, App Groups /
 * widgets) so a free Personal Team can install on a physical device.
 * Simulator and paid-team builds should omit the flag (full app).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const extra = (config.extra ?? {}) as Record<string, unknown>;
  const iosFreeTeam = isTruthyEnv(process.env.IOS_FREE_TEAM);
  const packageVersion = readPackageVersion();

  const ios = { ...(config.ios ?? {}) };
  let plugins = [...(config.plugins ?? [])];

  if (iosFreeTeam) {
    delete ios.associatedDomains;

    const entitlements = { ...(ios.entitlements ?? {}) } as Record<string, unknown>;
    delete entitlements['com.apple.developer.healthkit'];
    delete entitlements['com.apple.developer.healthkit.access'];
    delete entitlements['com.apple.developer.healthkit.background-delivery'];
    ios.entitlements = Object.keys(entitlements).length > 0 ? entitlements : undefined;

    plugins = plugins.filter((entry) => {
      const name = pluginName(entry);
      return (
        name !== 'expo-notifications' &&
        name !== 'expo-widgets' &&
        name !== '@kingstinct/react-native-healthkit'
      );
    });
    plugins.push('./plugins/withIosFreeTeamStrip');
  }

  const sentryEnvironment =
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ??
    (process.env.EAS_BUILD === 'true' ? 'production' : 'development');

  assertE2eAuthNotProduction(sentryEnvironment);

  const googleMapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    '';

  const android = {
    ...(config.android ?? {}),
    ...(googleMapsApiKey
      ? {
          config: {
            ...(config.android?.config ?? {}),
            googleMaps: {
              ...(config.android?.config?.googleMaps ?? {}),
              apiKey: googleMapsApiKey,
            },
          },
        }
      : {}),
  };

  return {
    ...config,
    name: config.name ?? 'Coach Watts',
    slug: config.slug ?? 'coach-watts-app',
    version: packageVersion ?? config.version,
    ios,
    android,
    plugins,
    extra: {
      ...extra,
      iosFreeTeam,
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? extra.sentryDsn ?? '',
      sentryEnvironment,
      sentryRelease:
        process.env.EXPO_PUBLIC_SENTRY_RELEASE ?? process.env.EAS_BUILD_ID ?? undefined,
      sentryDist: process.env.EXPO_PUBLIC_SENTRY_DIST ?? process.env.EAS_BUILD_NUMBER ?? undefined,
      /** Mirrored for runtime guards; native MapView still needs a rebuild with the key. */
      googleMapsApiKey,
    },
  } as ExpoConfig;
};

function readPackageVersion(): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version?: string };
    const version = pkg.version?.trim();
    return version || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build-time backstop for the E2E auth bypass (CW-354).
 *
 * `EXPO_PUBLIC_E2E_AUTH` on a production profile would ship a live auth bypass and
 * bundle-embedded fixture tokens to real users. The runtime resolver
 * (`src/config/e2eGuard.ts`) already refuses to honour that combination, but it does
 * so silently-ish, after the binary is built. Throwing here fails config resolution —
 * so `expo prebuild` / `eas build` stops before a misconfigured store build exists.
 *
 * Only `production` throws: `preview` is caught by the runtime resolver, and failing
 * the build on it would be a behaviour change beyond the store-safety goal.
 */
function assertE2eAuthNotProduction(sentryEnvironment: string): void {
  if (!isTruthyEnv(process.env.EXPO_PUBLIC_E2E_AUTH)) return;
  if (sentryEnvironment.trim().toLowerCase() !== 'production') return;

  throw new Error(
    'Refusing to resolve app config: EXPO_PUBLIC_E2E_AUTH is set while ' +
      'EXPO_PUBLIC_SENTRY_ENVIRONMENT resolves to "production". That combination would ship ' +
      'the E2E auth bypass and its fixture tokens in a store build. Unset EXPO_PUBLIC_E2E_* ' +
      'for production builds, or use the dedicated "e2e" EAS profile.',
  );
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function pluginName(entry: NonNullable<ExpoConfig['plugins']>[number]): string | null {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry) && typeof entry[0] === 'string') return entry[0];
  return null;
}
