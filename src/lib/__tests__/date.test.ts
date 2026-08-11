import { describe, expect, it } from 'vitest';

import {
  dateKeysInRange,
  localDateKey,
  localDateYmd,
  nextMondayYmd,
  weekRangeContaining,
  weekRangeFromOffset,
} from '@/src/lib/date';
import {
  CRITICAL_TIME_ZONES,
  TZ_AUCKLAND,
  TZ_KOLKATA,
  TZ_NEW_YORK,
  withTimeZone,
} from '@/src/test/timezone';

describe('localDateKey (CW-355)', () => {
  it('keeps a date-only string calendar-stable in every zone', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        expect(localDateKey('2026-08-10')).toBe('2026-08-10');
        expect(localDateKey(' 2026-08-10 ')).toBe('2026-08-10');
        // UTC midnight is the canonical date-only wire form (see wireDate.ts).
        expect(localDateKey('2026-08-10T00:00:00.000Z')).toBe('2026-08-10');
      });
    }
  });

  it('derives the local day from a real instant, not the UTC one', () => {
    // 2026-08-10T23:00Z is already the 11th in Auckland and still the 10th in New York.
    withTimeZone(TZ_AUCKLAND, () => {
      expect(localDateKey('2026-08-10T23:00:00.000Z')).toBe('2026-08-11');
    });
    withTimeZone(TZ_NEW_YORK, () => {
      expect(localDateKey('2026-08-10T23:00:00.000Z')).toBe('2026-08-10');
    });
    withTimeZone(TZ_KOLKATA, () => {
      expect(localDateKey('2026-08-10T19:00:00.000Z')).toBe('2026-08-11');
    });
  });

  it('accepts a Date as well as a string', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      expect(localDateKey(new Date(2026, 7, 10, 13, 30))).toBe('2026-08-10');
    });
  });

  it('returns null for unparseable input', () => {
    expect(localDateKey('')).toBeNull();
    expect(localDateKey('not-a-date')).toBeNull();
    expect(localDateKey(new Date('nonsense'))).toBeNull();
    expect(localDateKey(null)).toBeNull();
    expect(localDateKey(undefined)).toBeNull();
  });
});

describe('localDateYmd (CW-355)', () => {
  it('formats the local calendar day of a Date', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      expect(localDateYmd(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
      expect(localDateYmd(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    });
  });

  it('zero-pads month and day', () => {
    expect(localDateYmd(new Date(2026, 2, 5, 12))).toBe('2026-03-05');
  });

  it('agrees with localDateKey for any valid Date, in every zone', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        const d = new Date(2026, 6, 4, 8, 15);
        expect(localDateYmd(d)).toBe(localDateKey(d));
      });
    }
  });
});

describe('weekRangeContaining (CW-355)', () => {
  it('starts the week on Monday for a Sunday input (the day === 0 branch)', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      // 2026-08-09 is a Sunday — the week it belongs to starts Mon 2026-08-03.
      const { start, end, keys } = weekRangeContaining(new Date(2026, 7, 9, 15, 0));
      expect(localDateYmd(start)).toBe('2026-08-03');
      expect(localDateYmd(end)).toBe('2026-08-09');
      expect(keys).toEqual([
        '2026-08-03',
        '2026-08-04',
        '2026-08-05',
        '2026-08-06',
        '2026-08-07',
        '2026-08-08',
        '2026-08-09',
      ]);
    });
  });

  it('returns the same Monday-anchored week from any day inside it', () => {
    withTimeZone(TZ_AUCKLAND, () => {
      const monday = weekRangeContaining(new Date(2026, 7, 3, 0, 30)).keys;
      for (const dayOfMonth of [3, 4, 5, 6, 7, 8, 9]) {
        expect(weekRangeContaining(new Date(2026, 7, dayOfMonth, 12)).keys).toEqual(monday);
      }
    });
  });

  it('produces 7 distinct keys across a spring-forward day', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      // US DST starts Sun 2026-03-08; that Sunday closes the week from Mon 03-02.
      const { keys } = weekRangeContaining(new Date(2026, 2, 8, 12));
      expect(keys).toEqual([
        '2026-03-02',
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
      ]);
      expect(new Set(keys).size).toBe(7);
    });
  });

  it('produces 7 distinct keys across a fall-back day', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      // US DST ends Sun 2026-11-01, closing the week from Mon 2026-10-26.
      const { keys } = weekRangeContaining(new Date(2026, 10, 1, 12));
      expect(keys).toEqual([
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
      ]);
      expect(new Set(keys).size).toBe(7);
    });
  });

  it('spans a DST boundary mid-week in the southern hemisphere too', () => {
    withTimeZone(TZ_AUCKLAND, () => {
      // NZ DST ends Sun 2026-04-05.
      const { keys } = weekRangeContaining(new Date(2026, 3, 5, 12));
      expect(keys).toHaveLength(7);
      expect(new Set(keys).size).toBe(7);
      expect(keys[0]).toBe('2026-03-30');
      expect(keys[6]).toBe('2026-04-05');
    });
  });
});

describe('weekRangeFromOffset (CW-355)', () => {
  it('returns contiguous, non-overlapping Mon–Sun ranges for -1 / 0 / +1', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      const now = new Date(2026, 7, 12, 9, 0); // Wednesday
      const previous = weekRangeFromOffset(-1, now);
      const current = weekRangeFromOffset(0, now);
      const next = weekRangeFromOffset(1, now);

      expect(previous).toEqual({ start: '2026-08-03', end: '2026-08-09' });
      expect(current).toEqual({ start: '2026-08-10', end: '2026-08-16' });
      expect(next).toEqual({ start: '2026-08-17', end: '2026-08-23' });

      // Contiguous: each range starts the day after the previous one ends.
      expect(dateKeysInRange(previous.end, current.start)).toHaveLength(2);
      expect(dateKeysInRange(current.end, next.start)).toHaveLength(2);
      // Non-overlapping and exactly a week long.
      for (const range of [previous, current, next]) {
        expect(dateKeysInRange(range.start, range.end)).toHaveLength(7);
      }
    });
  });

  it('agrees with weekRangeContaining at offset 0', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        const now = new Date(2026, 7, 9, 22, 0); // Sunday, late — the day === 0 branch
        const range = weekRangeFromOffset(0, now);
        const containing = weekRangeContaining(now);
        expect(range.start).toBe(localDateYmd(containing.start));
        expect(range.end).toBe(localDateYmd(containing.end));
      });
    }
  });

  it('crosses a DST boundary without losing or repeating a day', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      const now = new Date(2026, 2, 4, 12); // Wed of the US spring-forward week
      expect(weekRangeFromOffset(0, now)).toEqual({ start: '2026-03-02', end: '2026-03-08' });
      expect(weekRangeFromOffset(1, now)).toEqual({ start: '2026-03-09', end: '2026-03-15' });
    });
  });
});

describe('dateKeysInRange (CW-355)', () => {
  it('is inclusive of both ends', () => {
    expect(dateKeysInRange('2026-08-10', '2026-08-12')).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ]);
    expect(dateKeysInRange('2026-08-10', '2026-08-10')).toEqual(['2026-08-10']);
  });

  it('returns an empty list when end precedes start', () => {
    expect(dateKeysInRange('2026-08-12', '2026-08-10')).toEqual([]);
  });

  it('caps at 14 keys', () => {
    const keys = dateKeysInRange('2026-01-01', '2026-12-31');
    expect(keys).toHaveLength(14);
    expect(keys[0]).toBe('2026-01-01');
    expect(keys[13]).toBe('2026-01-14');
  });

  it('does not repeat or skip a day across DST, thanks to the noon anchor', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      const spring = dateKeysInRange('2026-03-06', '2026-03-10');
      expect(spring).toEqual([
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
        '2026-03-09',
        '2026-03-10',
      ]);
      const fall = dateKeysInRange('2026-10-30', '2026-11-03');
      expect(fall).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
    });
    withTimeZone(TZ_AUCKLAND, () => {
      const keys = dateKeysInRange('2026-09-25', '2026-09-30');
      expect(keys).toHaveLength(6);
      expect(new Set(keys).size).toBe(6);
    });
  });

  it('crosses month and year boundaries', () => {
    expect(dateKeysInRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});

describe('nextMondayYmd (CW-355)', () => {
  it('returns the following week when today is already Monday', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      // 2026-08-10 is a Monday.
      expect(nextMondayYmd(new Date(2026, 7, 10, 9))).toBe('2026-08-17');
    });
  });

  it('returns tomorrow when today is Sunday', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      expect(nextMondayYmd(new Date(2026, 7, 9, 9))).toBe('2026-08-10');
    });
  });

  it('walks forward to the next Monday from any midweek day', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      expect(nextMondayYmd(new Date(2026, 7, 11, 9))).toBe('2026-08-17'); // Tue
      expect(nextMondayYmd(new Date(2026, 7, 12, 9))).toBe('2026-08-17'); // Wed
      expect(nextMondayYmd(new Date(2026, 7, 15, 9))).toBe('2026-08-17'); // Sat
    });
  });

  it('stays distinct from weekRangeContaining, which snaps backwards', () => {
    withTimeZone(TZ_NEW_YORK, () => {
      const monday = new Date(2026, 7, 10, 9);
      // Same input, deliberately different answers — see the module header.
      expect(localDateYmd(weekRangeContaining(monday).start)).toBe('2026-08-10');
      expect(nextMondayYmd(monday)).toBe('2026-08-17');
    });
  });

  it('lands on a Monday in every critical zone, including across DST', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        for (const from of [new Date(2026, 2, 6, 12), new Date(2026, 9, 30, 12)]) {
          const [y, m, d] = nextMondayYmd(from).split('-').map(Number);
          expect(new Date(y, m - 1, d).getDay()).toBe(1);
        }
      });
    }
  });
});
