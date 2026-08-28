## ADDED Requirements

### Requirement: Authentication outcomes are stage-aware
The mobile client SHALL classify authentication cancellation and failures by stable OAuth stage without displaying raw provider, token, authorization-code, PKCE, or server details.

#### Scenario: User cancels the system authentication session
- **WHEN** the system authentication session returns cancel or dismiss
- **THEN** the app returns to the ready login screen without rendering an error or reporting a failure event

#### Scenario: Provider denies authorization
- **WHEN** the callback returns `error=access_denied`
- **THEN** the app treats the result as cancellation and permits an immediate retry

#### Scenario: Recoverable authentication failure
- **WHEN** instance reachability, provider initiation, callback completion, token exchange, or account verification fails transiently
- **THEN** the app shows safe stage-appropriate guidance and a retry action

### Requirement: Successful authentication is deterministically verified
The mobile client SHALL verify the issued session with the configured instance user-info endpoint and SHALL prevent stale or overlapping authentication transitions from overwriting a newer session.

#### Scenario: User-info succeeds after token exchange
- **WHEN** token exchange succeeds and user-info returns a valid identity for the same auth generation
- **THEN** the app enters the authenticated shell with that identity

#### Scenario: User-info is temporarily unreachable
- **WHEN** token exchange succeeds but user-info fails due to connectivity, timeout, or server availability
- **THEN** the app preserves the pending credential and the next retry resumes verification before opening a new provider session

#### Scenario: Issued credential is rejected
- **WHEN** user-info returns a definitive 401 or 403 for the newly issued credential
- **THEN** the app clears that generation of credentials and remains unauthenticated

#### Scenario: A newer auth transition wins
- **WHEN** sign-out, instance switch, or another sign-in changes the auth generation while verification is in flight
- **THEN** the stale transition does not update user, status, or newer credentials

### Requirement: Hosted login cancellation completes OAuth
The Coach Watts IdP SHALL return cancellation from the hosted login page through a server-validated registered redirect URI using OAuth `access_denied` semantics and the original state.

#### Scenario: Cancel before provider selection
- **WHEN** the athlete chooses Cancel on `/oauth/login`
- **THEN** the IdP redirects to the registered client callback with `error=access_denied` and the original state

#### Scenario: Unregistered cancel redirect
- **WHEN** a cancellation request contains a redirect URI not registered for the OAuth client
- **THEN** the IdP refuses the redirect and does not navigate to the supplied destination

## MODIFIED Requirements

### Requirement: Sign out
The system SHALL provide a sign-out action that best-effort revokes the hosted refresh token, always clears local identity-bound state, and returns the user to the unauthenticated flow while retaining the configured instance URL.

#### Scenario: Online sign out revokes and clears session
- **WHEN** the authenticated user signs out while the instance is reachable
- **THEN** the app requests refresh-token revocation, removes local tokens and athlete caches, and shows the login screen

#### Scenario: Offline sign out still clears session
- **WHEN** revocation is offline, times out, or fails
- **THEN** local tokens and identity-bound state are still cleared and the login screen is shown

#### Scenario: Account switch has no data leakage
- **WHEN** account A signs out and account B subsequently signs in
- **THEN** no persisted query, queued write, push registration, Health identity, or activation state from account A is visible to account B

### Requirement: Sign-up and sign-in share PKCE
The unauthenticated auth screen SHALL present one honest continue entry point explaining that the configured Coach Watts IdP supports both new-account creation and returning sign-in through the same OAuth Authorization Code plus PKCE flow. After tokens are obtained, activation onboarding SHALL determine whether the wizard or tab shell is next.

#### Scenario: New account continues through PKCE
- **WHEN** a new athlete chooses Continue and completes an offered provider
- **THEN** the IdP creates the account as appropriate and the app completes the same client and redirect PKCE flow

#### Scenario: Returning account continues through PKCE
- **WHEN** a returning athlete chooses Continue and completes an offered provider
- **THEN** the app completes PKCE and applies the activation gate after verified success
