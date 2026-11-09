# 016 — Play internal test smoke

**Area:** qa · **Priority:** medium · **Status:** in-progress (versionCode 7 auth-remediation retest)

**Depends on:** [015](./015-android-production-build.md)

## Goal

Prove the release AAB is reviewable on Android (same bar as TestFlight smoke).

How to add yourself / others as Internal testers and use the opt-in link: [../play-internal-testing.md](../play-internal-testing.md).

## Smoke script

**Replacement candidate (2026-08-29):** Play Internal has **0.1.1 / versionCode 7**. A matching production-configured signed APK passed clean launch, hosted `prompt=login` account choice, and cancellation on `Pixel_10_Pro_XL`. Before Production promotion, repeat the authentication rows below from the Play-installed build on a physical Android device; the emulator Chrome renderer failed after reopening Custom Tabs and the AVD was not wiped.

1. [ ] Install from Internal testing (opted in via [play-internal-testing.md](../play-internal-testing.md)); cold start → branded splash/icon. *(Release APK on emulator 2026-08-09: branded sign-in + launcher icon — Play-install path still open.)*
2. [ ] Sign in via PKCE against `https://coachwatts.com` (Chrome Custom Tabs / system browser).
3. [x] Today / Log / Coach / More core paths (seeded account — share demo with iOS [008](./008-reviewer-demo-account.md) or create Android-specific if needed). *(Today / Plan / Coach / More on release APK; Log tab not explicitly tapped.)*
4. [ ] Health Connect: deny still usable; grant path prefills sleep/weight only when implemented.
5. [ ] Camera/photos: deny still usable for text chat.
6. [x] More → About: privacy / terms / support; Settings → Delete account / Export open web Danger Zone. *(About privacy/terms visible; Delete/Export not exercised.)*
7. [ ] Offline: friendly copy, not raw network errors only.
8. [ ] Optional: `adb` deep link `https://coachwatts.com/go/…` once assetlinks fingerprints are live.

## VersionCode 7 authentication gate

- [ ] Sign in with the seeded Google review account from a clean Play-installed build.
- [ ] Cancel Chrome Custom Tabs and retry without a false `Sign-in failed` state.
- [ ] Sign out, relaunch, and sign in again.
- [ ] With account A still signed into the hosted browser, verify mobile sign-in presents account choice and completes as account B.
- [ ] Exercise the create-account/provider-new-user path and return to the app.
- [ ] Record physical device model, Android version, Play-installed versionCode, and result in the distribution log.

## Done when

- No known store-blocker on the AAB you will promote toward production.

**Previous candidate closed 2026-08-09:** Human Internal testers passed versionCode 6 smoke (user sign-off); versionCode 7 requires a fresh auth-focused pass.
