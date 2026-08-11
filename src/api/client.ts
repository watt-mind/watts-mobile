import { ApiError, isAuthTokenInvalidationError } from '@/src/api/errors';
import {
  bumpAuthSessionGeneration,
  getAuthSessionGeneration,
} from '@/src/auth/authSessionGeneration';
import { refreshAccessToken } from '@/src/auth/oauth';
import { clearTokens, loadTokens, type StoredTokens } from '@/src/auth/tokenStorage';
import { getInstanceUrl } from '@/src/config/instance';

export type UserInfo = {
  sub?: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
};

type ApiFetchOptions = RequestInit & {
  skipAuth?: boolean;
  /**
   * When true, a 401 is returned as-is without attempting refresh or clearing
   * the session. Reserve this for optional capability endpoints that may still
   * be session-only on older instances (e.g. integrations status).
   */
  softUnauthorized?: boolean;
  /**
   * Override the default request timeout (ms). Pass a non-positive value or `Infinity`
   * to opt out of the timeout entirely (e.g. long-running streams).
   */
  timeoutMs?: number;
};

/** Default abort deadline for a JSON request — a stalled socket must not spin forever. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** Multipart/FormData bodies are uploads over mobile links; they need a lot more headroom. */
export const UPLOAD_REQUEST_TIMEOUT_MS = 120_000;

function isMultipartBody(body: BodyInit | null | undefined): boolean {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function resolveTimeoutMs(options: ApiFetchOptions): number {
  if (typeof options.timeoutMs === 'number') {
    return options.timeoutMs;
  }
  return isMultipartBody(options.body) ? UPLOAD_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS;
}

/**
 * Build the AbortSignal for one attempt (CW-459). A caller-supplied signal is always
 * honoured; the default timeout is composed onto it via `AbortSignal.any` when available
 * (Expo's winter runtime polyfills both `any` and `timeout` — see expo/src/winter/AbortSignal).
 * If a runtime lacks them, the caller's signal wins and the timeout is skipped rather than
 * silently discarding the caller's cancellation.
 */
function resolveRequestSignal(options: ApiFetchOptions): AbortSignal | undefined {
  const callerSignal = options.signal ?? undefined;
  const timeoutMs = resolveTimeoutMs(options);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortSignal?.timeout !== 'function') {
    return callerSignal;
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) {
    return timeoutSignal;
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([callerSignal, timeoutSignal]);
  }
  return callerSignal;
}

let refreshPromise: Promise<StoredTokens> | null = null;
let refreshPromiseGeneration = -1;
let onAuthFailure: (() => void) | null = null;

export function setAuthFailureHandler(handler: (() => void) | null) {
  onAuthFailure = handler;
}

/** Invoke the registered AuthContext failure handler (e.g. from coachChatFetch). */
export function notifyAuthFailure(): void {
  onAuthFailure?.();
}

export { bumpAuthSessionGeneration, getAuthSessionGeneration };

function resolveUrl(instanceBaseUrl: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath.startsWith('/api/')) {
    return `${instanceBaseUrl}${normalizedPath}`;
  }
  return `${instanceBaseUrl}/api${normalizedPath}`;
}

/**
 * Shared single-flight refresh — use from apiFetch and coachChatFetch to avoid parallel rotations.
 *
 * The refresh token is read from storage *inside* the single-flight closure rather than
 * being passed in by the caller (CW-458). A caller snapshot taken before the await can be
 * stale by the time the refresh actually starts: `refreshPromise` is cleared in `.finally()`
 * as soon as a concurrent refresh settles, and `refreshAccessToken` persists the rotated
 * tokens before resolving. A second refresh started with an already-consumed single-use
 * refresh token gets `invalid_grant`, which `failAuthSession` would then treat as a genuine
 * invalidation and wipe the freshly-minted, valid session.
 */
export async function singleFlightRefresh(instanceBaseUrl: string): Promise<StoredTokens> {
  const generation = getAuthSessionGeneration();
  if (!refreshPromise || refreshPromiseGeneration !== generation) {
    refreshPromiseGeneration = generation;
    refreshPromise = (async () => {
      const stored = await loadTokens();
      if (!stored?.refreshToken) {
        // Treated as an invalidation by callers (isAuthTokenInvalidationError): there is
        // no credential left to recover the session with.
        throw new ApiError('No refresh token available', 401);
      }
      const tokens = await refreshAccessToken({
        instanceBaseUrl,
        refreshToken: stored.refreshToken,
      });
      if (generation !== getAuthSessionGeneration()) {
        throw new Error('Auth session changed during token refresh');
      }
      return tokens;
    })().finally(() => {
      if (refreshPromiseGeneration === generation) {
        refreshPromise = null;
      }
    });
  }
  return refreshPromise;
}

async function failAuthSession(expectedGeneration: number, reason: string): Promise<void> {
  if (expectedGeneration !== getAuthSessionGeneration()) {
    if (__DEV__) {
      console.warn(
        `[auth] Ignoring stale session failure (${reason}); generation ${expectedGeneration} ≠ ${getAuthSessionGeneration()}`,
      );
    }
    return;
  }
  if (__DEV__) {
    console.warn(`[auth] Clearing session: ${reason}`);
  }
  // Generation-tagged clear: a newer login's tokens are not wiped if this races.
  await clearTokens(expectedGeneration);
  if (expectedGeneration !== getAuthSessionGeneration()) {
    if (__DEV__) {
      console.warn(
        `[auth] Session was replaced during clear (${reason}); not invoking auth failure handler`,
      );
    }
    return;
  }
  onAuthFailure?.();
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const instanceBaseUrl = await getInstanceUrl();
  if (!instanceBaseUrl) {
    throw new Error('Instance URL is not configured');
  }

  // Capture before the network round-trip so a re-login during the request cannot
  // make this handler clear the new session when the stale response finally 401s.
  const sessionGeneration = getAuthSessionGeneration();

  const url = resolveUrl(instanceBaseUrl, path);
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // The access token this request actually went out with. Used after a 401 to detect that a
  // concurrent request already refreshed while this one was on the wire (CW-458).
  let requestAccessToken: string | undefined;
  if (!options.skipAuth) {
    const tokens = await loadTokens();
    if (tokens?.accessToken) {
      requestAccessToken = tokens.accessToken;
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    }
  }

  const retryWithAccessToken = async (accessToken: string): Promise<Response> => {
    const retryHeaders = new Headers(options.headers);
    if (!retryHeaders.has('Accept')) {
      retryHeaders.set('Accept', 'application/json');
    }
    retryHeaders.set('Authorization', `Bearer ${accessToken}`);
    // Fresh signal: the retry gets its own timeout budget rather than inheriting the
    // (possibly nearly exhausted) deadline of the first attempt.
    return fetch(url, {
      ...options,
      headers: retryHeaders,
      signal: resolveRequestSignal(options),
    });
  };

  const response = await fetch(url, {
    ...options,
    headers,
    signal: resolveRequestSignal(options),
  });

  if (response.status !== 401 || options.skipAuth) {
    return response;
  }

  // Optional / capability endpoints (e.g. integrations status on older instances)
  // often return 401 for Bearer even when the session is fine. Do not refresh or
  // clear tokens — that would bounce the user to login or burn single-use refresh tokens.
  if (options.softUnauthorized) {
    return response;
  }

  if (sessionGeneration !== getAuthSessionGeneration()) {
    if (__DEV__) {
      console.warn(`[auth] Ignoring 401 on ${path}; auth session was replaced during request`);
    }
    return response;
  }

  let tokens = await loadTokens();

  // A concurrent request may have already completed a refresh while this request was in
  // flight — the stored access token is then newer than the one this request used. Retry
  // with it instead of starting a second refresh: the stored refresh token has already been
  // rotated, so refreshing again would send a consumed single-use token, get invalid_grant
  // back, and clear the session that was just successfully renewed (CW-458).
  if (requestAccessToken && tokens?.accessToken && tokens.accessToken !== requestAccessToken) {
    const retry = await retryWithAccessToken(tokens.accessToken);
    if (retry.status !== 401) {
      return retry;
    }
    // The newer token was rejected too — fall through to a genuine refresh.
    tokens = await loadTokens();
  }

  if (!tokens?.refreshToken) {
    await failAuthSession(sessionGeneration, `401 on ${path} with no refresh token`);
    return response;
  }

  try {
    const refreshed = await singleFlightRefresh(instanceBaseUrl);
    const retry = await retryWithAccessToken(refreshed.accessToken);
    if (retry.status === 401) {
      await failAuthSession(sessionGeneration, `401 after refresh on ${path}`);
    }
    return retry;
  } catch (err) {
    if (isAuthTokenInvalidationError(err)) {
      await failAuthSession(sessionGeneration, `refresh invalidated for ${path}`);
      return response;
    }
    // Refresh failed for a reason other than an explicit invalid-token response
    // (network error, timeout, 5xx from the token endpoint, etc). Don't clear the
    // session (correct — CW-135), but also don't return the original request's
    // stale 401: that response's HTTP status carries no information about *why*
    // refresh failed, so a caller inspecting response.status (e.g. fetchUserInfo,
    // whose ApiError feeds AuthContext.bootstrap's isReachabilityError check) would
    // misclassify a transient connectivity/server problem as a genuine auth failure.
    // Propagate the underlying error instead so it can be classified correctly.
    throw err;
  }
}

export async function fetchUserInfo(): Promise<UserInfo> {
  const response = await apiFetch('/api/oauth/userinfo');
  if (!response.ok) {
    // Preserve the HTTP status so callers (e.g. AuthContext.bootstrap) can distinguish
    // a genuine auth failure (401/403) from a transient connectivity/server error (5xx)
    // instead of treating every userinfo failure as "session invalid".
    throw new ApiError(`userinfo failed (${response.status})`, response.status);
  }
  return (await response.json()) as UserInfo;
}
