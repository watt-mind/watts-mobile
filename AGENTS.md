# Agent Guidelines — Coach Watts Mobile

This repository is the **native iOS/Android activation companion** for [Coach Watts](https://coachwatts.com).

Web stays the control room (deep plan adapt, analytics, teams, nutrition planning, and billing administration). Native mobile may acquire/restore a hosted Supporter or Pro subscription through Apple/Google via RevenueCat; invoices, payment methods, tax documents, refunds, and provider administration stay web/store-managed.
This app **activates new athletes on device** (consent → goal → plan lite → insight → connect data last), then runs the daily field loop: today, check-in, coach, push — not a full web port.

## Issue tracking (Linear)

Team **`CW`**, projects **`Mobile App`** / **`App Store Distribution`**. Live task state is in Linear — `docs/issues.md` is archive/specs only.

**Read** `~/Develop/coach-wattz/docs/04-guides/issue-management.md` before picking up a ticket (CW-scoped guide). Multi-team SoT is private (`~/Develop/hdkiller/docs/orgs/linear.md`); do not import WM/OPS/CLNT content into this public repo. Follow-ups discovered mid-work → file a `CW` Linear issue in `Triage`. PR body: `Fixes CW-XX`.

## Source of truth

| Doc | Role |
|-----|------|
| [docs/product-baseline.md](docs/product-baseline.md) | Product positioning (activation companion), shipped loop, activation chapter, IA, non-goals |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Delivery phases and checklist for this repo |
| [docs/open-questions.md](docs/open-questions.md) | Decisions to resolve before/during Phase 0–1 |
| [docs/oauth-setup.md](docs/oauth-setup.md) | Public OAuth client + redirect URI registration |
| [docs/e2e.md](docs/e2e.md) | Maestro runbook **and** day-to-day e2e conventions (testIDs, when to update flows, PR checklist) |
| [docs/deep-links.md](docs/deep-links.md) | Scheme / universal link path map + host association |
| [docs/native-modules.md](docs/native-modules.md) | When adding Expo native deps: rebuild the dev client |
| [docs/distribution.md](docs/distribution.md) | App Store / Play hub, release-it versioning, GitHub Android APK → `docs/distribution/` tasks + log |
| [docs/distribution/play-internal-testing.md](docs/distribution/play-internal-testing.md) | Play Internal track: upload script, add testers, opt-in link, license testers |
| [docs/store-checklist.md](docs/store-checklist.md) | Brand chrome, About links, Sentry env for store builds |
| [docs/store-privacy-checklist.md](docs/store-privacy-checklist.md) | App Privacy / Data safety questionnaire copy |
| coach-wattz `docs/06-plans/mobile-companion-app.md` | Full living baseline (PR [#239](https://github.com/hdkiller/coach/pull/239); merge pending) |
| OpenSpec archive `2026-07-19-phase-0/1/2/3/4-*` | Auth → Today → Log → push → chat → activity → deep links → store → profile → nutrition (done) |

When the coach-wattz PR merges, prefer that file for product/API narrative and keep this repo’s docs focused on **implementation**.

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | **Expo (React Native) + TypeScript** + **`expo-dev-client`** (not Expo Go for day-to-day) |
| Navigation | **Expo Router** |
| UI | React Native + **NativeWind** (or adapted design tokens) |
| Server state | **TanStack Query** |
| Auth storage | **expo-secure-store** |
| Local cache | **`@react-native-async-storage/async-storage`** behind `@tanstack/query-async-storage-persister` (`src/query/persist.ts`) — MMKV and SQLite are **not** used |
| Push | **Expo Notifications** → APNs / FCM |
| Observability | **Sentry React Native** |

Auth: OAuth 2.0 **Authorization Code + PKCE (S256)** via system browser / `expo-auth-session`. Bearer tokens only — not web cookie sessions.

Do **not** use Capacitor wrapping Nuxt for v1. Prefer Expo over Flutter / separate native stacks unless product decides otherwise.

## Related repositories

| Repo | Path | Role |
|------|------|------|
| **coach-wattz** | `~/Develop/coach-wattz` | Production web + API + OAuth IdP |
| **watts-marketing** | `~/Develop/watts-marketing` | Brand / outreach knowledge |

API base (hosted): `https://coachwatts.com/api/`  
Local coach-wattz (workspace default): `http://localhost:3099/api/`

## Product summary

**Shipped loop:** Today (recommendation + planned), Log (wellness + recovery + nutrition quick-log), session detail, recent/upcoming, Coach chat, notifications, athlete metrics, Settings (Health Sync, etc.), account glue.

**Next — activation onboarding:** mobile-only sign-up + consent, goal lite, plan lite wizard, first insight, connect-last (Health Sync primary; OAuth apps optional/skip). Fully activated = data → goal → plan → insight.

**Out:** Plan templates / share / Intervals publish, analytics/explorer, coaching teams, library editing, full billing administration, admin, full Profile Settings / zones (Nutrition settings and Sports thresholds lite are in scope). **In:** standing Plan tab (training generator + adapt/replan + structure + nutrition plan/grocery) — OpenSpec train `plan-tab-shell`…`nutrition-plan-on-plan-tab`. Narrow hosted store subscription purchase/status/restore/manage is tracked by OpenSpec `store-subscriptions-revenuecat`.

IA: bottom tabs **Today · Plan · Log · Coach · More** (+ activation wizard stacks). See [docs/product-baseline.md](docs/product-baseline.md).

## Working rules

1. Treat **coach-wattz** as source of truth for API contracts, scopes, and product behavior. Do not invent endpoints or scope names.
2. Keep business logic on the server. Mobile is presentation, caching, and optimistic UI.
3. Prefer a thin companion aggregate (`GET /api/mobile/today` or documented composition) over cold-start fan-out.
4. Self-hosted instance URL is first-class (validate reachability before OAuth).
5. Secrets stay out of git (tokens, client secrets, `.env`). RevenueCat: public SDK keys may use `EXPO_PUBLIC_REVENUECAT_*`; V2 secret `REVENUECAT_API_V2_SECRET_KEY` is local MCP/API tooling only (see [docs/distribution/tasks/018-revenuecat-project.md](docs/distribution/tasks/018-revenuecat-project.md)) — never ship in the app bundle; production webhook secrets stay in coach-wattz.
6. Follow [BRANDING.md](../coach-wattz/BRANDING.md) in coach-wattz — companion is Coach Watts, not a generic fitness shell.
7. Update [docs/open-questions.md](docs/open-questions.md) when a decision lands.
8. After adding/upgrading a **native** Expo module or changing its `app.json` plugin, **rebuild the binary** (`pnpm ios` / `pnpm android` or EAS). Metro alone will not link it — see [docs/native-modules.md](docs/native-modules.md). Symptom: `Cannot find native module '…'`.
9. Store / distribution progress: update [docs/distribution/tasks.md](docs/distribution/tasks.md) (and the matching task file) when status changes; **prepend** a dated entry to [docs/distribution/log.md](docs/distribution/log.md) for enrollments, TestFlight builds, submissions, and review outcomes. Never commit Apple passwords, review demo passwords, or real Sentry DSNs — see [docs/distribution.md](docs/distribution.md).
10. **Store / TestFlight / Play binaries are local** — iOS: `expo prebuild` → Xcode Archive → Organizer/Transporter; Android: `expo prebuild` → Gradle `bundleRelease` → Play Console. Do not default to `eas build` / `eas submit`. Details: [docs/distribution.md](docs/distribution.md), tasks [005](docs/distribution/tasks/005-eas-credentials-and-secrets.md)–[006](docs/distribution/tasks/006-ios-production-build.md), [014](docs/distribution/tasks/014-eas-android-credentials.md)–[015](docs/distribution/tasks/015-android-production-build.md).
11. **Maestro with the feature** — if you change a companion surface the suite already covers (or add a daily-loop entry point), update `testID`s / `maestro/` flows in the same change. Conventions and PR checklist: [docs/e2e.md](docs/e2e.md) § Maintaining e2e. Vitest for mappers; never enable `EXPO_PUBLIC_E2E_*` on store builds.
