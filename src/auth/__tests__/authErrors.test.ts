import { describe, expect, it } from 'vitest';

import { AuthFlowError, authErrorMessage, isAuthCancellation } from '../authErrors';

describe('auth error presentation', () => {
  it('keeps normal cancellation silent', () => {
    const error = new AuthFlowError({ code: 'cancelled', stage: 'authorization' });

    expect(isAuthCancellation(error)).toBe(true);
    expect(authErrorMessage(error)).toBe('');
  });

  it.each([
    ['instance_unreachable', 'instance'],
    ['authorization_failed', 'authorization'],
    ['provider_failed', 'callback'],
    ['invalid_callback', 'callback'],
    ['token_exchange_failed', 'token_exchange'],
    ['invalid_token_response', 'token_exchange'],
    ['account_verification_unavailable', 'account_verification'],
    ['account_verification_rejected', 'account_verification'],
    ['configuration_error', 'configuration'],
  ] as const)('maps %s to safe actionable copy', (code, stage) => {
    const error = new AuthFlowError({
      code,
      stage,
      cause: new Error('provider secret detail'),
    });

    expect(authErrorMessage(error)).not.toContain('provider secret detail');
    expect(authErrorMessage(error).length).toBeGreaterThan(10);
  });

  it('maps unknown failures to a safe retry message', () => {
    expect(authErrorMessage(new Error('raw backend detail'))).toBe(
      'Sign-in could not be completed — please try again',
    );
  });
});
