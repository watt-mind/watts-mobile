## ADDED Requirements

### Requirement: Review instructions describe the real authentication journey
App Store review notes SHALL describe the system-browser OAuth journey, the supplied demo provider and credentials fields, Sign in with Apple availability, automatic return to the app, optional permissions, and where account deletion is found.

#### Scenario: Reviewer follows notes from a clean install
- **WHEN** the reviewer follows the submitted notes without developer assistance
- **THEN** they can authenticate the seeded account and reach representative content

### Requirement: Reviewer account remains representative and available
The review account SHALL remain enabled and populated with synthetic non-sensitive data throughout review, and its external provider SHALL not require an out-of-band challenge unavailable to App Review.

#### Scenario: Review happens after submission
- **WHEN** App Review authenticates at any point while the submission is pending
- **THEN** the supplied account remains active and its representative goals, plan, workouts, wellness, nutrition, and Coach content are available

### Requirement: Review evidence is build-specific
Distribution records SHALL identify the version, build, tested device classes, production instance, provider paths, and authentication matrix outcome for the binary submitted.

#### Scenario: Release candidate is ready to submit
- **WHEN** all authentication checks pass on the exact uploaded binary
- **THEN** the distribution log records the evidence and the review task links to it

