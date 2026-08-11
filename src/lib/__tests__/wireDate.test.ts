import { describe, expect, it } from 'vitest';

import { localDateKey } from '@/src/lib/date';
import { ymdToLocalEndOfDayIso, ymdToLocalStartOfDayIso, ymdToWireDate } from '@/src/lib/wireDate';
import { CRITICAL_TIME_ZONES, TZ_AUCKLAND, TZ_KOLKATA, withTimeZone } from '@/src/test/timezone';

describe('ymdToWireDate (CW-493)', () => {
  it('anchors the calendar day at UTC midnight', () => {
    expect(ymdToWireDate('2026-08-10')).toBe('2026-08-10T00:00:00.000Z');
    expect(ymdToWireDate(' 2026-01-01 ')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('round-trips through localDateKey in every critical zone', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        for (const ymd of ['2026-08-10', '2026-03-08', '2026-11-01', '2026-12-31']) {
          expect(localDateKey(ymdToWireDate(ymd))).toBe(ymd);
        }
      });
    }
  });

  it('is the encoding UTC noon / end-of-day got wrong', () => {
    // The two anchors this replaces, for the record.
    withTimeZone(TZ_AUCKLAND, () => {
      expect(localDateKey('2026-08-10T12:00:00.000Z')).toBe('2026-08-11');
      expect(localDateKey(ymdToWireDate('2026-08-10'))).toBe('2026-08-10');
    });
    withTimeZone(TZ_KOLKATA, () => {
      expect(localDateKey('2026-08-10T23:59:59.000Z')).toBe('2026-08-11');
      expect(localDateKey(ymdToWireDate('2026-08-10'))).toBe('2026-08-10');
    });
  });

  it('rejects a non-calendar value instead of emitting Invalid Date', () => {
    expect(() => ymdToWireDate('10/08/2026')).toThrow(RangeError);
    expect(() => ymdToWireDate('')).toThrow(RangeError);
  });
});

describe('local day anchors (CW-493)', () => {
  it('encodes the instant of local midnight / local end of day', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        const start = new Date(ymdToLocalStartOfDayIso('2026-08-10'));
        expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([
          2026, 7, 10, 0,
        ]);
        const end = new Date(ymdToLocalEndOfDayIso('2026-08-10'));
        expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()]).toEqual([
          2026, 7, 10, 23,
        ]);
        expect(end.getTime()).toBeGreaterThan(start.getTime());
      });
    }
  });

  it('survives a DST spring-forward day', () => {
    withTimeZone('America/New_York', () => {
      const start = new Date(ymdToLocalStartOfDayIso('2026-03-08'));
      expect(start.getDate()).toBe(8);
      expect(start.getHours()).toBe(0);
    });
  });
});
