## Context

The mobile client opens an Expo AuthSession against the configured Coach Watts instance, exchanges the returned authorization code, persists tokens, and then loads `/api/oauth/userinfo`. The login screen currently catches every thrown value through one generic fallback. The hosted `/oauth/login` page also cancels by navigating to its dashboard instead of completing the OAuth request. App Review therefore cannot distinguish a normal cancellation from a broken provider, callback, token exchange, or account bootstrap.

The change crosses the watts-mobile and coach-wattz repositories and changes security-relevant behavior. It must remain a public-client PKCE flow, preserve self-hosting, and never expose secrets or OAuth artifacts in diagnostics.

## Goals / Non-Goals

**Goals:**

- Give cancellation, recoverable failure, and definitive authentication failure distinct deterministic behavior.
- Make the mobile session transition race-safe across authorization, verification, persistence, refresh, sign-out, and account switching.
- Complete hosted cancellation through a validated OAuth redirect with preserved state.
- Revoke the refresh token on sign-out without making local cleanup depend on network success.
- Give App Review a deterministic seeded login path and prove the exact uploaded binary on iPhone and iPad.

**Non-Goals:**

- Replacing OAuth/PKCE with an in-app password form or embedding provider SDK credentials in mobile.
- Signing the user out of their global Apple or Google browser session.
- Adding a store-only authentication bypass or demo token to a release binary.
- Changing Coach Watts authorization scopes or moving business logic into mobile.

## Decisions

### Typed errors remain internal; UI receives safe classifications

`AuthFlowError` carries a stable code, stage, recoverability, and optional cause. Cancellation has its own guard and is not an error presentation or Sentry event. UI copy is selected from the stable code; raw provider and server descriptions are diagnostics only.

Alternative considered: return a result union for every network helper. Exceptions fit the existing async AuthContext and API conventions with a smaller migration, while the concrete class still makes handling exhaustive and testable.

### One honest mobile entry action

The mobile screen uses one primary action, `Continue`, with copy explaining that the hosted page supports sign-in or account creation. The providers already establish either a new or returning Coach Watts account, so two identical mobile actions communicate a branch that does not exist.

Alternative considered: pass a sign-in/sign-up hint through OAuth. That adds server/UI state without changing provider behavior and can be revisited if product later needs distinct onboarding campaigns.

### Persist exchanged tokens, then verify with a resumable pending session

The exchange persists tokens under the current auth-session generation before user-info verification because the shared API client reads SecureStore and supports refresh. If verification fails due to reachability, tokens remain and the next Continue first resumes verification instead of reopening the provider. If verification returns a definitive 401/403 or malformed identity, the just-issued credentials are cleared for that generation. Generation checks prevent stale verification or sign-out from winning.

Alternative considered: verify user-info with an unpersisted bearer token. That cannot use the normal refresh path and loses the exchanged session on a transient network failure or process interruption.

### Hosted cancellation uses a dedicated public server endpoint

The browser posts its original same-origin authorize callback path to a server endpoint. The server parses only `/api/oauth/authorize`, loads the OAuth app, validates the registered redirect URI, and returns `access_denied` plus the original state to that redirect. The browser never constructs or trusts the destination URI.

Alternative considered: build the redirect in Vue. That would create an open-redirect risk and duplicate server validation.

### Logout revocation is best effort and cleanup is unconditional

Sign-out snapshots the current refresh token and instance, requests RFC 7009 revocation with a short timeout, records a sanitized breadcrumb on failure, and then always runs existing local identity cleanup. The global provider browser session remains intact; the next OAuth prompt retains explicit account-selection controls.

### Review readiness is a release gate, not a test bypass

App Store Connect receives the seeded Google demo credentials in its dedicated fields and notes also identify Sign in with Apple. The exact TestFlight binary is exercised on iPhone and iPad compatibility mode. No credential or fixture token enters source, public environment variables, Maestro YAML, or the app bundle.

## Risks / Trade-offs

- [Backend and mobile deploy out of order] → Mobile treats both legacy dismissal and new `access_denied` as cancellation; hosted changes remain backwards compatible.
- [Transient failure after token exchange leaves credentials stored] → Status remains unauthenticated, Continue resumes verification first, and definitive rejection clears only the matching generation.
- [Revocation latency makes logout feel slow] → Use a short bounded timeout and never block local cleanup after failure.
- [Provider error descriptions leak sensitive implementation details] → Map only stable codes to UI and sanitize all telemetry.
- [Google challenges the reviewer account] → Verify from a clean, geographically independent browser immediately before submission and keep a tested Apple path available.
- [Authentication behavior is security-sensitive] → Require human review and do not auto-merge either repository PR.

## Migration Plan

1. Land mobile typed handling and tests with compatibility for current hosted behavior.
2. Land hosted cancellation/provider-error handling and deploy coach-wattz.
3. Land revocation and account-isolation coverage.
4. Update review metadata and run production provider smokes.
5. Build a new TestFlight binary, execute the release matrix, and resubmit only after evidence is logged.

Rollback is independent: hosted changes can be reverted without breaking the mobile cancellation guard, and mobile can be rolled back without changing OAuth client registration. Token formats and database schemas do not change.

## Open Questions

- The complete App Review rejection prose and guideline number still need to be copied from App Store Connect; any additional cited failure must be added to the resubmission gate.
- Actual App Store Connect credential updates and physical/TestFlight smokes require the account owner and uploaded replacement build; code can prepare and document the gate but cannot manufacture that external evidence.
