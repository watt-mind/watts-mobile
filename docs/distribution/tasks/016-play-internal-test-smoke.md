# 016 — Play internal test smoke

**Area:** qa · **Priority:** medium · **Status:** done

**Depends on:** [015](./015-android-production-build.md)

## Goal

Prove the release AAB is reviewable on Android (same bar as TestFlight smoke).

How to add yourself / others as Internal testers and use the opt-in link: [../play-internal-testing.md](../play-internal-testing.md).

## Smoke script

1. [ ] Install from Internal testing (opted in via [play-internal-testing.md](../play-internal-testing.md)); cold start → branded splash/icon. *(Release APK on emulator 2026-08-09: branded sign-in + launcher icon — Play-install path still open.)*
2. [ ] Sign in via PKCE against `https://coachwatts.com` (Chrome Custom Tabs / system browser).
3. [x] Today / Log / Coach / More core paths (seeded account — share demo with iOS [008](./008-reviewer-demo-account.md) or create Android-specific if needed). *(Today / Plan / Coach / More on release APK; Log tab not explicitly tapped.)*
4. [ ] Health Connect: deny still usable; grant path prefills sleep/weight only when implemented.
5. [ ] Camera/photos: deny still usable for text chat.
6. [x] More → About: privacy / terms / support; Settings → Delete account / Export open web Danger Zone. *(About privacy/terms visible; Delete/Export not exercised.)*
7. [ ] Offline: friendly copy, not raw network errors only.
8. [ ] Optional: `adb` deep link `https://coachwatts.com/go/…` once assetlinks fingerprints are live.

## Done when

- No known store-blocker on the AAB you will promote toward production.

**Closed 2026-08-09:** Human Internal testers passed smoke (user sign-off); emulator release APK smoke logged earlier same day.
