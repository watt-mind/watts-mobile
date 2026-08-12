# 019 — Paid agreements, pricing, and store subscription products

**Area:** commerce · **Priority:** high · **Status:** open

## Goal

Make Watt Mind Kft. eligible to receive store subscription proceeds and create review-ready Supporter/Pro monthly and annual products on both stores.

**Depends on:** Apple/Play organization accounts (001, 010–011) · RevenueCat ownership decision (018)

## Product model

| Tier | Apple | Google Play | RevenueCat |
|------|-------|-------------|------------|
| Supporter monthly/annual | One subscription group; two products at Supporter service level | `Supporter` subscription; monthly/annual auto-renewing base plans | `supporter` entitlement/packages |
| Pro monthly/annual | Same group; two products at higher Pro service level | `Pro` subscription; monthly/annual auto-renewing base plans | `pro` entitlement/packages |

Final immutable product/base-plan IDs and prices belong in this file after creation; never guess them in application code.

## Apple catalog (draft) — created 2026-07-22

Subscription group **Coach Watts** · Group ID `22257011` · App Apple ID `6793247809`

| Reference | Product ID | Apple ID | Duration | Base price (USD) | EN display / description | Status |
|-----------|------------|----------|----------|------------------|--------------------------|--------|
| Pro Monthly | `coachwatts_pro_monthly` | `6793680130` | 1 month | $14.99 | Pro Monthly / Full Pro access with adaptive coaching insights. | Prepare for Submission |
| Pro Annual | `coachwatts_pro_annual` | `6793680902` | 1 year | $119.00 | Pro Annual / Full Pro access billed once per year. | Prepare for Submission |
| Supporter Monthly | `coachwatts_supporter_monthly` | `6793681933` | 1 month | $8.99 | Supporter Monthly / Core coaching tools and daily guidance. | Prepare for Submission |
| Supporter Annual | `coachwatts_supporter_annual` | `6793682172` | 1 year | $89.99 | Supporter Annual / Core coaching tools billed once per year. | Prepare for Submission |

- Availability: all countries/regions for each product (annual = 1 Year Upfront; not Monthly-with-12-Month-Commitment).
- Group localization EN (U.S.): display name **Coach Watts** (use app name).
- Service levels still need a manual fix in ASC: put **both Pro** products at level **1** and **both Supporter** at level **2** (currently listed 1–4 in creation order).
- Review screenshot / notes and grace period still open. Keep draft until Paid Apps + tax/banking clear and tasks 020/021 are ready.

## Steps

1. [x] Apple Paid Apps Agreement accepted (effective Jul 23, 2026 – Jul 21, 2027). Free Apps Agreement = Active. **Cleared (2026-08-09):** Bank Holder / Legal Entity English screening no longer blocking Paid Apps.
2. [x] Apple tax + banking for Watt Mind Kft. (status only; no financial details in git):
   - **Tax:** W-8BEN-E (nickname “W-8BEN-E Hungary”) + U.S. Certificate of Foreign Status — both **Active** (submitted Jul 23, 2026).
   - **Bank accounts on file:** Revolut Business EUR (…1013, Lithuania) and Erste HUF (…4237, Hungary).
   - **Submitted (2026-08-02) → Cleared (2026-08-09):** Compliance screening and Legal Entity Name (English) verification in ASC using English EU VIES VAT Certificate (`HU32998946`) and Erste HUF bank statement (`HU57...4237`). Documents in `docs/distribution/compliance/` and accounting vault. (Case ID `20000120973249`).
3. [ ] Evaluate/enroll in the App Store Small Business Program if eligible.
4. [~] Google Play payments profile linked (2026-07-23): Watt Mind Kft. org profile `3878-8777-9292` (Play); public merchant website `https://coachwatts.com`, support `support@coachwatts.com`, statement name `CoachWatts`, category Internet/Network/Digital Media.
   - **Payout bank (2026-07-23):** Erste HUF IBAN added (HU…4237) — **Verification pending** (Google micro-deposit under HUF 35 within ~3 business days; confirm exact amount in Payments profile).
   - **15% service fee (2026-07-23):** Account group **Watt Mind Korlátolt Felelősségű Társaság** created (no other ADAs); enrolled for the 15% service fee.
5. [x] Decide monthly/annual store pricing, regional availability, annual discount, and whether prices match web or target comparable net proceeds. (Parity with web list: Pro $14.99 / $119.00, Supporter $8.99 / $89.99; all countries.)
6. [ ] Decide introductory trial/offer policy and cross-provider trial eligibility with the existing Coach Watts trial/Stripe history.
7. [~] Create the Apple subscription group, four products, localizations, price schedule, and availability. Remaining: service levels (Pro=1, Supporter=2), grace period, review screenshot/notes.
8. [~] Create Google Supporter/Pro subscriptions with monthly/annual base plans, regional prices, grace/account-hold/resubscribe configuration, benefits, and tax/compliance metadata.
   - **Unblocked (2026-07-23):** Internal testing AAB `0.1.1` / versionCode `1` uploaded; Create subscription available.
   - **Benefits (2026-07-23):** Supporter — Daily coaching guidance / Core training tools / Mobile companion access. Pro — Adaptive coaching insights / Full Pro access / Everything in Supporter. Tax category Digital app sales + Service compliance left as set.
   - Remaining: Activate when ready for license testers.
9. [x] Map Apple products in RevenueCat task 018 (2026-07-22) and Google base plans `productId:basePlanId` (2026-07-23). Play service-account credentials in RC done (2026-07-23).

## Google catalog (draft) — created 2026-07-23

App package `com.coachwatts.app` · Play app ID `4976128188579826786`

| Product (name) | Product ID | Base plan ID | Period | US price (USD) | Grace | Status |
|----------------|------------|--------------|--------|----------------|-------|--------|
| Supporter | `coachwatts_supporter` | `monthly` | Monthly auto-renewing | $8.99 | 7 days | Draft |
| Supporter | `coachwatts_supporter` | `annual` | Yearly auto-renewing | $89.99 | 14 days | Draft |
| Pro | `coachwatts_pro` | `monthly` | Monthly auto-renewing | $14.99 | 7 days | Draft |
| Pro | `coachwatts_pro` | `annual` | Yearly auto-renewing | $119.99 | 14 days | Draft |

- Base plan IDs are lowercase + hyphens only (`monthly`, `annual`).
- Regional prices set from USD base (Play FX); Resubscribe = Allow; account hold = Play automatic.
- **Price note:** Play Pro annual US landed at **$119.99** (nearest Play price point); Apple Pro annual remains **$119.00**. Keep both as-is unless product decides to realign.
10. [ ] Keep products inactive/draft until task 020 backend authority and task 021 app experience are ready for end-to-end testing.

## Done when

- Paid-commerce agreements/payment profiles are active and both stores have localized, priced, unambiguous Supporter/Pro monthly/annual products ready to test/submit.

