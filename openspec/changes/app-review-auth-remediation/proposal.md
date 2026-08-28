## Why

App Review rejected iOS 0.1.1 (5) after the authentication journey returned the generic `Sign-in failed` state. Reproduction showed that normal cancellation, hosted provider failures, callback failures, token exchange failures, and account verification failures are indistinguishable, while reviewer access currently depends on a less deterministic fresh-account path.

## What Changes

- Model mobile OAuth as typed, stage-aware outcomes so cancellation is quiet and recoverable failures are actionable.
- Replace the two identical unauthenticated entry actions with one honest continue action and make successful login plus account verification deterministic.
- Return hosted-login cancellation and provider failures to the registered mobile redirect using OAuth error semantics and preserved state.
- Best-effort revoke the hosted refresh token during sign-out while keeping local cleanup reliable offline and across account switches.
- Add sanitized auth-stage diagnostics without recording credentials, authorization codes, PKCE material, tokens, or personal data.
- Make deterministic seeded reviewer access, production Sign in with Apple verification, and an exact TestFlight iPhone/iPad auth matrix release gates.
- Expand mobile unit, backend integration, Maestro definition, and review-equivalent manual coverage across the account lifecycle.

## Capabilities

### New Capabilities

- `auth-review-readiness`: Deterministic App Review access, release-binary authentication diagnostics, and the pre-submission auth smoke gate.

### Modified Capabilities

- `oauth-pkce`: Add typed cancellation and failure behavior, deterministic account verification, OAuth-compliant hosted cancellation, and server revocation on sign-out.
- `sign-in-with-apple`: Require actionable provider errors and verified new, returning, and Hide My Email production paths.
- `store-ready`: Require review credentials and review-equivalent release authentication verification for account-based submissions.

## Impact

- Mobile: `app/(auth)/login.tsx`, `src/auth/oauth.ts`, `src/auth/AuthContext.tsx`, secure token lifecycle, auth tests, Maestro flows, Sentry breadcrumbs, and auth documentation.
- Hosted coach-wattz dependency: `/oauth/login`, OAuth authorization cancellation, Auth.js provider error presentation, server tests, and Sign in with Apple runbooks.
- Distribution: App Store Connect review credentials and notes, seeded demo data, TestFlight iPhone/iPad smoke evidence, and the distribution log.
- No client secret, provider secret, review password, token, authorization code, or PKCE verifier is added to the repository or telemetry.
