# Distribution tasks — Index

Outstanding and completed work to ship Coach Watts to App Store (then Play). Detail lives in [tasks/](./tasks/) as `{id}-{slug}.md`.

**Status:** `open` → `in-progress` → `blocked` → `done`. Update the row and the task file together. Chronology of progress: [log.md](./log.md).

Hub: [../distribution.md](../distribution.md).

## Apple / App Store Connect

| ID | Task | Area | Priority | Status |
|----|------|------|----------|--------|
| [001](./tasks/001-apple-developer-account.md) | Apple ID + Developer Program enrollment (Watt Mind Kft. Org) | account | high | done |
| [002](./tasks/002-app-store-connect-app.md) | Create ASC app record for `com.coachwatts.app` | listing | high | done |
| [003](./tasks/003-privacy-and-compliance.md) | App Privacy labels, export compliance, age rating | listing | high | done |
| [004](./tasks/004-listing-metadata-assets.md) | Listing text done; marketing iPhone screenshots (9/10) | listing | high | in-progress |
| [005](./tasks/005-eas-credentials-and-secrets.md) | iOS signing + production env (local Mac; not EAS) | build | high | open |
| [006](./tasks/006-ios-production-build.md) | Local Xcode Archive → TestFlight upload | build | high | done |
| [007](./tasks/007-testflight-smoke.md) | TestFlight smoke on release binary | qa | high | done |
| [008](./tasks/008-reviewer-demo-account.md) | ASC SIWA notes + Play Google demo Gmail | review | high | in-progress |
| [009](./tasks/009-submit-for-review.md) | Submit build for App Review | review | high | done |

## In-repo store readiness (cross-check)

These are maintained in [store-checklist.md](../store-checklist.md) / [store-privacy-checklist.md](../store-privacy-checklist.md); listed here so distribution work doesn’t miss them.

| Item | Status |
|------|--------|
| Brand icon + splash assets in repo | done |
| Privacy questionnaire copy in repo | done |
| In-app privacy / terms / support + delete account | done |
| Phone-only (`supportsTablet: false`) | done |
| Device-verify splash/icon on release build | open |
| Paste privacy strings into ASC | done (→ task 003) |
| `EXPO_PUBLIC_SENTRY_DSN` on preview/production EAS + local `.env` | EAS done; confirm local release `.env` for Xcode Archive (→ task 005) |
| iOS release path = local Xcode (not EAS cloud) | decided 2026-07-22 (→ tasks 005–006) |
| Android release path = local Gradle (not EAS cloud) | decided 2026-07-22 (→ tasks 014–015) |

## Google Play

Can start account verification **while Apple is reviewing**. Shipping priority remains iOS-first unless product flips it.

| ID | Task | Area | Priority | Status |
|----|------|------|----------|--------|
| [010](./tasks/010-google-play-developer-account.md) | Play Console Organization (Watt Mind Kft.) | account | medium | done |
| [011](./tasks/011-play-console-app.md) | Create Play app `com.coachwatts.app` | listing | medium | done |
| [012](./tasks/012-play-data-safety-and-content.md) | Data safety, content rating, policies | listing | medium | done |
| [013](./tasks/013-play-listing-assets.md) | Play listing pack: copy, icon, feature graphic, screenshots | listing | medium | done |
| [014](./tasks/014-eas-android-credentials.md) | Android upload keystore + production env (local; not EAS) | build | medium | in-progress |
| [015](./tasks/015-android-production-build.md) | Local Gradle AAB → Play Internal testing | build | medium | done |
| [016](./tasks/016-play-internal-test-smoke.md) | Internal test smoke on release AAB | qa | medium | done |
| [017](./tasks/017-play-production-submit.md) | Promote to production / Play review | review | medium | in-progress |

## Store subscriptions / RevenueCat

These tasks add hosted Supporter/Pro acquisition after (or independently from) the free store candidate. Do not mark the original free-app submission blocked solely because subscription work is open.

| ID | Task | Area | Priority | Status |
|----|------|------|----------|--------|
| [018](./tasks/018-revenuecat-project.md) | RevenueCat project ownership, plan, stores, restore policy | account | high | in-progress |
| [019](./tasks/019-paid-agreements-and-products.md) | Paid agreements, merchant profile, pricing, Apple/Google products | commerce | high | open |
| [020](./tasks/020-subscription-backend.md) | Provider-neutral backend, RevenueCat lifecycle, Stripe reconciliation | backend | high | in-progress |
| [021](./tasks/021-native-subscription-experience.md) | Expo RevenueCat SDK + hosted purchase/restore/manage UI | app | high | in-progress |
| [022](./tasks/022-subscription-store-test-review.md) | Sandbox/TestFlight/Internal lifecycle QA + IAP review marketing | review | high | open |

## Store page polish (optional)

Not blocking free-candidate submit. Do after [004](./tasks/004-listing-metadata-assets.md) / [013](./tasks/013-play-listing-assets.md).

| ID | Task | Area | Priority | Status |
|----|------|------|----------|--------|
| [023](./tasks/023-store-page-stellar-polish.md) | Stellar polish: App Previews, ASO, CPPs, Play video, locales | listing | medium | open |

Suggested marketing order: decide screenshot owner → **004** + **013** from the same release binaries → **023** after first submit → subscription review media with **022** (not free-candidate).

## Deferred

| Item | Notes |
|------|--------|
| Maestro CI full companion suite | Gate wired: [e2e-smoke.yml](../../.github/workflows/e2e-smoke.yml) runs `validate-flows` on PR + manual `ios-smoke` (`smoke-unauth` / optional `smoke-shell`). Full suite stays local until stable — [e2e.md](../e2e.md). |
| Separate branded binaries per self-hosted customer | [open-questions.md](../open-questions.md) #4 |
| iPad adaptive layouts | Revisit if tablet demand; v1 is phone-only |
