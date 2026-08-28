## ADDED Requirements

### Requirement: Account-based review has deterministic access
Each App Store submission that requires authentication SHALL provide an active seeded demo account in the dedicated App Store Connect sign-in fields, with credentials stored only in approved secret systems and App Store Connect.

#### Scenario: Reviewer uses supplied credentials
- **WHEN** App Review follows the submitted Google demo instructions from a clean authentication session
- **THEN** the credentials work without MFA, CAPTCHA, recovery, or location challenge and reach representative seeded app content

#### Scenario: Repository and binary contain no review credential
- **WHEN** source and the release bundle are inspected
- **THEN** no review password, fixture token, or store authentication bypass is present

### Requirement: Release authentication matrix gates submission
The exact uploaded TestFlight binary SHALL pass the documented authentication matrix on iPhone and iPad compatibility mode before App Store resubmission.

#### Scenario: Review-equivalent matrix passes
- **WHEN** the candidate build is tested for clean install, returning install, Apple, Google demo, cancellation, offline recovery, logout, relaunch, and account switching
- **THEN** every required row has recorded passing evidence tied to the build and device

#### Scenario: Matrix has a failure or missing row
- **WHEN** any required authentication row fails or lacks evidence
- **THEN** the build is not submitted for App Review

### Requirement: Release auth diagnostics are sanitized
Release authentication SHALL emit stage-level diagnostics sufficient to locate failures without recording provider credentials, personal data, authorization codes, OAuth state, PKCE verifier or challenge values, access tokens, or refresh tokens.

#### Scenario: Genuine release authentication failure
- **WHEN** a non-cancellation authentication stage fails in a reporting release environment
- **THEN** diagnostics include app version, build, platform, instance hostname, stable failure stage, and stable error code only

#### Scenario: User cancellation
- **WHEN** authentication is cancelled normally
- **THEN** the cancellation is not captured as an error event
