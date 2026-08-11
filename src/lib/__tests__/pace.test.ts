import { describe, expect, it } from 'vitest';

import {
  PACE_UNIT_METERS,
  mpsToPaceLabel,
  paceUnitDistanceName,
  paceUnitLabel,
  paceUnitSuffix,
  parsePaceToMps,
  type PaceUnit,
} from '../pace';

const UNITS: PaceUnit[] = ['per-km', 'per-mile', 'per-100m'];

describe('parsePaceToMps — explicit units (CW-483)', () => {
  it('parses mm:ss per km', () => {
    expect(parsePaceToMps('5:00', 'per-km')).toBeCloseTo(1000 / 300, 6);
    expect(parsePaceToMps('4:30', 'per-km')).toBeCloseTo(1000 / 270, 6);
  });

  it('parses mm:ss per mile — 8:00/mi is 3.353 m/s, not 2.083', () => {
    const mps = parsePaceToMps('8:00', 'per-mile');
    expect(mps).toBeCloseTo(3.3528, 4);
    // The old always-min/km parser produced this wrong value.
    expect(mps).not.toBeCloseTo(2.083, 3);
  });

  it('parses mm:ss per 100m — 1:45/100m is 0.952 m/s, not 9.524', () => {
    const mps = parsePaceToMps('1:45', 'per-100m');
    expect(mps).toBeCloseTo(0.9524, 4);
    expect(mps).not.toBeCloseTo(9.524, 3);
  });

  it('defaults to per-km when no unit is given', () => {
    expect(parsePaceToMps('5:00')).toBeCloseTo(parsePaceToMps('5:00', 'per-km')!, 10);
  });

  it('accepts decimal minutes, including comma decimals (CW-484)', () => {
    expect(parsePaceToMps('5.5', 'per-km')).toBeCloseTo(1000 / 330, 6);
    expect(parsePaceToMps('5,5', 'per-km')).toBeCloseTo(1000 / 330, 6);
    expect(parsePaceToMps('1,75', 'per-100m')).toBeCloseTo(100 / 105, 6);
  });

  it('rejects blank, non-numeric, zero and negative input', () => {
    for (const unit of UNITS) {
      expect(parsePaceToMps('', unit)).toBeUndefined();
      expect(parsePaceToMps('   ', unit)).toBeUndefined();
      expect(parsePaceToMps('fast', unit)).toBeUndefined();
      expect(parsePaceToMps('0', unit)).toBeUndefined();
      expect(parsePaceToMps('0:00', unit)).toBeUndefined();
      expect(parsePaceToMps('-5', unit)).toBeUndefined();
      expect(parsePaceToMps('5:75', unit)).toBeUndefined();
    }
  });
});

describe('mpsToPaceLabel — explicit units', () => {
  it('renders per km', () => {
    expect(mpsToPaceLabel(1000 / 300, '', 'per-km')).toBe('5:00');
    expect(mpsToPaceLabel(1000 / 300, '/km', 'per-km')).toBe('5:00/km');
  });

  it('renders per mile', () => {
    expect(mpsToPaceLabel(3.3528, '', 'per-mile')).toBe('8:00');
  });

  it('renders per 100m — a 1.25 m/s swim threshold is 1:20, not 13:20', () => {
    expect(mpsToPaceLabel(1.25, '', 'per-100m')).toBe('1:20');
    expect(mpsToPaceLabel(1.25, '', 'per-km')).toBe('13:20');
  });

  it('defaults to per-km so existing call sites are unchanged', () => {
    expect(mpsToPaceLabel(1000 / 300, '/km')).toBe('5:00/km');
  });

  it('rounds 59.5s up to the next minute', () => {
    // 4:59.6 per km rounds to 5:00.
    expect(mpsToPaceLabel(1000 / 299.6, '', 'per-km')).toBe('5:00');
  });

  it('falls back to m/s for non-positive or non-finite values', () => {
    expect(mpsToPaceLabel(0, '', 'per-km')).toBe('0.00 m/s');
    expect(mpsToPaceLabel(-1, '', 'per-100m')).toBe('-1.00 m/s');
    expect(mpsToPaceLabel(Number.NaN, '', 'per-km')).toBe('NaN m/s');
  });
});

describe('round-tripping', () => {
  it.each(UNITS)('label → parse → label is stable for %s', (unit) => {
    for (const label of ['1:45', '5:00', '8:00', '12:30']) {
      const mps = parsePaceToMps(label, unit);
      expect(mps).toBeDefined();
      expect(mpsToPaceLabel(mps!, '', unit)).toBe(label);
    }
  });

  it.each(UNITS)('parse → label → parse preserves m/s within rounding for %s', (unit) => {
    const original = PACE_UNIT_METERS[unit] / (5.25 * 60); // 5:15 in this unit
    const label = mpsToPaceLabel(original, '', unit);
    expect(parsePaceToMps(label, unit)).toBeCloseTo(original, 6);
  });

  it('does NOT round-trip across units (the unit must be threaded through)', () => {
    const mps = parsePaceToMps('1:45', 'per-100m')!;
    expect(mpsToPaceLabel(mps, '', 'per-km')).not.toBe('1:45');
  });
});

describe('unit labels', () => {
  it('names each unit once', () => {
    expect(paceUnitLabel('per-km')).toBe('min/km');
    expect(paceUnitLabel('per-mile')).toBe('min/mi');
    expect(paceUnitLabel('per-100m')).toBe('min/100m');
    expect(paceUnitSuffix('per-km')).toBe('/km');
    expect(paceUnitSuffix('per-mile')).toBe('/mi');
    expect(paceUnitSuffix('per-100m')).toBe('/100m');
    expect(paceUnitDistanceName('per-km')).toBe('km');
    expect(paceUnitDistanceName('per-mile')).toBe('mile');
    expect(paceUnitDistanceName('per-100m')).toBe('100 m');
  });
});
