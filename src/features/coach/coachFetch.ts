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

  const response = await expoFetch(url, { ...init, headers });

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
    const retry = await expoFetch(url, { ...init, headers: retryHeaders });
    if (retry.status === 401) {
      await failAuthSession(sessionGeneration, `401 after refresh on coach fetch`);
    }
    return retry;
  } catch (err) {
    if (isAuthTokenInvalidationError(err)) {
      await failAuthSession(sessionGeneration, `refresh invalidated for coach fetch`);
    }
    return response;
  }
}

export async function resolveChatMessagesApiUrl(): Promise<string> {
  const instanceBaseUrl = await getInstanceUrl();
  if (!instanceBaseUrl) {
    throw new Error('Instance URL is not configured');
  }
  return `${instanceBaseUrl.replace(/\/+$/, '')}/api/chat/messages`;
}
