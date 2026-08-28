import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authErrorMessage, isAuthCancellation } from '../authErrors';
import {
  exchangeAuthorizationCode,
  getRedirectUri,
  loginWithPkce,
  refreshAccessToken,
} from '../oauth';
import { COMPANION_SCOPES } from '../scopes';

const authSession = vi.hoisted(() => ({
  config: null as Record<string, unknown> | null,
  makeAuthUrlDiscovery: null as Record<string, unknown> | null,
  promptDiscovery: null as Record<string, unknown> | null,
  promptOptions: null as Record<string, unknown> | null,
  result: { type: 'success', params: { code: 'mock-code' } } as {
    type: string;
    params: Record<string, string>;
  },
  codeVerifier: 'mock-verifier' as string | undefined,
  makeRedirectUri: vi.fn(() => 'coachwatts://oauth/callback'),
}));

const tokenStorage = vi.hoisted(() => ({
  saveTokens: vi.fn(async (tokens: Record<string, unknown>) => tokens),
}));

const authGeneration = vi.hoisted(() => ({ current: 7 }));

vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
}));

vi.mock('expo-auth-session', () => {
  class AuthRequest {
    codeVerifier?: string;

    constructor(config: Record<string, unknown>) {
      authSession.config = config;
      this.codeVerifier = authSession.codeVerifier;
    }

    async makeAuthUrlAsync(discovery: Record<string, unknown>) {
      authSession.makeAuthUrlDiscovery = discovery;
      return 'https://coachwatts.com/api/oauth/authorize';
    }

    async promptAsync(discovery: Record<string, unknown>, options: Record<string, unknown>) {
      authSession.promptDiscovery = discovery;
      authSession.promptOptions = options;
      return authSession.result;
    }
  }

  return {
    AuthRequest,
    ResponseType: { Code: 'code' },
    Prompt: { Login: 'login' },
    makeRedirectUri: authSession.makeRedirectUri,
  };
});

vi.mock('@/src/auth/tokenStorage', () => ({ saveTokens: tokenStorage.saveTokens }));

vi.mock('@/src/auth/authSessionGeneration', () => ({
  getAuthSessionGeneration: vi.fn(() => authGeneration.current),
}));

vi.mock('@/src/config/env', () => ({
  APP_SCHEME: 'coachwatts',
  OAUTH_CLIENT_ID: 'mock-client-id',
}));

function response(
  body: Record<string, unknown>,
  options: { ok?: boolean; status?: number } = {},
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

function successfulToken(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'mock-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'mock-refresh-token',
    ...overrides,
  };
}

describe('OAuth redirect configuration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the registered standalone callback URI', () => {
    expect(getRedirectUri()).toBe('coachwatts://oauth/callback');
    expect(authSession.makeRedirectUri).toHaveBeenCalledWith({
      scheme: 'coachwatts',
      path: 'oauth/callback',
    });
  });
});

describe('loginWithPkce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authSession.config = null;
    authSession.makeAuthUrlDiscovery = null;
    authSession.promptDiscovery = null;
    authSession.promptOptions = null;
    authSession.result = { type: 'success', params: { code: 'mock-code' } };
    authSession.codeVerifier = 'mock-verifier';
    global.fetch = vi.fn(async () => response(successfulToken())) as unknown as typeof fetch;
  });

  it('configures the official public client for Authorization Code + PKCE', async () => {
    await loginWithPkce('https://coachwatts.com');

    expect(authSession.config).toEqual({
      clientId: 'mock-client-id',
      redirectUri: 'coachwatts://oauth/callback',
      scopes: [...COMPANION_SCOPES],
      usePKCE: true,
      responseType: 'code',
      prompt: 'login',
    });
    expect(authSession.makeAuthUrlDiscovery).toEqual({
      authorizationEndpoint: 'https://coachwatts.com/api/oauth/authorize',
    });
    expect(authSession.promptDiscovery).toEqual({
      authorizationEndpoint: 'https://coachwatts.com/api/oauth/authorize',
    });
    expect(authSession.promptOptions).toMatchObject({
      preferEphemeralSession: false,
      showInRecents: true,
      showTitle: false,
      enableDefaultShareMenuItem: false,
    });
  });

  it('exchanges the returned code and persists the resulting session', async () => {
    const result = await loginWithPkce('https://coachwatts.com');

    expect(global.fetch).toHaveBeenCalledWith('https://coachwatts.com/api/oauth/token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: 'mock-client-id',
        code: 'mock-code',
        redirect_uri: 'coachwatts://oauth/callback',
        code_verifier: 'mock-verifier',
      }),
    });
    expect(tokenStorage.saveTokens).toHaveBeenCalledWith(
      {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 3600,
      },
      7,
    );
    expect(result).toEqual({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
    });
  });

  it.each(['cancel', 'dismiss'])('classifies an auth-session %s as cancellation', async (type) => {
    authSession.result = { type, params: {} };

    const error = await loginWithPkce('https://coachwatts.com').catch((caught) => caught);

    expect(isAuthCancellation(error)).toBe(true);
    expect(error).toMatchObject({ code: 'cancelled', stage: 'authorization' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();
  });

  it('does not reproduce the reviewer error when the system auth session is cancelled', async () => {
    authSession.result = { type: 'cancel', params: {} };

    const message = await loginWithPkce('https://coachwatts.com').catch(authErrorMessage);

    expect(message).toBe('');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(['error', 'locked', 'opened'])(
    'rejects a non-success auth-session result (%s) before token exchange',
    async (type) => {
      authSession.result = { type, params: {} };

      await expect(loginWithPkce('https://coachwatts.com')).rejects.toMatchObject({
        code: 'authorization_failed',
        stage: 'authorization',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it('rejects a success callback without an authorization code', async () => {
    authSession.result = { type: 'success', params: {} };

    await expect(loginWithPkce('https://coachwatts.com')).rejects.toMatchObject({
      code: 'invalid_callback',
      stage: 'callback',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects a callback when the PKCE verifier is unavailable', async () => {
    authSession.codeVerifier = undefined;

    await expect(loginWithPkce('https://coachwatts.com')).rejects.toMatchObject({
      code: 'configuration_error',
      stage: 'configuration',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requires a refresh token before persisting a mobile session', async () => {
    global.fetch = vi.fn(async () =>
      response(successfulToken({ refresh_token: undefined })),
    ) as unknown as typeof fetch;

    await expect(loginWithPkce('https://coachwatts.com')).rejects.toMatchObject({
      code: 'invalid_token_response',
      stage: 'token_exchange',
    });
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();
  });

  it('treats an OAuth access_denied callback as cancellation', async () => {
    authSession.result = {
      type: 'success',
      params: { error: 'access_denied', error_description: 'The user denied the request' },
    };

    const error = await loginWithPkce('https://coachwatts.com').catch((caught) => caught);

    expect(isAuthCancellation(error)).toBe(true);
    expect(error).toMatchObject({ code: 'cancelled', stage: 'callback' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('classifies a provider callback error without exposing its description', async () => {
    authSession.result = {
      type: 'success',
      params: { error: 'server_error', error_description: 'private provider detail' },
    };

    const error = await loginWithPkce('https://coachwatts.com').catch((caught) => caught);

    expect(error).toMatchObject({ code: 'provider_failed', stage: 'callback' });
    expect(authErrorMessage(error)).not.toContain('private provider detail');
  });
});

describe('exchangeAuthorizationCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces the OAuth error description from a rejected exchange', async () => {
    global.fetch = vi.fn(async () =>
      response(
        { error: 'invalid_grant', error_description: 'Authorization code expired' },
        { ok: false, status: 400 },
      ),
    ) as unknown as typeof fetch;

    await expect(
      exchangeAuthorizationCode({
        instanceBaseUrl: 'https://coachwatts.com',
        clientId: 'mock-client-id',
        code: 'expired-code',
        redirectUri: 'coachwatts://oauth/callback',
        codeVerifier: 'mock-verifier',
      }),
    ).rejects.toMatchObject({
      code: 'token_exchange_failed',
      stage: 'token_exchange',
      cause: 'Authorization code expired',
    });
  });

  it('rejects a nominally successful response without an access token', async () => {
    global.fetch = vi.fn(async () => response({ token_type: 'Bearer' })) as unknown as typeof fetch;

    await expect(
      exchangeAuthorizationCode({
        instanceBaseUrl: 'https://coachwatts.com',
        clientId: 'mock-client-id',
        code: 'mock-code',
        redirectUri: 'coachwatts://oauth/callback',
        codeVerifier: 'mock-verifier',
      }),
    ).rejects.toMatchObject({ code: 'invalid_token_response', stage: 'token_exchange' });
  });
});

describe('refreshAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGeneration.current = 7;
  });

  it('rotates the refresh token and persists the renewed session', async () => {
    global.fetch = vi.fn(async () =>
      response(successfulToken({ refresh_token: 'rotated-refresh-token', expires_in: 1800 })),
    ) as unknown as typeof fetch;

    await refreshAccessToken({
      instanceBaseUrl: 'https://coachwatts.com',
      refreshToken: 'old-refresh-token',
    });

    expect(global.fetch).toHaveBeenCalledWith('https://coachwatts.com/api/oauth/token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: 'mock-client-id',
        refresh_token: 'old-refresh-token',
      }),
    });
    expect(tokenStorage.saveTokens).toHaveBeenCalledWith({
      accessToken: 'mock-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresIn: 1800,
    });
  });

  it('preserves the existing refresh token when the server does not rotate it', async () => {
    global.fetch = vi.fn(async () =>
      response(successfulToken({ refresh_token: undefined })),
    ) as unknown as typeof fetch;

    await refreshAccessToken({
      instanceBaseUrl: 'https://coachwatts.com',
      refreshToken: 'existing-refresh-token',
    });

    expect(tokenStorage.saveTokens).toHaveBeenCalledWith({
      accessToken: 'mock-access-token',
      refreshToken: 'existing-refresh-token',
      expiresIn: 3600,
    });
  });

  it('preserves the OAuth response and status on refresh rejection', async () => {
    global.fetch = vi.fn(async () =>
      response(
        { error: 'invalid_grant', error_description: 'Refresh token expired' },
        { ok: false, status: 400 },
      ),
    ) as unknown as typeof fetch;

    await expect(
      refreshAccessToken({
        instanceBaseUrl: 'https://coachwatts.com',
        refreshToken: 'expired-refresh-token',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Refresh token expired',
      status: 400,
      body: { error: 'invalid_grant', error_description: 'Refresh token expired' },
    });
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();
  });

  it('does not persist a refresh result after the auth session changes', async () => {
    global.fetch = vi.fn(async () => {
      authGeneration.current = 8;
      return response(successfulToken());
    }) as unknown as typeof fetch;

    await expect(
      refreshAccessToken({
        instanceBaseUrl: 'https://coachwatts.com',
        refreshToken: 'old-refresh-token',
      }),
    ).rejects.toThrow('Auth session changed during token refresh');
    expect(tokenStorage.saveTokens).not.toHaveBeenCalled();
  });
});
