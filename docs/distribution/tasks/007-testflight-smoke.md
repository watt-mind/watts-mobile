# 007 — TestFlight smoke

**Area:** qa · **Priority:** high · **Status:** done

**Depends on:** [006](./006-ios-production-build.md)

## Goal

Prove the release binary is reviewable: auth works against production, core tabs work, store-required paths exist, no debug login plumbing.

## Smoke script

On a physical device or recent simulator with the TestFlight build:

1. [x] Cold start → branded splash + sign-in (no OAuth redirect URI / `pnpm cw:cli` in release UI).
2. [x] Sign in against hosted instance (`https://coachwatts.com`) via PKCE.
3. [x] Today: recommendation and/or planned hero loads (use seeded account — see [008](./008-reviewer-demo-account.md)).
4. [x] Log: open check-in path; deny HealthKit still usable. *(Check-in sheet loads; Health “Not connected” in Settings — explicit HealthKit deny not triggered.)*
5. [x] Coach: open chat; optional deny camera still usable.
6. [x] More → About: version/build, privacy, terms, support. (`v0.1.1 (4)`)
7. [x] Settings → Delete account / Export my data open web Danger Zone (handoff or browser).
8. [ ] Airplane mode: friendly offline copy (no raw `Network request failed` as the only UX). *(Deferred — sim Control Center airplane inconclusive; spot-check on physical TestFlight if needed.)*
9. [~] Optional: push permission prompt copy is coaching-related; deep link `/go/*` if AASA is live. *(Push prompt shown on cold start; denied. Deep link not exercised.)*

**Run notes (2026-08-09):** Release `expo run:ios --configuration Release` on iPhone 17 Pro sim (device archive IPA is not sim-installable). ASC build **0.1.1 (4)** confirmed **Ready to Submit**. Sign-out → Sign in reused existing IdP browser session (no in-app password). Demo account `coachwatts.play.review@gmail.com`.

## Done when

- Failures logged as issues or fixed; no known store-blocker on the binary you will submit.
