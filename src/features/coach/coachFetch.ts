import { isAuthTokenInvalidationError } from '@/src/api/errors';
import { fetch as expoFetch } from 'expo/fetch';

import { getAuthSessionGeneration, notifyAuthFailure, singleFlightRefresh } from '@/src/api/client';
import { clearTokens, loadTokens } from '@/src/auth/tokenStorage';
import { getInstanceUrl } from '@/src/config/instance';

async function failAuthSession(expectedGeneration: number, reason: string): Promise<void> {
  if (expectedGeneration !== getAuthSessionGeneration()) {
    if (__DEV__) {
      console.warn(
        `[auth] Ignoring stale coach session failure (${reason}); generation ${expectedGeneration} ≠ ${getAuthSessionGeneration()}`,
      );
    }
    return;
  }
  if (__DEV__) {
    console.warn(`[auth] Clearing session (coach): ${reason}`);
  }
  await clearTokens(expectedGeneration);
  if (expectedGeneration !== getAuthSessionGeneration()) {
    return;
  }
  notifyAuthFailure();
}

/**
 * Time-to-first-byte budget for a coach chat request (CW-339).
 *
 * Deliberately generous: the coach can take a while to start emitting, and the
 * only thing this bounds is *headers*, not the length of the streamed answer.
 */
export const COACH_CHAT_TTFB_TIMEOUT_MS = 30_000;

/**
 * Thrown when response headers never arrive inside {@link COACH_CHAT_TTFB_TIMEOUT_MS}.
 *
 * The message deliberately contains "timed out" so `friendlyError` maps it to
 * actionable copy instead of leaving a bare `AbortError` for the UI, and it
 * carries no `status`, so `isAuthTokenInvalidationError` keeps returning false
 * and a timeout is never misread as an auth failure (CW-460).
 */
export class CoachChatTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `Coach request timed out after ${Math.round(timeoutMs / 1000)}s — the server never responded`,
    );
    this.name = 'CoachChatTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * `expoFetch` with a **time-to-first-byte** timeout (CW-339).
 *
 * `expoFetch` resolves as soon as response headers land; the SSE body streams
 * afterwards. So the timer is cleared the moment that promise settles — a long
 * coach answer must never be killed mid-stream.
 *
 * A caller-supplied `init.signal` (the AI SDK's `stop()` signal) is *composed*
 * with the timeout controller, never replaced. The bridge from the caller's
 * signal is left attached after headers arrive so `stop()` can still abort the
 * streaming body; only the timer is torn down.
 */
async function fetchWithTtfbTimeout(
  url: string,
  init: RequestInit | undefined,
  headers: Headers,
  timeoutMs: number = COACH_CHAT_TTFB_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init?.signal ?? null;
  const forwardAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener('abort', forwardAbort);
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  // Rejecting the race directly (rather than relying on the fetch to reject on
  // abort) guarantees the caller sees the timeout error and not whatever
  // `AbortError` the platform synthesises. `reject` before `abort` so the race
  // is already settled by the time the abort listeners run.
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const timeoutError = new CoachChatTimeoutError(timeoutMs);
      reject(timeoutError);
      controller.abort(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      expoFetch(url, { ...init, headers, signal: controller.signal }),
      expiry,
    ]);
  } catch (err) {
    // No body to keep alive on the failure path — drop the bridge.
    callerSignal?.removeEventListener('abort', forwardAbort);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streaming-capable fetch for AI SDK transport.
 * Uses expo/fetch (required for RN stream parsing) + Bearer auth / refresh.
 * Shares single-flight refresh with `apiFetch` so parallel 401s don't rotate the same token twice.
 */
export async function coachChatFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const instanceBaseUrl = await getInstanceUrl();
  if (!instanceBaseUrl) {
    throw new Error('Instance URL is not configured');
  }

  const sessionGeneration = getAuthSessionGeneration();

  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/plain, application/json');
  }

  const tokens = await loadTokens();
  if (tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  const response = await fetchWithTtfbTimeout(url, init, headers);

  if (response.status !== 401) {
    return response;
  }

  if (sessionGeneration !== getAuthSessionGeneration()) {
    if (__DEV__) {
      console.warn('[auth] Ignoring coach 401; auth session was replaced during request');
    }
    return response;
  }

  if (!tokens?.refreshToken) {
    await failAuthSession(sessionGeneration, `401 on coach fetch with no refresh token`);
    return response;
  }

  try {
    const refreshed = await singleFlightRefresh(instanceBaseUrl);
    const retryHeaders = new Headers(init?.headers);
    if (!retryHeaders.has('Accept')) {
      retryHeaders.set('Accept', 'text/plain, application/json');
    }
    retryHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`);
    const retry = await fetchWithTtfbTimeout(url, init, retryHeaders);
    if (retry.status === 401) {
      await failAuthSession(sessionGeneration, `401 after refresh on coach fetch`);
    }
    return retry;
  } catch (err) {
    if (isAuthTokenInvalidationError(err)) {
      await failAuthSession(sessionGeneration, `refresh invalidated for coach fetch`);
      return response;
    }
    // Refresh failed for a reason other than explicit token invalidation (network error,
    // timeout, 5xx from the token endpoint). Mirror apiFetch (CW-135/CW-276): don't clear
    // the session, but don't return the original stale 401 either — its status says nothing
    // about *why* refresh failed, so callers would misclassify a transient connectivity or
    // server problem as a genuine auth failure. Propagate the real error (CW-460).
    throw err;
  }
}

export async function resolveChatMessagesApiUrl(): Promise<string> {
  const instanceBaseUrl = await getInstanceUrl();
  if (!instanceBaseUrl) {
    throw new Error('Instance URL is not configured');
  }
  return `${instanceBaseUrl.replace(/\/+$/, '')}/api/chat/messages`;
}
