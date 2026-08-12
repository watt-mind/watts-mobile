# 015 — Android production AAB + upload (local Gradle)

**Area:** build · **Priority:** medium · **Status:** done

**Depends on:** [011](./011-play-console-app.md), [014](./014-eas-android-credentials.md)

## Preference

Build the Play AAB **locally** (script wraps prebuild + `bundleRelease`), then upload to **Internal testing** via Play API or Console. Do **not** use `eas build -p android` / `eas submit -p android` for the Internal / production path.

Tester lists, opt-in links, and license testers: [../play-internal-testing.md](../play-internal-testing.md).  
Sideload GitHub APKs: prefer `pnpm release:android:github -- --local` over cloud EAS.

## Goal

Produce a signed Play AAB and land it on Internal testing so listed testers can install from Play.

## Steps

1. [x] Bump user-facing version if needed (`pnpm release:patch` / etc.) — **0.1.1** unchanged.
2. [x] Bump Android **versionCode** for every new Play upload (Play rejects reuse). Log in [log.md](../log.md) — **vc6** (2026-08-09).
3. [x] Confirm production `.env` (Sentry + Maps; no `EXPO_PUBLIC_E2E_*`) — [014](./014-eas-android-credentials.md).
4. [x] Preferred one-shot (Mac / Mini):
   ```bash
   pnpm release:android:internal -- --version-code <n> --upload-internal
   ```
   Or build only, then Console upload / `--upload-internal --aab …`. Manual Gradle path still OK: `expo prebuild -p android --clean` → `./gradlew bundleRelease` — signing via [014](./014-eas-android-credentials.md).
5. [ ] Ensure Internal **testers** exist and have the opt-in link — [../play-internal-testing.md](../play-internal-testing.md).
6. [x] Log `versionName` + `versionCode` in [log.md](../log.md).
7. [ ] Smoke on device — [016](./016-play-internal-test-smoke.md); branded icon/splash ([../../store-checklist.md](../../store-checklist.md)) — release APK smoke on emulator 2026-08-09; Play-install smoke still open.

## Done when

- AAB is on Internal testing and installable by at least one opted-in tester.
