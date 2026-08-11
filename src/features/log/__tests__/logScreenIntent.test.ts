import { describe, expect, it } from 'vitest';

import {
  type LogScreenIntentInput,
  resolveDefaultLogSheet,
  resolveLogScreenIntent,
} from '../logScreenIntent';

function intent(overrides: Partial<LogScreenIntentInput> = {}) {
  return resolveLogScreenIntent({
    nutritionEnabled: true,
    onPhotoMealRoute: false,
    handledPhotoToken: null,
    untokenedCameraBusy: false,
    ...overrides,
  });
}

describe('resolveLogScreenIntent', () => {
  it('does nothing when there are no params and no default-view preference', () => {
    const result = intent();
    expect(result.open).toBeNull();
    expect(result.clearParams).toEqual([]);
  });

  it.each([
    ['meal', 'meal'],
    ['water', 'water'],
    ['wellness', 'wellness'],
    ['measurement', 'measurement'],
  ] as const)('opens the %s sheet for ?action=%s', (action, expected) => {
    const result = intent({ action });
    expect(result.open).toBe(expected);
    expect(result.clearParams).toEqual(['action', 'section', 't']);
  });

  it('opens the nutrition detail sheet for ?section=nutrition', () => {
    const result = intent({ section: 'nutrition' });
    expect(result.open).toBe('nutritionDetail');
    expect(result.clearParams).toContain('section');
  });

  it('opens the measurements detail sheet for ?section=measurements', () => {
    const result = intent({ section: 'measurements' });
    expect(result.open).toBe('measurementsDetail');
    expect(result.clearParams).toContain('section');
  });

  it('opens the wellness sheet for the legacy ?section=wellness deep link', () => {
    const result = intent({ section: 'wellness' });
    expect(result.open).toBe('wellness');
  });

  it('clears ?section=wellness so a mounted Log tab cannot re-open the sheet', () => {
    // Reproduces the re-open loop: daily check-in routes to ?section=wellness,
    // and every later tab switch re-ran the effect with the param still set.
    const first = intent({ section: 'wellness' });
    expect(first.open).toBe('wellness');
    expect(first.clearParams).toContain('section');

    // After the params are cleared the effect re-runs with nothing to consume.
    const afterClear = intent({});
    expect(afterClear.open).toBeNull();
  });

  it('still clears an unrecognised section rather than leaving it armed', () => {
    const result = intent({ section: 'bogus' });
    expect(result.open).toBeNull();
    expect(result.clearParams).toEqual(['action', 'section', 't']);
  });

  it('skips the nutrition detail sheet when nutrition tracking is off', () => {
    const result = intent({ section: 'nutrition', nutritionEnabled: false });
    expect(result.open).toBeNull();
    expect(result.clearParams).toContain('section');
  });

  it('prefers ?action= over ?section= when both are present', () => {
    const result = intent({ action: 'meal', section: 'nutrition' });
    expect(result.open).toBe('meal');
  });

  describe('camera launches', () => {
    it('pushes the photo-meal route and records the launch token', () => {
      const result = intent({ action: 'camera', token: 'abc' });
      expect(result.open).toBe('photoMealRoute');
      expect(result.handledPhotoToken).toBe('abc');
      expect(result.clearParams).toEqual(['action', 't']);
    });

    it('ignores a replay of an already-handled launch token', () => {
      const result = intent({ action: 'camera', token: 'abc', handledPhotoToken: 'abc' });
      expect(result.open).toBeNull();
      expect(result.clearParams).toEqual([]);
    });

    it('handles a new launch token after an earlier one', () => {
      const result = intent({ action: 'camera', token: 'def', handledPhotoToken: 'abc' });
      expect(result.open).toBe('photoMealRoute');
      expect(result.handledPhotoToken).toBe('def');
    });

    it('claims the guard for an untokened launch and ignores a concurrent one', () => {
      const first = intent({ action: 'camera' });
      expect(first.open).toBe('photoMealRoute');
      expect(first.claimUntokenedCamera).toBe(true);

      const concurrent = intent({ action: 'camera', untokenedCameraBusy: true });
      expect(concurrent.open).toBeNull();
      expect(concurrent.clearParams).toEqual([]);
    });

    it('does not open photo logging when nutrition tracking is off', () => {
      const result = intent({ action: 'camera', token: 'abc', nutritionEnabled: false });
      expect(result.open).toBeNull();
      expect(result.clearParams).toEqual(['action', 't']);
      expect(result.releaseUntokenedCamera).toBe(true);
    });

    it('does not stack a second fullscreen photo-meal route', () => {
      const result = intent({ action: 'camera', token: 'abc', onPhotoMealRoute: true });
      expect(result.open).toBeNull();
      expect(result.releaseUntokenedCamera).toBe(true);
    });

    it('marks the default view as settled so a camera launch is not followed by it', () => {
      const result = intent({ action: 'camera', token: 'abc', preference: 'wellness' });
      expect(result.open).toBe('photoMealRoute');
      expect(result.markDefaultViewApplied).toBe(true);
    });
  });

  describe('default log view preference', () => {
    it.each([
      ['nutrition', 'nutritionDetail'],
      ['wellness', 'wellness'],
      ['measurements', 'measurementsDetail'],
    ] as const)('opens %s when that is the saved default', (preference, expected) => {
      const result = intent({ preference, preferenceReady: true });
      expect(result.open).toBe(expected);
      expect(result.markDefaultViewApplied).toBe(true);
      expect(result.clearParams).toEqual([]);
    });

    it('opens nothing for "auto"', () => {
      expect(intent({ preference: 'auto', preferenceReady: true }).open).toBeNull();
    });

    it('opens nothing for the legacy "recovery" value, which has no sheet', () => {
      expect(intent({ preference: 'recovery', preferenceReady: true }).open).toBeNull();
    });

    it('skips the nutrition default when nutrition tracking is off', () => {
      expect(
        intent({ preference: 'nutrition', preferenceReady: true, nutritionEnabled: false }).open,
      ).toBeNull();
    });

    it('waits for the preference to hydrate before deciding', () => {
      const hydrating = intent({ preference: 'auto', preferenceReady: false });
      expect(hydrating.open).toBeNull();
      expect(hydrating.markDefaultViewApplied).toBe(false);

      const hydrated = intent({ preference: 'wellness', preferenceReady: true });
      expect(hydrated.open).toBe('wellness');
    });

    it('applies at most once per screen instance', () => {
      const again = intent({
        preference: 'wellness',
        preferenceReady: true,
        defaultViewApplied: true,
      });
      expect(again.open).toBeNull();
    });

    it('lets a deep link win, and does not open the default on the param-clear re-run', () => {
      const deepLink = intent({
        section: 'measurements',
        preference: 'wellness',
        preferenceReady: true,
      });
      expect(deepLink.open).toBe('measurementsDetail');
      expect(deepLink.markDefaultViewApplied).toBe(true);

      // The screen clears the params, which re-runs the effect with none left.
      const afterClear = intent({
        preference: 'wellness',
        preferenceReady: true,
        defaultViewApplied: true,
      });
      expect(afterClear.open).toBeNull();
    });
  });
});

describe('resolveDefaultLogSheet', () => {
  it('maps each preference to the surface the Log screen actually has', () => {
    expect(resolveDefaultLogSheet('auto', true)).toBeNull();
    expect(resolveDefaultLogSheet('recovery', true)).toBeNull();
    expect(resolveDefaultLogSheet('wellness', true)).toBe('wellness');
    expect(resolveDefaultLogSheet('measurements', true)).toBe('measurementsDetail');
    expect(resolveDefaultLogSheet('nutrition', true)).toBe('nutritionDetail');
    expect(resolveDefaultLogSheet('nutrition', false)).toBeNull();
  });
});
