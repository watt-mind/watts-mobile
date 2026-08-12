# 006 — iOS production build + upload (local Xcode)

**Area:** build · **Priority:** high · **Status:** done

**Depends on:** [002](./002-app-store-connect-app.md), [005](./005-eas-credentials-and-secrets.md)

## Preference

Build and upload **on a Mac**: `expo prebuild` → Xcode **Archive** → App Store Connect (Organizer or Transporter). Do **not** use `eas build -p ios` / `eas submit -p ios` for the TestFlight / App Store path.

`ios/` is gitignored — regenerate with prebuild before each release archive when native config changed (or after a clean).

## Goal

Produce a signed App Store IPA and get it into App Store Connect / TestFlight.

## Steps

1. [x] Bump user-facing version if needed — **0.1.1** matches ASC.
2. [x] Bump iOS **build number** — **4** (`app.json`); logged in [log.md](../log.md).
3. [x] Confirm production `.env` (parked `.env.local` e2e flags) — see [005](./005-eas-credentials-and-secrets.md).
4. [x] `npx expo prebuild -p ios --clean`
5. [x] Archive: `xcodebuild -workspace ios/CoachWatts.xcworkspace -scheme CoachWatts -configuration Release -destination generic/platform=iOS -archivePath dist/ios/CoachWatts-0.1.1-4.xcarchive archive DEVELOPMENT_TEAM=42K8S6866N`
6. [x] Upload: `xcodebuild -exportArchive` with `dist/ios/ExportOptions-upload.plist` (`destination=upload`) — **Upload succeeded** 2026-08-09.
7. [x] ASC processing complete — **0.1.1 (4)** **Ready to Submit** in TestFlight (internal **WM**).
8. [x] Log version + build in [log.md](../log.md).

## Verify after binary lands

- [x] Cold start: Coach Watts splash (not Expo chevron) — [../../store-checklist.md](../../store-checklist.md) (release sim smoke 2026-08-09)
- [ ] Home screen icon branded (physical device / TestFlight install)

## Done when

- A production build is available in TestFlight for internal testers.
