## 1. Mobile Authentication Outcomes

- [x] 1.1 Add typed auth stages, stable error codes, cancellation guards, and safe UI mapping with unit tests
- [x] 1.2 Update PKCE handling for system cancellation, OAuth callback errors, token response validation, and sanitized diagnostics
- [x] 1.3 Make account verification resumable after a transient post-exchange failure and generation-safe after definitive failure
- [x] 1.4 Replace the duplicate Create account and Sign in controls with one accessible Continue journey and retry states
- [ ] 1.5 Add login-screen and AuthContext tests for cancel, retry, definitive rejection, malformed identity, and overlapping transitions

## 2. Hosted OAuth Completion

- [x] 2.1 Create a server-validated OAuth cancellation endpoint that preserves state and returns access_denied
- [x] 2.2 Wire hosted login Cancel to the cancellation endpoint and render provider callback error recovery actions
- [ ] 2.3 Add coach-wattz tests for valid cancel, invalid redirect, provider error, preserved request, and Apple account paths
- [x] 2.4 Update hosted Sign in with Apple diagnostics and deployment verification documentation

## 3. Logout and Account Isolation

- [x] 3.1 Add bounded best-effort refresh-token revocation before unconditional local sign-out cleanup
- [ ] 3.2 Test online/offline revocation, timeout, logout-refresh races, relaunch, and account A to account B isolation
- [x] 3.3 Extend deterministic Maestro lifecycle definitions for unauthenticated entry and logout/account switching

## 4. App Review Release Gate

- [x] 4.1 Update reviewer-account instructions to require supplied seeded credentials rather than relying on reviewer-created Apple accounts
- [x] 4.2 Add the exact TestFlight iPhone/iPad authentication matrix, sanitized diagnostics check, and no-E2E-bypass inspection to distribution docs
- [ ] 4.3 Verify production Google demo and Apple new/returning/Hide My Email paths on the exact candidate build
- [ ] 4.4 Record version, build, device, provider, matrix evidence, and resubmission outcome in the distribution log

## 5. Verification and Delivery

- [ ] 5.1 Run mobile auth tests, full Vitest, typecheck, lint, and Maestro definition validation
- [ ] 5.2 Run coach-wattz OAuth tests, typecheck, and lint
- [ ] 5.3 Open separate mobile and hosted pull requests with one commit per Linear ticket and link CW-724 through CW-727
- [ ] 5.4 Obtain human review for security-relevant auth behavior; do not auto-merge
