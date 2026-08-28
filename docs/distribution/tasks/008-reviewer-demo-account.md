# 008 — Reviewer demo account & notes

**Area:** review · **Priority:** high · **Status:** in progress

**Depends on:** hosted **Sign in with Apple** enabled for Guideline 4.8 ([sign-in-with-apple](../../../openspec/changes/sign-in-with-apple/) / coach-wattz)  
**Related:** [../../issues/056.md](../../issues/056.md) (day-one empty surfaces look broken)

## Goal

- **Apple App Store review:** supply the seeded Google demo in ASC Sign-In Information for deterministic access; also offer **Sign in with Apple** for Guideline 4.8.
- **TestFlight Beta App Review + Play + testers:** use the same shared Google demo via OAuth; password only in the store consoles + password manager — **never git**.

## Decision

### Shared Google demo (2026-07-23)

- Email: **`coachwatts.play.review@gmail.com`**
- Use for: Play Console review, TestFlight external/beta reviewers, and human testers signing in with Google.
- Password locations (not git): Watt Mind password manager, ASC TestFlight → **Test Information → Beta App Review Information → Sign-In Information**, Play Console Sign in details, and local Mac gitignored `.env` keys `PLAY_DEMO_GOOGLE_EMAIL` / `PLAY_DEMO_GOOGLE_PASSWORD` (never `EXPO_PUBLIC_*`; never commit).
- Seeded on hosted (2026-08-09): Google OAuth identity exists; screenshot-ready synthetic goal/plan/workouts/wellness/nutrition/coach chat via `coach-wattz/scripts/tmp-seed-play-review-demo.ts --prod` (not a raw founder-data copy).

### Apple App Store review (ASC Distribution)

- **Sign-in required:** Yes.
- Put the seeded Google demo email and password in the dedicated ASC Sign-In Information fields; this is the deterministic reviewer path.
- App Review notes explain OAuth PKCE and instruct Google first, while confirming **Sign in with Apple** is equally available on `/oauth/login` for Guideline 4.8.
- Do not rely on a reviewer Apple ID as the only path: a new Apple identity reaches an empty activation account and gives us no control over provider challenges or representative data.

### TestFlight Beta App Review (ASC TestFlight)

- Sign-in required: **Yes**
- Username: `coachwatts.play.review@gmail.com`
- Password: same as password manager (saved in ASC Sign-In fields — not in this repo)
- Review notes: use Google on the IdP login page (not an in-app password).

## How login works (no Coach Watts password)

### Apple App Store review (deterministic Google demo)

1. Reviewer taps Continue in the app  
2. System browser opens Coach Watts `/oauth/login`  
3. They choose **Sign in with Google** and use the supplied ASC credentials  
4. Browser returns via `coachwatts://oauth/callback` (PKCE)

Sign in with Apple remains available on the same hosted page and is tested separately for new, returning, and Hide My Email identities.

### TestFlight beta / Play / Google demo

1. Tester taps Continue in the app  
2. System browser opens Coach Watts `/oauth/login`  
3. They choose **Google** and use `coachwatts.play.review@gmail.com`  
4. Browser returns via `coachwatts://oauth/callback` (PKCE)

## Steps

1. [x] Decide Apple App Store review path: seeded Google credentials in ASC plus SIWA availability.
2. [x] Create Google demo Gmail (`coachwatts.play.review@gmail.com`, 2026-07-23) + save in password manager / Play Console / ASC Test Information (not git).
3. [x] Seed the Google demo as an athlete on hosted `coachwatts.com` (recorded 2026-08-09; revalidate immediately before resubmission).
4. [ ] Confirm hosted IdP shows Sign in with Apple after Dokploy deploy + smoke.
5. [ ] Optionally soften empty first-run UX ([056](../../issues/056.md)) — new SIWA accounts start empty.
6. [x] ASC App Review notes + contact on 0.1.1 (Laszlo Racz / `deploy@watt-mind.com` / `+36302858822`).
7. [x] ASC TestFlight → Test Information: Sign-In = Google demo email + password; Review Notes explain Google on IdP (saved 2026-07-23).
8. [x] Smoke once on TestFlight: PKCE → Safari → Google demo (or SIWA) → authenticated shell ([007](./007-testflight-smoke.md)). *(Release sim smoke 2026-08-09; IdP session reuse after sign-out.)*
9. [ ] Smoke once on Play internal test: PKCE → Chrome Custom Tabs → Google demo → authenticated shell ([016](./016-play-internal-test-smoke.md)). *(Human testers passed Internal smoke 2026-08-09 — user sign-off.)*
10. [x] Play **Sign in details**: Google demo email + password + OAuth notes verified on testing-credentials page (2026-08-09).

### ASC App Review notes template (Distribution)

```
Sign-in uses OAuth 2.0 + PKCE in the system browser (no in-app password form).
Default instance: https://coachwatts.com
Tap Continue → accept the iOS authentication prompt → choose Sign in with Google → use the supplied Sign-In Information credentials. The browser returns automatically via coachwatts://oauth/callback.
Sign in with Apple is also available on the same hosted page as the equivalent Guideline 4.8 option.
HealthKit / camera / notifications are optional. Delete account: More → Settings.
Not a medical device / no diagnosis.
Guideline 4.8: Sign in with Apple is offered on the IdP login page alongside Google.
```

### ASC TestFlight Beta App Review (Test Information)

| Field | Value |
|-------|--------|
| Sign-in required | Yes |
| User Name | `coachwatts.play.review@gmail.com` |
| Password | password manager / ASC field only (not git) |
| Review Notes | Continue → iOS authentication prompt → **Google** → supplied credentials → automatic app return |

### Play Sign in notes (saved in Console)

```
OAuth only (no in-app password). Default instance https://coachwatts.com. Tap Sign in → system browser → Google → use the Gmail credentials above → return via coachwatts://oauth/callback. Optional: Health Connect, camera, notifications. Delete account: More → Settings. Not a medical device.
```

## Done when

- ASC Distribution and TestFlight Sign-In Information have the active seeded Google demo; notes instruct that deterministic path and explain SIWA availability; hosted SIWA is live; the candidate matrix succeeds.
- Play Sign in details have the Google demo email **and password**; athlete seeded on hosted instance; Play internal-test smoke succeeds (testers 2026-08-09).
