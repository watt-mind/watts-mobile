import { describe, expect, it } from 'vitest';

import { parseDecimal, parseNonNegativeDecimal } from '../parseDecimal';

describe('parseDecimal — dot decimals', () => {
  it('parses plain integers and decimals', () => {
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal('27')).toBe(27);
    expect(parseDecimal('27.5')).toBe(27.5);
    expect(parseDecimal('0.5')).toBe(0.5);
    expect(parseDecimal('-3.25')).toBe(-3.25);
    expect(parseDecimal('+3.25')).toBe(3.25);
  });
});

describe('parseDecimal — comma decimals (CW-484)', () => {
  it('parses a comma as the decimal separator', () => {
    expect(parseDecimal('27,5')).toBe(27.5);
    expect(parseDecimal('70,5')).toBe(70.5);
    expect(parseDecimal('0,5')).toBe(0.5);
    expect(parseDecimal('-3,25')).toBe(-3.25);
  });

  it('never turns a valid comma decimal into zero', () => {
    // The old `Number('27,5') || 0` path wrote 0 g to the server.
    expect(parseDecimal('27,5')).not.toBe(0);
  });
});

describe('parseDecimal — separator edge cases', () => {
  it('tolerates a leading or trailing separator (mid-typing)', () => {
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('5,')).toBe(5);
    expect(parseDecimal('5.')).toBe(5);
  });

  it('treats a repeated separator as thousands grouping', () => {
    expect(parseDecimal('1,234,567')).toBe(1234567);
    expect(parseDecimal('1.234.567')).toBe(1234567);
  });

  it('resolves mixed separators — the last one is the decimal', () => {
    expect(parseDecimal('1,234.56')).toBe(1234.56);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('1.234.567,89')).toBe(1234567.89);
    expect(parseDecimal('1,234,567.89')).toBe(1234567.89);
  });

  it('strips spaces used as grouping, including NBSP and thin space', () => {
    expect(parseDecimal('1 234,5')).toBe(1234.5);
    expect(parseDecimal('1 234,5')).toBe(1234.5);
    expect(parseDecimal('1 234.5')).toBe(1234.5);
    expect(parseDecimal('  27,5  ')).toBe(27.5);
  });

  it('rejects malformed grouping rather than guessing', () => {
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('1,2,3.4')).toBeNull();
    expect(parseDecimal('1,23,456')).toBeNull();
    expect(parseDecimal('1.2,3,4')).toBeNull();
  });
});

describe('parseDecimal — rejection', () => {
  it('returns null for empty and whitespace-only input', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('27g')).toBeNull();
    expect(parseDecimal('12..5')).toBeNull();
    expect(parseDecimal('.')).toBeNull();
    expect(parseDecimal(',')).toBeNull();
    expect(parseDecimal('-')).toBeNull();
  });

  it('returns null for values Number() would silently accept', () => {
    expect(parseDecimal('1e5')).toBeNull();
    expect(parseDecimal('0x10')).toBeNull();
    expect(parseDecimal('Infinity')).toBeNull();
    expect(parseDecimal('-Infinity')).toBeNull();
    expect(parseDecimal('NaN')).toBeNull();
  });

  it('does not partially parse like parseFloat', () => {
    // parseFloat('0,5') === 0 — the bug behind zeroed portions.
    expect(parseDecimal('0,5')).toBe(0.5);
    expect(parseDecimal('12abc')).toBeNull();
  });
});

describe('parseNonNegativeDecimal', () => {
  it('accepts zero and positives, rejects negatives and invalid input', () => {
    expect(parseNonNegativeDecimal('0')).toBe(0);
    expect(parseNonNegativeDecimal('27,5')).toBe(27.5);
    expect(parseNonNegativeDecimal('-1')).toBeNull();
    expect(parseNonNegativeDecimal('-0,5')).toBeNull();
    expect(parseNonNegativeDecimal('abc')).toBeNull();
    expect(parseNonNegativeDecimal('')).toBeNull();
  });
});
