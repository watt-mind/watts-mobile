/**
 * Reconnect policy for the coach realtime socket.
 *
 * The old loop retried on a flat 3s timer forever while the Coach tab was
 * mounted, and a failed token fetch inside `onopen` closed the socket straight
 * back into it. On a self-hosted instance without `/api/websocket-token`, or
 * simply offline, that is a token request every 3 seconds for as long as the
 * screen is open — continuous radio wake-ups for a connection that will never
 * succeed (CW-494b).
 */

export const WS_RECONNECT_BASE_MS = 3000;
export const WS_RECONNECT_MAX_MS = 60000;
/** Consecutive failures after which we stop trying and stay on polling. */
export const WS_MAX_RECONNECT_ATTEMPTS = 6;
/** A socket that never fires open/error/close is closed after this long. */
export const WS_CONNECT_TIMEOUT_MS = 10000;

/**
 * Delay before reconnect attempt `attempt` (1-based): 3s, 6s, 12s, 24s, 48s,
 * then capped at 60s.
 */
export function nextReconnectDelayMs(
  attempt: number,
  options?: { baseMs?: number; maxMs?: number },
): number {
  const base = options?.baseMs ?? WS_RECONNECT_BASE_MS;
  const max = options?.maxMs ?? WS_RECONNECT_MAX_MS;
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const delay = base * 2 ** (safeAttempt - 1);
  return Math.min(delay, max);
}

/**
 * Give up after {@link WS_MAX_RECONNECT_ATTEMPTS} consecutive failures — the
 * next attempt would be the (max + 1)th. Realtime stays off and the chat runs
 * on the polling fallback until the screen is reopened.
 */
export function shouldGiveUpReconnect(
  consecutiveFailures: number,
  maxAttempts: number = WS_MAX_RECONNECT_ATTEMPTS,
): boolean {
  return consecutiveFailures >= maxAttempts;
}
