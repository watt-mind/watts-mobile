/**
 * Production guard for the E2E auth bypass (CW-354).
 *
 * `EXPO_PUBLIC_E2E_AUTH` switches on `applyE2eAuthSeed()` / `applyPendingE2eLogin()`
 * in `src/auth/e2eAuth.ts`, which seed SecureStore tokens and skip system-browser
 * PKCE. Until this module existed the only protection was a documentation
 * convention, so one copy-pasted env var in a release EAS profile would ship a
 * live auth bypass (plus fixture tokens, which land in the JS bundle) to real users.
 *
 * The discriminator is `EXPO_PUBLIC_SENTRY_ENVIRONMENT`, which `eas.json` sets per
 * profile (`development` / `e2e` / `preview` / `production`). A store build cannot
 * satisfy `isDev` or `sentryEnvironment === 'e2e'` while also being a production build.
 *
 * Deliberately pure — no `expo-*` imports — so it runs under the repo's
 * node-environment vitest setup, and it is imported by `src/config/env.ts` at module
 * load. It therefore must never throw: a misconfiguration has to degrade to "bypass
 * off", not to a crash on app start. `app.config.ts` holds the loud, throwing
 * backstop, where failing is safe because it happens at build time.
 */

/** Sentry environment that legitimately runs the e2e auth bypass on a non-dev build. */
const E2E_ENVIRONMENT = 'e2e';

export type ResolveE2eAuthEnabledInput = {
  /** `EXPO_PUBLIC_E2E_AUTH` parsed as a boolean. */
  flagEnabled: boolean;
  /** `__DEV__`, or `NODE_ENV === 'development'`. */
  isDev: boolean;
  /** Resolved `EXPO_PUBLIC_SENTRY_ENVIRONMENT` (`development` / `e2e` / `preview` / `production`). */
  sentryEnvironment: string;
};

/**
 * Returns `true` only when the e2e flag is on **and** the build is a dev build or
 * the dedicated `e2e` EAS profile. Any other environment with the flag on is a
 * misconfiguration: it is reported via `console.error` and resolves to `false`.
 */
export function resolveE2eAuthEnabled({
  flagEnabled,
  isDev,
  sentryEnvironment,
}: ResolveE2eAuthEnabledInput): boolean {
  if (!flagEnabled) return false;

  const environment = sentryEnvironment.trim().toLowerCase();
  if (isDev || environment === E2E_ENVIRONMENT) return true;

  // Loud, but non-fatal: throwing here would run at module load and brick app start,
  // turning a config mistake into a crash-on-launch for every user of that build.
  console.error(
    `[e2eGuard] Refusing to enable the E2E auth bypass: EXPO_PUBLIC_E2E_AUTH is set on a ` +
      `production-like build (EXPO_PUBLIC_SENTRY_ENVIRONMENT="${sentryEnvironment}"). ` +
      `E2E auth and its fixture tokens are disabled. This build profile is misconfigured — ` +
      `only local dev builds and the dedicated "e2e" EAS profile may set EXPO_PUBLIC_E2E_*.`,
  );

  return false;
}
