/**
 * HTTP failure with status/body preserved for callers and Sentry.
 * Prefer throwing this from API helpers; map to user copy via {@link friendlyError}.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function httpStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  ) {
    return (err as { status: number }).status;
  }
  return undefined;
}

function isConnectivityError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error')
  );
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  const msg = err.message.toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted');
}

/**
 * True when an error's `message` is already end-user copy, flagged by the
 * thrower via `userFacing: true` (see `InstanceTransportError` in
 * `src/config/instanceTransport.ts`). Without this, an actionable refusal —
 * "this server must use https://" — would be replaced by a caller's generic
 * fallback and the user would never learn what to fix.
 */
function isUserFacingError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as { userFacing?: unknown }).userFacing === true &&
    err.message.trim() !== ''
  );
}

/**
 * Map a thrown error to human copy for UI. Keeps raw errors intact for Sentry.
 */
export function friendlyError(err: unknown, fallback: string): string {
  if (isUserFacingError(err)) {
    return (err as Error).message;
  }

  const status = httpStatus(err);
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return 'Session expired — sign in again';
    }
    if (status === 404) {
      return 'Not found on your Coach Watts instance';
    }
    if (status === 429) {
      if (err instanceof Error && err.message.trim()) {
        return err.message;
      }
      return 'Limit reached — try again later';
    }
    if (status >= 500) {
      return `Server error (${status}) — try again shortly`;
    }
  }

  if (isConnectivityError(err)) {
    return "Can't reach your Coach Watts instance — check your connection";
  }

  if (isTimeoutError(err)) {
    return 'Request timed out — try again';
  }

  return fallback;
}

/**
 * Returns true if an error from token refresh indicates explicit unrecoverable token invalidation
 * (HTTP 400 Bad Request or HTTP 401 Unauthorized from the OAuth token endpoint).
 * Network errors (TypeError) and server errors (HTTP 5xx) return false.
 */
export function isAuthTokenInvalidationError(err: unknown): boolean {
  const status = httpStatus(err);
  return status === 400 || status === 401;
}

/**
 * Returns true if an error indicates the instance/network is temporarily unreachable
 * (offline, DNS failure, request timeout, or HTTP 5xx) rather than a genuine auth failure.
 * Used to avoid treating transient connectivity blips as "this session is invalid" —
 * e.g. a bootstrap userinfo fetch that fails because the device is offline should not
 * be conflated with a definitive 401/403 that indicates the session itself was rejected.
 */
export function isReachabilityError(err: unknown): boolean {
  const status = httpStatus(err);
  if (status !== undefined) {
    return status >= 500;
  }
  return isConnectivityError(err) || isTimeoutError(err);
}
