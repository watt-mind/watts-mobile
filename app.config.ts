import { readFileSync } from 'node:fs';

import type { ConfigContext, ExpoConfig } from 'expo/config';

import { assertNoE2ePublicVariablesInReleaseBuild } from './src/config/e2eBuildGuard';

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

  assertNoE2ePublicVariablesInReleaseBuild(process.env);

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

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function readPackageVersion(): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version?: string };
    const version = pkg.version?.trim();
    return version || undefined;
  } catch {
    return undefined;
  }
}

function pluginName(entry: NonNullable<ExpoConfig['plugins']>[number]): string | null {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry) && typeof entry[0] === 'string') return entry[0];
  return null;
}
