# 004 — Listing metadata & assets

**Area:** listing · **Priority:** high · **Status:** in-progress

**Depends on:** [002](./002-app-store-connect-app.md); screenshots need a **TestFlight / production** build ([006](./006-ios-production-build.md) → [007](./007-testflight-smoke.md))

## Goal

Fill App Store listing fields Apple requires before submission. Phone-only (no iPad screenshots) — `supportsTablet: false`.

## Engineering already done in ASC (do not redo)

On version **0.1.1 Prepare for Submission** / App Information:

| Field | Status |
|-------|--------|
| Subtitle, description, keywords, promotional text | done (companion positioning; not a medical device) |
| Support URL / Marketing URL | `https://coachwatts.com` |
| Category | Health & Fitness (primary) |
| Copyright | Watt Mind Kft. |
| Version string | `0.1.1` |
| Pricing & Availability | Free, all countries/regions |
| Version release | Manually release after approval |
| App Privacy / age rating / DSA | done → [003](./003-privacy-and-compliance.md) |
| App Review contact + SIWA notes | done → [008](./008-reviewer-demo-account.md) |

## Marketing work in the Apple portal

**Where:** [App Store Connect → Coach Watts → Distribution → iOS App **0.1.1**](https://appstoreconnect.apple.com/apps/6793247809/distribution/ios/version/inflight)  
(Product page media lives on the **version** page, not Developer → Certificates.)

### Required before submit (marketing owns)

1. **Owner decision** — confirm who produces screenshots (marketing vs eng). Same owner decision as Play [013](./013-play-listing-assets.md). Until decided, treat screenshots as **blocked on build + marketing**.
2. **iPhone screenshots** — currently **0 of 10**. Apple will not accept “Add for Review” without at least one set for the required display size.
   - Capture from a **TestFlight or production** build of Coach Watts (not Expo Go / mockups that diverge from the binary).
   - Phone-only: fill the **iPhone** tab. Skip **iPad** and **Apple Watch** (we do not ship those).
   - Prefer the current required large iPhone size Apple shows on the drop zone (e.g. 6.7″ / 6.5″ class — follow the pixel sizes listed under the upload control).
   - Show the real product loop: Today → Log / check-in → Coach chat → More — no medical/diagnosis claims in overlays.
   - Optional marketing chrome (device frames, short captions) is fine if it still matches the shipped UI.
   - Prefer the same story arc and brand treatment as the Play phone set ([013](./013-play-listing-assets.md)).
   - **Capture runbook + masters:** `~/Develop/watts-marketing/screenshots/mobile-app/README.md` (raw PNGs in that folder).

### Optional / later (not blocking first submit)

See [023](./023-store-page-stellar-polish.md) for App Previews, ASO, Custom Product Pages, PPO, featuring, localization, and Play promo video.

**Not marketing / not in ASC media:** App icon and splash come from the **uploaded IPA** (`assets/images/` → local Xcode Archive), not a separate ASC icon upload.

### Handoff checklist for marketing

```
[ ] TestFlight build installed (same binary that will go to review)
[ ] Capture 3–10 iPhone screenshots at ASC-required size(s)
[ ] Upload on version 0.1.1 → Previews and Screenshots → iPhone tab
[ ] Spot-check Product Page Preview in ASC
[ ] Confirm no medical/diagnosis language on image overlays
[ ] Tell eng when uploads are done → unlock [009](./009-submit-for-review.md)
```

## Steps (tracking)

1. [x] Capture + upload iPhone screenshots at ASC-required size — **9/10** on ASC **0.1.1** (midnight treatment, `1284×2778` upload set). TestFlight build for final smoke still pending ([006](./006-ios-production-build.md)).
2. [x] Write subtitle / description / keywords / promotional text. Saved on ASC **0.1.1**.
3. [x] Support URL + Marketing URL: `https://coachwatts.com`.
4. [x] Category: Health & Fitness (primary); no secondary.
5. [x] Copyright: `Watt Mind Kft.`; version **`0.1.1`**.
6. [x] What’s New: N/A for first release.
7. [x] Description includes “not a medical device” disclaimer.
8. [x] App Review Information → [008](./008-reviewer-demo-account.md) (SIWA; no Google demo).
9. [x] Version release: **Manually release** after approval.
10. [x] Pricing & Availability: Free, all countries/regions (175).

## Done when

- ASC listing has required **iPhone screenshots** + text for the locales we ship. (Text done; screenshots blocked on TestFlight build + marketing upload.)
