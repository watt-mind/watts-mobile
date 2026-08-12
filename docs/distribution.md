# App Store / Play distribution

Hub for shipping Coach Watts to **App Store** and **Play Console**, including the free store candidate and the later hosted Supporter/Pro subscription rollout through RevenueCat. Product chrome and privacy copy live in the store checklists; this tree tracks **who owns what**, **outstanding work**, and a durable **progress log**.

## Identifiers

| Item | Value |
|------|--------|
| iOS bundle id | `com.coachwatts.app` |
| Android package | `com.coachwatts.app` |
| Widget extension | `com.coachwatts.app.todaywidget` (must be prefixed with parent `com.coachwatts.app`; `.widgets` unavailable on Watt Mind) |
| App Group | `group.com.wattmind.coachwatts` (Watt Mind team; old `group.com.coachwatts.app` unavailable — likely held by personal/free team) |
| Apple Team ID | `42K8S6866N` (Watt Mind Kft.) |
| Expo slug / EAS project | `coach-watts-app` / `3fad7b8c-dc45-4616-8d77-d48f44d161b2` |
| Expo owner | `hdkillers-team` |
| Hosted instance | `https://coachwatts.com` |
| Production OAuth client | `1c2dbf4d-51b8-4902-85e6-e4f2f48c70d9` |
| OAuth redirect | `coachwatts://oauth/callback` |
| Privacy / terms | `https://coachwatts.com/privacy` · `https://coachwatts.com/terms` |
| Support | `mailto:support@coachwatts.com` |
| Play Console developer ID | `7883910200930974301` |
| Play app ID | `4976128188579826786` (Coach Watts) |
| RevenueCat | Project `12d4d797`; App Store `app17fce11c8d` + Play `app95807dc9bd`; Apple/Google catalogs mapped to `supporter`/`pro`; local V2/MCP + Android SDK key in `.env` — Play service account, ownership/plan/Stripe still [018](./distribution/tasks/018-revenuecat-project.md) |

## Doc map

| Doc | Role |
|-----|------|
| **This file** | Overview, identifiers, **local iOS/Android build preference**, green-light summary, maintenance rules |
| [distribution/tasks.md](./distribution/tasks.md) | Outstanding / done task index |
| [distribution/tasks/](./distribution/tasks/) | Per-task detail (status, steps, blockers) |
| [distribution/log.md](./distribution/log.md) | Append-only history of decisions and progress |
| [distribution/play-console-signup.md](./distribution/play-console-signup.md) | Step-by-step Google Play Organization signup |
| [distribution/play-internal-testing.md](./distribution/play-internal-testing.md) | Play Internal track: build/upload, **add testers**, opt-in link, license testers |
| [store-checklist.md](./store-checklist.md) | Brand chrome, About links, Sentry env |
| [store-privacy-checklist.md](./store-privacy-checklist.md) | App Privacy / Data safety paste-ready copy |
| [oauth-setup.md](./oauth-setup.md) | Official Mobile App client + redirects |
| [e2e.md](./e2e.md) | Maestro suite + CI smoke gate; never enable e2e auth on store / preview EAS profiles |
| [native-modules.md](./native-modules.md) | Rebuild after native / plugin changes; Android `minSdk` 26 |
| [deep-links.md](./deep-links.md) | AASA / associated domains for review |
| [../openspec/changes/store-subscriptions-revenuecat/](../openspec/changes/store-subscriptions-revenuecat/) | Native store subscription proposal/design/specs/tasks |
| [../.release-it.json](../.release-it.json) | release-it: bump, CHANGELOG, git tag, GitHub Release notes |

## Enrollment (Watt Mind Kft.)

Same legal entity for **both** stores. Account enrollments are independent and can run in parallel.

### Apple (iOS)

| Field | Value |
|-------|--------|
| Program | Apple Developer Program — **Organization** |
| Account Holder | `deploy@watt-mind.com` |
| Team ID | `42K8S6866N` |
| Personal day-to-day | `hdkiller@gmail.com` (Admin; invitation accepted) |
| Bundle ID | `com.coachwatts.app` |
| ASC Apple ID | `6793247809` |
| SKU | `coach-watts-app` |
| Status | [001](./distribution/tasks/001-apple-developer-account.md)–[003](./distribution/tasks/003-privacy-and-compliance.md) done; [004](./distribution/tasks/004-listing-metadata-assets.md) listing **text** done — **marketing screenshots** still open; next eng: [005](./distribution/tasks/005-eas-credentials-and-secrets.md) → **local Xcode Archive** ([006](./distribution/tasks/006-ios-production-build.md)) → TestFlight |
| iOS build path | **Local Mac / Xcode** (preferred). Not EAS cloud for TestFlight / App Store. |

### Google Play (Android)

| Field | Value |
|-------|--------|
| Account | Play Console — **Organization** (Watt Mind Kft.) |
| Developer ID | `7883910200930974301` |
| Console | [App list](https://play.google.com/console/u/1/developers/7883910200930974301/app-list) |
| Admin identity | Prefer Workspace / Google account on `watt-mind.com` (e.g. `deploy@` or Play-specific admin) |
| Personal day-to-day | Invite personal Gmail/Workspace user as admin if not already |
| Status | App **created** (Draft). [010](./distribution/tasks/010-google-play-developer-account.md)–[011](./distribution/tasks/011-play-console-app.md) done. Next: finish App content → [012](./distribution/tasks/012-play-data-safety-and-content.md) + listing → [013](./distribution/tasks/013-play-listing-assets.md); eng build: [014](./distribution/tasks/014-eas-android-credentials.md) → **local Gradle AAB** ([015](./distribution/tasks/015-android-production-build.md)) |
| Package | `com.coachwatts.app` |
| Play app ID | `4976128188579826786` |
| Dashboard | [Coach Watts](https://play.google.com/console/u/0/developers/7883910200930974301/app/4976128188579826786/app-dashboard) |
| Android build path | **Local Gradle** (preferred). Not EAS cloud for Play Internal / production. |
| Internal testers | Email list + opt-in link — [play-internal-testing.md](./distribution/play-internal-testing.md) |

## Sequencing

| Track | Priority | Why |
|-------|----------|-----|
| **iOS / App Store** | First store candidate | Membership paid for Org Account Holder; TestFlight path 002–009 via **local Xcode Archive** (not EAS) |
| **Android / Play** | Parallel account setup OK; ship after or alongside iOS | Tasks 010–017 via **local Gradle AAB** (not EAS); internal testing can start before iOS is approved |
| **Hosted subscriptions** | After or independent of free candidate | Tasks 018–022; requires both store catalogs, backend authority, native SDK, and lifecycle QA |

### Build preference

| Platform | Preferred release binary path |
|----------|-------------------------------|
| **iOS** | Mac: `expo prebuild -p ios` → Xcode **Archive** → Organizer / Transporter → ASC / TestFlight ([005](./distribution/tasks/005-eas-credentials-and-secrets.md), [006](./distribution/tasks/006-ios-production-build.md)) |
| **Android** | `expo prebuild -p android` → upload-keystore signing → `./gradlew bundleRelease` → Play Console ([014](./distribution/tasks/014-eas-android-credentials.md), [015](./distribution/tasks/015-android-production-build.md)) |

Do **not** treat `eas build` / `eas submit` as the default shipping path on either platform. EAS profiles remain optional (CI/fallback, GitHub sideload helper).

Shared work (do once): production OAuth (+ hosted SIWA), privacy copy, Sentry DSN + Android Maps keys in local `.env`, upload keystore in password manager, branded assets, delete-account path.  
App Review sign-in: prefer **Sign in with Apple**; TestFlight Beta / Play / testers use Google demo `coachwatts.play.review@gmail.com` (password in ASC + Play Console + password manager, not git) — [008](./distribution/tasks/008-reviewer-demo-account.md).  
**Marketing:** Apple screenshots [004](./distribution/tasks/004-listing-metadata-assets.md) · Play listing pack [013](./distribution/tasks/013-play-listing-assets.md) · optional stellar polish [023](./distribution/tasks/023-store-page-stellar-polish.md). Capture runbook + PNG masters: `~/Develop/watts-marketing/screenshots/mobile-app/README.md`.

## Hosted subscriptions (RevenueCat)

RevenueCat is the selected Apple/Google subscription integration. Coach Watts server entitlements remain authoritative, existing Stripe subscribers keep mobile access, and Watt Mind store acquisition is available only for the canonical hosted `https://coachwatts.com` instance.

| Workstream | Task | Status |
|------------|------|--------|
| RevenueCat ownership, plan, restore policy, store connections | [018](./distribution/tasks/018-revenuecat-project.md) | in-progress (Apple + Play apps/catalog mapped; Play service account, Stripe, ownership/plan open) |
| Apple Paid Apps Agreement/tax/banking; Google merchant profile; prices/products | [019](./distribution/tasks/019-paid-agreements-and-products.md) | in-progress (ASC bank/legal screening **cleared 2026-08-09**; Play bank verify + 15% enrolled; draft catalogs) |
| `coach-wattz` provider-neutral persistence, lifecycle, Stripe backfill, Bearer reconcile | [020](./distribution/tasks/020-subscription-backend.md) | in-progress |
| Expo RevenueCat SDK + hosted purchase/restore/status/manage UI | [021](./distribution/tasks/021-native-subscription-experience.md) | in-progress |
| Sandbox/TestFlight/Internal lifecycle matrix + IAP review | [022](./distribution/tasks/022-subscription-store-test-review.md) | open |

The original free-app submission may proceed while these are open. Do not expose a production paywall until all five workstreams are ready.

## Version releases (release-it)

Same stack as coach-wattz (`release-it` + conventional-changelog), without the web changelog CLI hooks.

| Kind | Source of truth |
|------|-----------------|
| User-facing (`0.1.0`) | `package.json` → synced to `app.json` / Expo `version` via `scripts/sync-expo-version.mjs` |
| iOS build # (`CFBundleVersion` / `ios.buildNumber`) | **Manual** per local Archive — bump `expo.ios.buildNumber` in `app.json` before prebuild, or Current Project Version in Xcode; log each upload in [distribution/log.md](./distribution/log.md) |
| Android build # (`versionCode`) | **Manual** per local AAB — bump `expo.android.versionCode` in `app.json` before prebuild, or Gradle `versionCode`; log each upload in [distribution/log.md](./distribution/log.md) |

```bash
# Clean working tree required
pnpm release:patch          # or release:minor / release:major / release
# → bump, CHANGELOG.md, commit, tag vX.Y.Z, GitHub Release notes

# Sideload APK for GitHub (not Play). Prefer local / explicit APK over cloud EAS:
pnpm release:android:github -- --local   # build APK on this machine
pnpm release:android:github -- --apk path/to/app.apk
pnpm release:android:github -- --dry-run
# Avoid default cloud EAS unless intentionally using CI/fallback

# Play Internal testing AAB (local Gradle):
pnpm release:android:internal -- --version-code <n>
pnpm release:android:internal -- --version-code <n> --upload-internal
pnpm release:android:internal -- --upload-internal --aab dist/android-internal/foo.aab
# Needs credentials/android/play-service-account.json (Play “Release apps to testing tracks”)
# Testers / opt-in link: [play-internal-testing.md](./distribution/play-internal-testing.md)
```

| EAS profile | Use |
|-------------|-----|
| `development` | Optional cloud/dev-client path (day-to-day is local `pnpm ios` / `pnpm android`) |
| `preview` | Optional GitHub sideload APK helper only — prefer `--local` / `--apk` |
| `production` | **Not** the default store path — iOS = Xcode, Android = local Gradle |
| `e2e` | Fixture auth only — never for testers or stores |

Do **not** set `EXPO_PUBLIC_E2E_*` on store / sideload release builds. Android sideload/GitHub builds need API **26+** (`expo-build-properties` in `app.json`).

## Green light — iOS (Submit for Review)

1. Apple Developer Program active + ASC app for `com.coachwatts.app`
2. App Privacy labels + privacy policy URL from [store-privacy-checklist.md](./store-privacy-checklist.md)
3. Hosted IdP **Sign in with Apple** live on `coachwatts.com` (Guideline 4.8)
4. Production local `.env` (`EXPO_PUBLIC_SENTRY_DSN`); no `EXPO_PUBLIC_E2E_*`
5. Local Xcode Archive → upload → TestFlight smoke (incl. SIWA path) — [006](./distribution/tasks/006-ios-production-build.md)
6. **Marketing:** iPhone screenshots uploaded on ASC **0.1.1** ([004](./distribution/tasks/004-listing-metadata-assets.md)); description with **no medical claims**
7. App Review notes + SIWA instructions ([008](./distribution/tasks/008-reviewer-demo-account.md)); empty first-run risk → [issues/056.md](./issues/056.md)
8. Branded splash/icon on release build

## Green light — Play (production)

1. Play Console Organization verified for Watt Mind Kft. + app `com.coachwatts.app`
2. Data safety + content rating + privacy policy URL from [store-privacy-checklist.md](./store-privacy-checklist.md)
3. Production local `.env` (`EXPO_PUBLIC_SENTRY_DSN`, Maps keys); upload keystore in password manager; no `EXPO_PUBLIC_E2E_*`
4. Local Gradle `bundleRelease` → Play Internal testing smoke — [015](./distribution/tasks/015-android-production-build.md)
5. Listing (icon, feature graphic, screenshots, description) — no medical claims
6. Promote to production; after first signing, update [deep-links.md](./deep-links.md) **assetlinks** SHA-256 fingerprints

## Green light — hosted subscriptions

1. RevenueCat project is Watt Mind-owned; plan and restore policy are recorded; Apple/Google/Stripe connections and sandbox/production separation are verified
2. Apple Paid Apps Agreement + tax/banking and Google merchant payments profile are active
3. Supporter/Pro monthly/annual products are localized, priced, mapped once to canonical tiers, and ready/approved in both stores
4. `coach-wattz` verifies/idempotently ingests RevenueCat lifecycle, tracks existing Stripe subscriptions, and exposes canonical Bearer summary/reconciliation
5. Native SDK identifies only authenticated hosted users by Coach Watts UUID; self-hosted purchase/restore is unavailable
6. Purchase, restore, server-confirming, provider manage, duplicate suppression, and overlapping-provider UX pass tests
7. Apple sandbox/TestFlight and Google Internal Testing lifecycle matrices pass; privacy/data-safety and review metadata are updated
8. Production rollout is feature-flagged and rollback hides acquisition without revoking existing subscriber access

Track detail in [distribution/tasks.md](./distribution/tasks.md).

## How to maintain

1. **Tasks** — When work starts or finishes, update the row in `tasks.md` **and** the matching `tasks/{id}-*.md` status together (including subscription tasks 018–022 and listing polish 023).
2. **Log** — When a decision lands, an enrollment completes, a build ships to TestFlight / Play internal, or review feedback arrives, **prepend** a dated entry to [distribution/log.md](./distribution/log.md). Do not rewrite old entries; add a correction note if needed.
3. **Secrets** — Never commit Apple/Google passwords, Android upload keystores, Play service-account JSON, review demo passwords, or real Sentry DSNs. Reference local `.env` / secret *names* and “stored in password manager / Console” only.
4. **Store checklists** — Keep chrome/privacy copy in `store-checklist.md` / `store-privacy-checklist.md`; link from tasks instead of duplicating long tables.

## Related open product questions

- Hosted vs self-hosted distribution binary strategy — [open-questions.md](./open-questions.md) #4
- First-run / reviewer empty-state risk — [issues/056.md](./issues/056.md)
- Phone-only v1 (`supportsTablet: false`) — [issues/055.md](./issues/055.md) (done)
- Store pricing/trials and RevenueCat restore transfer policy — [open-questions.md](./open-questions.md) #31–32
