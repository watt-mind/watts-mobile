# 008 — Reviewer demo account & notes

**Area:** review · **Priority:** high · **Status:** in progress

**Depends on:** hosted **Sign in with Apple** enabled for Guideline 4.8 ([sign-in-with-apple](../../../openspec/changes/sign-in-with-apple/) / coach-wattz)  
**Related:** [../../issues/056.md](../../issues/056.md) (day-one empty surfaces look broken)

## Goal

- **Apple App Store review:** prefer **Sign in with Apple** (Guideline 4.8) with a reviewer Apple ID.
- **TestFlight Beta App Review + Play + testers:** shared Google demo Gmail via OAuth — credentials in **ASC Test Information** and **Play Sign in details**; password only in those consoles + password manager — **never git**.

## Decision

### Shared Google demo (2026-07-23)

- Email: **`coachwatts.play.review@gmail.com`**
- Use for: Play Console review, TestFlight external/beta reviewers, and human testers signing in with Google.
- Password locations (not git): Watt Mind password manager, ASC TestFlight → **Test Information → Beta App Review Information → Sign-In Information**, Play Console Sign in details, and local Mac gitignored `.env` keys `PLAY_DEMO_GOOGLE_EMAIL` / `PLAY_DEMO_GOOGLE_PASSWORD` (never `EXPO_PUBLIC_*`; never commit).
- Seeded on hosted (2026-08-09): Google OAuth identity exists; screenshot-ready synthetic goal/plan/workouts/wellness/nutrition/coach chat via `coach-wattz/scripts/tmp-seed-play-review-demo.ts --prod` (not a raw founder-data copy).

### Apple App Store review (ASC Distribution)

- Primary path remains **Sign in with Apple** on `/oauth/login` (Guideline 4.8).
- App Review notes should still explain OAuth PKCE + SIWA; Google demo above is the fallback if a password-style Sign-In form is required.

### TestFlight Beta App Review (ASC TestFlight)

- Sign-in required: **Yes**
- Username: `coachwatts.play.review@gmail.com`
- Password: same as password manager (saved in ASC Sign-In fields — not in this repo)
- Review notes: use Google on the IdP login page (not an in-app password).

## How login works (no Coach Watts password)

### Apple App Store review (SIWA)

1. Reviewer taps Sign in in the app  
2. System browser opens Coach Watts `/oauth/login`  
3. They choose **Sign in with Apple**  
4. Browser returns via `coachwatts://oauth/callback` (PKCE)

### TestFlight beta / Play / Google demo

1. Tester taps Sign in in the app  
2. System browser opens Coach Watts `/oauth/login`  
3. They choose **Google** and use `coachwatts.play.review@gmail.com`  
4. Browser returns via `coachwatts://oauth/callback` (PKCE)

## Steps

1. [x] Decide Apple App Store review path: SIWA with reviewer Apple ID.
2. [x] Create Google demo Gmail (`coachwatts.play.review@gmail.com`, 2026-07-23) + save in password manager / Play Console / ASC Test Information (not git).
3. [ ] Seed the Google demo as an athlete on hosted `coachwatts.com` (one Google OAuth login).
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
Preferred: Tap Sign in → Safari → Sign in with Apple using a reviewer Apple ID → return via coachwatts://oauth/callback.
Fallback: Google on the same IdP page using the Sign-In Information credentials (demo Gmail).
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
| Review Notes | OAuth in system browser → choose **Google** → use credentials above → `coachwatts://oauth/callback` |

### Play Sign in notes (saved in Console)

```
OAuth only (no in-app password). Default instance https://coachwatts.com. Tap Sign in → system browser → Google → use the Gmail credentials above → return via coachwatts://oauth/callback. Optional: Health Connect, camera, notifications. Delete account: More → Settings. Not a medical device.
```

## Done when

- ASC Test Information has Google demo Sign-In; App Review notes explain SIWA + Google fallback; hosted SIWA live; TestFlight smoke succeeds.
- Play Sign in details have the Google demo email **and password**; athlete seeded on hosted instance; Play internal-test smoke succeeds (testers 2026-08-09).
