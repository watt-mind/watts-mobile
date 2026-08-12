import { getItemAsync, setItemAsync } from '@/src/storage/secureStorage';

import { DEFAULT_INSTANCE_URL } from './env';
import { assertInstanceTransportAllowed, normalizeInstanceUrl } from './instanceTransport';

const INSTANCE_KEY = 'cw.instanceBaseUrl';

/**
 * Re-exported from `./instanceTransport` (the pure module) so the transport
 * policy and its callers share one normalization implementation.
 */
export { normalizeInstanceUrl };

export async function getInstanceUrl(): Promise<string | null> {
  return getItemAsync(INSTANCE_KEY);
}

export async function setInstanceUrl(url: string): Promise<string> {
  const normalized = normalizeInstanceUrl(url);
  if (!normalized) {
    throw new Error('Instance URL is required');
  }
  // Last line of defence: an insecure public URL must never reach storage, from
  // any caller — once persisted every request would leak the Bearer token.
  assertInstanceTransportAllowed(normalized);
  await setItemAsync(INSTANCE_KEY, normalized);
  return normalized;
}

export function getDefaultInstanceUrl(): string {
  return normalizeInstanceUrl(DEFAULT_INSTANCE_URL);
}

/** Cheap reachability check before starting OAuth. */
export async function validateInstanceReachability(baseUrl: string): Promise<void> {
  const normalized = normalizeInstanceUrl(baseUrl);
  if (!normalized) {
    throw new Error('Enter a valid instance URL');
  }

  // Before the fetch: refuse plaintext to a public host outright rather than
  // proving a cleartext endpoint reachable and then handing it a token.
  assertInstanceTransportAllowed(normalized);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // Public list endpoint — any non-5xx / non-network response proves reachability.
    const response = await fetch(`${normalized}/api/oauth/public-apps`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (response.status >= 500) {
      throw new Error(`Instance returned HTTP ${response.status}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timed out reaching instance');
    }
    if (error instanceof Error && error.message.startsWith('Instance returned')) {
      throw error;
    }
    throw new Error('Could not reach instance — check the URL and network');
  } finally {
    clearTimeout(timeout);
  }
}
