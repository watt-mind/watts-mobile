export type AuthFlowStage =
  | 'configuration'
  | 'instance'
  | 'authorization'
  | 'callback'
  | 'token_exchange'
  | 'account_verification'
  | 'revocation';

export type AuthFlowErrorCode =
  | 'cancelled'
  | 'instance_unreachable'
  | 'authorization_failed'
  | 'provider_failed'
  | 'invalid_callback'
  | 'token_exchange_failed'
  | 'invalid_token_response'
  | 'account_verification_unavailable'
  | 'account_verification_rejected'
  | 'configuration_error'
  | 'revocation_failed';

const AUTH_ERROR_COPY: Record<
  Exclude<AuthFlowErrorCode, 'cancelled' | 'revocation_failed'>,
  string
> = {
  instance_unreachable: "Can't reach Coach Watts — check your connection and try again",
  authorization_failed: 'Could not open Coach Watts sign-in — please try again',
  provider_failed:
    'Your sign-in provider could not complete the request — try again or choose another provider',
  invalid_callback: 'Coach Watts could not complete sign-in — please try again',
  token_exchange_failed: 'Coach Watts could not finish sign-in — please try again',
  invalid_token_response: 'Coach Watts returned an incomplete session — please try again',
  account_verification_unavailable: 'You signed in, but we could not load your account — try again',
  account_verification_rejected: 'Coach Watts could not verify this account — sign in again',
  configuration_error: 'Coach Watts sign-in is not configured correctly — contact support',
};

export class AuthFlowError extends Error {
  readonly code: AuthFlowErrorCode;
  readonly stage: AuthFlowStage;
  readonly recoverable: boolean;
  readonly cause?: unknown;

  constructor(params: {
    code: AuthFlowErrorCode;
    stage: AuthFlowStage;
    message?: string;
    recoverable?: boolean;
    cause?: unknown;
  }) {
    super(params.message ?? params.code);
    this.name = 'AuthFlowError';
    this.code = params.code;
    this.stage = params.stage;
    this.recoverable = params.recoverable ?? params.code !== 'configuration_error';
    this.cause = params.cause;
  }
}

export function isAuthCancellation(error: unknown): boolean {
  return error instanceof AuthFlowError && error.code === 'cancelled';
}

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof AuthFlowError)) {
    return 'Sign-in could not be completed — please try again';
  }
  if (error.code === 'cancelled') return '';
  if (error.code === 'revocation_failed') return 'Could not revoke the hosted session';
  return AUTH_ERROR_COPY[error.code];
}
