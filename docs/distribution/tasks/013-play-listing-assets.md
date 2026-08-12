# 013 — Play Store listing assets

**Area:** listing · **Priority:** medium · **Status:** done

**Depends on:** [011](./011-play-console-app.md); screenshots need a **release / Internal testing** AAB ([015](./015-android-production-build.md))

## Goal

Fill the main store listing Google requires for testing tracks and production. Companion positioning; **no medical claims**.

## Required before production (marketing + eng)

| Asset | Spec / source | Status |
|-------|----------------|--------|
| Short description | Companion positioning; no diagnosis language | done |
| Full description | Reuse ASC voice + “not a medical device” disclaimer ([store-privacy-checklist.md](../../store-privacy-checklist.md)) | done |
| App icon 512×512 | From Coach Watts mark / `assets/images/icon.png` pipeline (`dist/play-listing/app-icon-512x512.png`) | done |
| Feature graphic 1024×500 | Real hero (`dist/play-listing/feature-graphic-1024x500.png`) | done |
| Phone screenshots | From **release / Internal** build (`dist/play-listing/01-today-insight.png` .. `06-coach.png` & framed set) | done |
| Contact / support | Align with `support@coachwatts.com` | done |

Skip tablet screenshots for v1 (phone-first; don’t claim tablet support).

### Handoff checklist

```
[x] Decide screenshot / feature-graphic owner (marketing vs eng) — same decision as Apple [004]
[x] Internal/release AAB installed
[x] Short + full description pasted; matches Data safety (no diagnosis language) — [012](./012-play-data-safety-and-content.md)
[x] Graphics prepared in dist/play-listing/ (Icon 512×512, feature graphic 1024×500, phone screenshots)
[x] Upload graphics via Play Console file picker (Watt Mind account; 2026-08-09 user sign-off on screenshots)
[x] Contact email / support verified
[x] Tell eng when done → unlock [017](./017-play-production-submit.md)
```

## Steps (tracking)

1. [x] Short description + full description (companion positioning; **no medical claims**).
2. [x] App icon 512×512 (`dist/play-listing/app-icon-512x512.png`).
3. [x] Feature graphic 1024×500 (`dist/play-listing/feature-graphic-1024x500.png`).
4. [x] Phone screenshots prepared from release/internal-test build (`dist/play-listing/`).
5. [ ] Optional: tablet screenshots only if we claim tablet support (v1 phone-first — skip).
6. [x] Contact email / support — align with `support@coachwatts.com` / watt-mind ops.
7. [x] Cross-check listing copy against Data safety ([012](./012-play-data-safety-and-content.md)).

## Done when

- Main store listing has required graphics + text for the locales we ship (EN-US first).
