# 017 — Promote to Play production / review

**Area:** review · **Priority:** medium · **Status:** done (versionCode 7 in Google review)

**Depends on:** [012](./012-play-data-safety-and-content.md), [013](./013-play-listing-assets.md), [016](./016-play-internal-test-smoke.md)

## Goal

Send the tested AAB through closed/open testing as needed, then production review.

## Steps

### Auth-remediation replacement (2026-08-29)

1. [x] Build and roll out **0.1.1 / versionCode 7** to Play Internal.
2. [~] Complete [016](./016-play-internal-test-smoke.md) versionCode 7 login/logout/account-switch matrix on a physical Play-installed build. **Exception accepted 2026-08-29:** no physical device was available; product owner authorized promotion using the matching signed release APK emulator smoke and automated auth coverage.
3. [x] Production → create/update release → **Add from library** → select versionCode **7**.
4. [x] Preview, save, and send the versionCode 7 production change for Google review: **100% rollout**, **177 countries / regions**, managed publishing off.
5. [x] Record the resulting **Changes in review** state in [log.md](../log.md).

### Previous versionCode 6 submission

1. [x] Internal **0.1.1 (6)** on Play Internal; skip Closed/Open → **Production** direct (first public release).
2. [x] App content checklist green (012); store listing saved with graphics (013).
3. [x] **Sign in details** ([008](./008-reviewer-demo-account.md)): Google demo email + password + OAuth PKCE notes (verified 2026-08-09).
4. [x] Production → **Countries / regions** → **176 countries** added.
5. [x] Production draft release → **Add from library** → versionCode **6** (`6 (0.1.1)`).
6. [x] **Preview and confirm** → **Save** → Publishing overview → **Send 11 changes for review** (2026-08-09).
7. [ ] After approval: confirm live on Play + log outcome; copy Play **App signing** SHA-256 → coach-wattz `assetlinks.json` ([014](./014-eas-android-credentials.md) step 2).
5. [ ] Prepend outcome to [log.md](../log.md) (In review / Approved / Rejected + reason).
6. [ ] After first production signing: confirm [../../deep-links.md](../../deep-links.md) assetlinks includes Play **App signing** cert SHA-256.

## Done when

- App is live (or at least **Pending publication** / **In review**) and the outcome is logged.
