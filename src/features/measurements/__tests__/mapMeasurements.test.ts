import { describe, expect, it, vi } from 'vitest';

import {
  emptyMeasurementForm,
  fromDisplayValue,
  measurementFormHasContent,
  parseBodyMeasurementsResponse,
  toCreatePayload,
  toDisplayValue,
} from '../mapMeasurements';

describe('mapMeasurements', () => {
  it('requires a numeric value (and custom name when custom)', () => {
    expect(measurementFormHasContent(emptyMeasurementForm())).toBe(false);
    expect(measurementFormHasContent({ ...emptyMeasurementForm(), value: '72.5' })).toBe(true);
    expect(
      measurementFormHasContent({
        ...emptyMeasurementForm('custom'),
        value: '30',
        customName: '',
      }),
    ).toBe(false);
    expect(
      measurementFormHasContent({
        ...emptyMeasurementForm('custom'),
        value: '30',
        customName: 'Flexed bicep',
      }),
    ).toBe(true);
  });

  it('rejects negative or zero values instead of building a payload', () => {
    expect(
      toCreatePayload(
        { ...emptyMeasurementForm('weight'), value: '-165' },
        { weightUnits: 'Pounds', distanceUnits: 'Miles' },
      ),
    ).toBeNull();
    expect(
      toCreatePayload(
        { ...emptyMeasurementForm('waist'), value: '0' },
        { weightUnits: 'Kilograms', distanceUnits: 'Kilometers' },
      ),
    ).toBeNull();
  });

  it('converts lbs display to kg for create payload', () => {
    const payload = toCreatePayload(
      { ...emptyMeasurementForm('weight'), value: '165' },
      { weightUnits: 'Pounds', distanceUnits: 'Miles' },
    );
    expect(payload?.unit).toBe('kg');
    expect(payload?.value).toBeCloseTo(74.84, 1);
    expect(payload?.metricKey).toBe('weight');
  });

  it('converts inches display to cm for length metrics', () => {
    const payload = toCreatePayload(
      { ...emptyMeasurementForm('waist'), value: '32' },
      { weightUnits: 'Pounds', distanceUnits: 'Miles' },
    );
    expect(payload?.unit).toBe('cm');
    expect(payload?.value).toBeCloseTo(81.28, 1);
  });

  it('builds custom metric keys', () => {
    const payload = toCreatePayload(
      {
        ...emptyMeasurementForm('custom'),
        customName: 'Left Bicep!',
        customUnit: 'cm',
        value: '35',
      },
      { weightUnits: 'Kilograms', distanceUnits: 'Kilometers' },
    );
    expect(payload?.metricKey).toBe('custom:left_bicep');
    expect(payload?.displayName).toBe('Left Bicep!');
    expect(payload?.value).toBe(35);
  });

  it('parses list + latest map from API response', () => {
    const snap = parseBodyMeasurementsResponse({
      items: [
        {
          id: '1',
          metricKey: 'waist',
          displayName: null,
          value: 80,
          unit: 'cm',
          recordedAt: '2026-07-20T08:00:00.000Z',
          source: 'manual_measurement',
          notes: null,
        },
      ],
      latestByMetric: {
        waist: {
          id: '1',
          metricKey: 'waist',
          displayName: null,
          value: 80,
          unit: 'cm',
          recordedAt: '2026-07-20T08:00:00.000Z',
          source: 'manual_measurement',
          notes: null,
        },
      },
    });
    expect(snap.items).toHaveLength(1);
    expect(snap.latestByMetric).toHaveLength(1);
    expect(snap.latestByMetric[0]?.metricKey).toBe('waist');
  });

  it('round-trips display conversion for mass', () => {
    const display = toDisplayValue(70, 'weight', 'kg', {
      weightUnits: 'Pounds',
      distanceUnits: 'Miles',
    });
    const back = fromDisplayValue(display, 'weight', 'kg', {
      weightUnits: 'Pounds',
      distanceUnits: 'Miles',
    });
    expect(back).toBeCloseTo(70, 1);
  });
});

/**
 * CW-555: on a comma-decimal device the decimal-pad's only separator key emits
 * `,`. Raw `Number('72,5')` is `NaN`, so `measurementFormHasContent` reported
 * "no content" and the Save button silently greyed out with no error shown.
 */
describe('mapMeasurements comma-decimal input (CW-555)', () => {
  const metricOpts = { weightUnits: 'Kilograms', distanceUnits: 'Kilometers' } as const;

  it('reports content for a comma decimal so Save stays enabled', () => {
    expect(measurementFormHasContent({ ...emptyMeasurementForm('weight'), value: '72,5' })).toBe(
      true,
    );
  });

  it('reports content for grouped input', () => {
    for (const value of ['1 234,5', '1.234,56', '1,234.56', '1,234,567']) {
      expect(measurementFormHasContent({ ...emptyMeasurementForm('waist'), value })).toBe(true);
    }
  });

  it('still reports no content for genuinely invalid input so Save stays disabled', () => {
    for (const value of ['', '   ', 'abc', '1,2,3.4', '1e5', 'NaN', 'Infinity']) {
      expect(measurementFormHasContent({ ...emptyMeasurementForm('waist'), value })).toBe(false);
    }
  });

  it('still requires a custom name alongside a comma decimal', () => {
    expect(
      measurementFormHasContent({
        ...emptyMeasurementForm('custom'),
        value: '35,5',
        customName: '',
      }),
    ).toBe(false);
    expect(
      measurementFormHasContent({
        ...emptyMeasurementForm('custom'),
        value: '35,5',
        customName: 'Left bicep',
      }),
    ).toBe(true);
  });

  it('builds a payload from a comma decimal', () => {
    const payload = toCreatePayload(
      { ...emptyMeasurementForm('weight'), value: '72,5' },
      metricOpts,
    );
    expect(payload?.unit).toBe('kg');
    expect(payload?.value).toBeCloseTo(72.5, 2);
  });

  it('builds the same payload for comma and period decimals', () => {
    // toCreatePayload stamps `recordedAt` from the wall clock, so two calls that
    // straddle a millisecond boundary produce payloads differing only by 1 ms
    // and this equality fails at random (CW-575). Freeze the clock rather than
    // excluding the field — the point of the assertion is that *nothing* but the
    // decimal separator differs.
    vi.useFakeTimers();
    try {
      const comma = toCreatePayload(
        { ...emptyMeasurementForm('waist'), value: '81,3' },
        metricOpts,
      );
      const period = toCreatePayload(
        { ...emptyMeasurementForm('waist'), value: '81.3' },
        metricOpts,
      );
      expect(comma).toEqual(period);
      expect(comma?.value).toBeCloseTo(81.3, 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds a payload from grouped input', () => {
    expect(
      toCreatePayload({ ...emptyMeasurementForm('waist'), value: '1 234,5' }, metricOpts)?.value,
    ).toBeCloseTo(1234.5, 2);
    expect(
      toCreatePayload({ ...emptyMeasurementForm('waist'), value: '1.234,56' }, metricOpts)?.value,
    ).toBeCloseTo(1234.56, 2);
  });

  it('returns null instead of a payload for unparseable input', () => {
    for (const value of ['abc', '', '1,2,3.4', '-72,5']) {
      expect(toCreatePayload({ ...emptyMeasurementForm('waist'), value }, metricOpts)).toBeNull();
    }
  });
});
