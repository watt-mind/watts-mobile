# 017 — Promote to Play production / review

**Area:** review · **Priority:** medium · **Status:** in-progress (submitted — awaiting Google review)

**Depends on:** [012](./012-play-data-safety-and-content.md), [013](./013-play-listing-assets.md), [016](./016-play-internal-test-smoke.md)

## Goal

Send the tested AAB through closed/open testing as needed, then production review.

## Steps

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
