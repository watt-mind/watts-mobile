import { describe, expect, it } from 'vitest';

import { validateAdHocForm } from '../adHocForm';

describe('validateAdHocForm', () => {
  it('accepts web defaults', () => {
    const result = validateAdHocForm({
      type: 'Ride',
      durationText: '60',
      intensity: 'Endurance',
      notes: '',
    });
    expect(result).toEqual({
      ok: true,
      payload: {
        type: 'Ride',
        durationMinutes: 60,
        intensity: 'Endurance',
        notes: '',
      },
    });
  });

  it('rejects zero or invalid duration', () => {
    expect(
      validateAdHocForm({
        type: 'Run',
        durationText: '0',
        intensity: 'Tempo',
        notes: '',
      }).ok,
    ).toBe(false);
    expect(
      validateAdHocForm({
        type: 'Run',
        durationText: '',
        intensity: 'Tempo',
        notes: '',
      }).ok,
    ).toBe(false);
  });

  it('rejects durations that round to zero minutes', () => {
    const result = validateAdHocForm({
      type: 'Run',
      durationText: '0.4',
      intensity: 'Tempo',
      notes: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Enter a duration of at least 1 minute.');
    }
  });

  it('accepts a duration that rounds up to one minute', () => {
    const result = validateAdHocForm({
      type: 'Run',
      durationText: '0.6',
      intensity: 'Tempo',
      notes: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.durationMinutes).toBe(1);
    }
  });

  /**
   * `45,5` from a comma-decimal keyboard is a duration greater than zero — the old
   * `Number()` parse turned it into NaN and told the athlete otherwise (CW-556).
   */
  it('accepts comma-decimal and grouped durations (CW-556)', () => {
    const comma = validateAdHocForm({
      type: 'Ride',
      durationText: '45,5',
      intensity: 'Endurance',
      notes: '',
    });
    expect(comma.ok).toBe(true);
    if (comma.ok) expect(comma.payload.durationMinutes).toBe(46);

    const grouped = validateAdHocForm({
      type: 'Ride',
      durationText: '1 234,5',
      intensity: 'Endurance',
      notes: '',
    });
    expect(grouped.ok).toBe(true);
    if (grouped.ok) expect(grouped.payload.durationMinutes).toBe(1235);

    const mixed = validateAdHocForm({
      type: 'Ride',
      durationText: '1.234,56',
      intensity: 'Endurance',
      notes: '',
    });
    expect(mixed.ok).toBe(true);
    if (mixed.ok) expect(mixed.payload.durationMinutes).toBe(1235);
  });

  it('still rejects unparseable durations (CW-556)', () => {
    for (const durationText of ['abc', '', '   ', '1,2,3.4', '-5', '0,0']) {
      const result = validateAdHocForm({
        type: 'Run',
        durationText,
        intensity: 'Tempo',
        notes: '',
      });
      expect(result.ok, JSON.stringify(durationText)).toBe(false);
      if (!result.ok) expect(result.error).toBe('Enter a duration greater than zero.');
    }
  });

  it('rejects a comma-decimal duration that rounds to zero minutes (CW-556)', () => {
    const result = validateAdHocForm({
      type: 'Run',
      durationText: '0,4',
      intensity: 'Tempo',
      notes: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Enter a duration of at least 1 minute.');
  });

  it('trims notes', () => {
    const result = validateAdHocForm({
      type: 'Swim',
      durationText: '45.4',
      intensity: 'Recovery',
      notes: '  high cadence  ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.durationMinutes).toBe(45);
      expect(result.payload.notes).toBe('high cadence');
    }
  });
});
