## ADDED Requirements

### Requirement: Apple provider failures are actionable and safe
The hosted IdP SHALL render safe recovery options when Sign in with Apple is cancelled or fails and SHALL preserve the original mobile OAuth request for retry or return-to-app cancellation.

#### Scenario: Apple callback fails
- **WHEN** Apple returns a provider or callback error
- **THEN** the hosted page explains that Apple sign-in could not be completed and offers retry, another provider, and return-to-app actions without exposing configuration details

#### Scenario: Apple user cancels
- **WHEN** the athlete cancels Sign in with Apple
- **THEN** the hosted flow can return OAuth `access_denied` to the mobile callback with the original state

### Requirement: Production Apple account paths are release-verified
Each App Store submission SHALL verify Sign in with Apple against the production IdP for a first-time identity, returning identity, and private-relay email before the build is submitted.

#### Scenario: First-time Apple review smoke
- **WHEN** release authentication is tested with an Apple identity not previously linked to Coach Watts
- **THEN** the account is created, user-info succeeds, and activation onboarding is reachable

#### Scenario: Returning Apple review smoke
- **WHEN** the same Apple subject signs in again
- **THEN** the same Coach Watts account is restored even when Apple omits name or email

#### Scenario: Hide My Email review smoke
- **WHEN** the Apple identity chooses Hide My Email
- **THEN** the private relay identity completes account creation and can return to the same account later

