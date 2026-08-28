# 007 — TestFlight smoke

**Area:** qa · **Priority:** high · **Status:** in progress (replacement build required)

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

## App Review authentication matrix

Run every required row against the **exact uploaded TestFlight candidate**, not a simulator-only Release build. Record device, OS, provider, and result in the distribution log.

| Journey | iPhone | iPad phone compatibility | Required result |
|---------|--------|--------------------------|-----------------|
| Clean install → Continue | [ ] | [ ] | System consent → hosted provider page |
| Cancel iOS auth consent | [ ] | [ ] | Quiet return; no red failure |
| Cancel hosted login | [ ] | [ ] | OAuth return to app; no red failure |
| Google seeded review account | [ ] | [ ] | Automatic callback → representative content |
| Apple new account | [ ] | [ ] | Callback → activation path |
| Apple returning account | [ ] | [ ] | Same athlete restored |
| Apple Hide My Email | [ ] | [ ] | Relay identity can return later |
| Provider callback failure | [ ] | [ ] | Safe retry / alternate provider / return actions |
| Offline before Continue | [ ] | [ ] | Actionable reachability copy and retry |
| Network loss after token exchange | [ ] | [ ] | Retry resumes account verification |
| Sign out → relaunch | [ ] | [ ] | Remains signed out; instance retained |
| Account A → sign out → account B | [ ] | [ ] | No A data, queue, push, or Health identity appears |

Before marking the matrix complete:

- [ ] Inspect the archived JS bundle and confirm no `EXPO_PUBLIC_E2E_*` login bypass or fixture token is embedded.
- [ ] Confirm release Sentry receives one sanitized staged test failure with no email, callback URL, OAuth state, code, verifier, access token, or refresh token.
- [ ] Confirm normal cancellation creates no Sentry error event.

## Done when

- Every matrix row passes on the exact uploaded binary; failures are logged as issues or fixed; no known store-blocker remains.
