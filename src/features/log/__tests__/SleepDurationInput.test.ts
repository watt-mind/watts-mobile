import { describe, expect, it } from 'vitest';

import { stepSleepHours } from '@/src/features/log/mapLogForm';

describe('stepSleepHours', () => {
  it('clamps negative step calculation so sleep duration cannot drop below 0', () => {
    expect(stepSleepHours('0', -0.5)).toBe('0');
    expect(stepSleepHours('0.5', -0.5)).toBe('0');
    expect(stepSleepHours('', -0.5)).toBe('0');
    expect(stepSleepHours('-0.5', -0.5)).toBe('0');
    expect(stepSleepHours('1.0', -0.5)).toBe('0.5');
    expect(stepSleepHours('7.5', 0.5)).toBe('8');
  });

  it('keeps a comma-decimal value typed on a decimal-pad keyboard (CW-543)', () => {
    // On hu/de/fr/pt/es devices the only decimal key emits ','. Number('7,5') is
    // NaN, which used to fall back to a 0 base and rewrite the field as '0.5' —
    // seven and a half hours of sleep silently became half an hour.
    expect(stepSleepHours('7,5', 0.5)).toBe('8');
    expect(stepSleepHours('7,5', -0.5)).toBe('7');
    expect(stepSleepHours('0,5', -0.5)).toBe('0');
    expect(stepSleepHours('-0,5', -0.5)).toBe('0');
  });

  it('falls back to a 0 base for text it cannot parse', () => {
    expect(stepSleepHours('abc', 0.5)).toBe('0.5');
    expect(stepSleepHours('   ', 0.5)).toBe('0.5');
  });
});
