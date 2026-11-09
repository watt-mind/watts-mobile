# 009 — Submit for App Review

**Area:** review · **Priority:** high · **Status:** blocked on replacement build and auth matrix

**Depends on:** [003](./003-privacy-and-compliance.md), [004](./004-listing-metadata-assets.md), [007](./007-testflight-smoke.md), [008](./008-reviewer-demo-account.md)

## Goal

Select the tested build, attach review info, and submit.

## Steps

1. [x] In ASC, choose the TestFlight build that passed [007](./007-testflight-smoke.md).
2. [x] Confirm privacy, listing, and compliance sections show no missing required fields.
3. [x] Confirm App Review Information from [008](./008-reviewer-demo-account.md): contact saved; SIWA notes + Sign-In placeholders (no Google demo).
4. [x] Answer any remaining content-rights / advertising / gambling prompts accurately (companion: no ads expected).
5. [x] Submit for Review.
6. [x] Prepend outcome to [log.md](../log.md) (submitted / Waiting for Review / In Review / Approved / Rejected + reason).
7. [ ] If rejected: file follow-up tasks or issues; do not delete history — log the response and the fix.

## Replacement submission gate after 0.1.1 (5) rejection

- [ ] CW-724 mobile cancellation/error/session changes are human-reviewed and included.
- [ ] CW-725 hosted cancellation/provider recovery changes are deployed.
- [ ] CW-726 logout revocation/account-isolation changes are human-reviewed and included.
- [ ] [007](./007-testflight-smoke.md) authentication matrix passes on the exact replacement TestFlight build.
- [ ] [008](./008-reviewer-demo-account.md) credentials are revalidated and saved in ASC Distribution Sign-In Information.
- [ ] Complete rejection prose and guideline number are copied into the distribution log and addressed explicitly in Resolution Center.
- [ ] Only then select the replacement build and resubmit.

## Done when

- App is **Waiting for Review** or later; submission recorded in the log.
