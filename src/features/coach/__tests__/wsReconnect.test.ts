import { describe, expect, it } from 'vitest';

import {
  nextReconnectDelayMs,
  shouldGiveUpReconnect,
  WS_MAX_RECONNECT_ATTEMPTS,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
} from '../wsReconnect';

describe('nextReconnectDelayMs (CW-494b)', () => {
  it('backs off exponentially from the base delay', () => {
    expect(nextReconnectDelayMs(1)).toBe(WS_RECONNECT_BASE_MS);
    expect(nextReconnectDelayMs(2)).toBe(6000);
    expect(nextReconnectDelayMs(3)).toBe(12000);
    expect(nextReconnectDelayMs(4)).toBe(24000);
    expect(nextReconnectDelayMs(5)).toBe(48000);
  });

  it('caps the delay', () => {
    expect(nextReconnectDelayMs(6)).toBe(WS_RECONNECT_MAX_MS);
    expect(nextReconnectDelayMs(50)).toBe(WS_RECONNECT_MAX_MS);
  });

  it('never returns a shorter delay than the flat 3s loop it replaced', () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect(nextReconnectDelayMs(attempt)).toBeGreaterThanOrEqual(WS_RECONNECT_BASE_MS);
    }
  });

  it('treats junk attempt numbers as the first attempt', () => {
    expect(nextReconnectDelayMs(0)).toBe(WS_RECONNECT_BASE_MS);
    expect(nextReconnectDelayMs(-3)).toBe(WS_RECONNECT_BASE_MS);
    expect(nextReconnectDelayMs(1.7)).toBe(WS_RECONNECT_BASE_MS);
  });

  it('honours overridden base/cap', () => {
    expect(nextReconnectDelayMs(3, { baseMs: 1000, maxMs: 3000 })).toBe(3000);
  });
});

describe('shouldGiveUpReconnect', () => {
  it('keeps retrying below the budget and stops at it', () => {
    expect(shouldGiveUpReconnect(0)).toBe(false);
    expect(shouldGiveUpReconnect(WS_MAX_RECONNECT_ATTEMPTS - 1)).toBe(false);
    expect(shouldGiveUpReconnect(WS_MAX_RECONNECT_ATTEMPTS)).toBe(true);
    expect(shouldGiveUpReconnect(WS_MAX_RECONNECT_ATTEMPTS + 10)).toBe(true);
  });

  it('bounds total retry time — an instance with no websocket endpoint is not hit forever', () => {
    let total = 0;
    let attempt = 1;
    while (!shouldGiveUpReconnect(attempt)) {
      total += nextReconnectDelayMs(attempt);
      attempt += 1;
    }
    // The old loop was one token request every 3s for as long as the screen
    // stayed open; this budget is a handful of requests spread over minutes.
    expect(attempt).toBeLessThanOrEqual(WS_MAX_RECONNECT_ATTEMPTS);
    expect(total).toBeGreaterThan(60_000);
  });
});
