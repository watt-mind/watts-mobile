import { describe, expect, it } from 'vitest';

import { calculateTrend } from '@/src/features/profile/trend';
import {
  priorWellnessHistory,
  wellnessTrendWindow,
} from '@/src/features/profile/wellnessTrendWindow';
import { CRITICAL_TIME_ZONES, TZ_AUCKLAND, withTimeZone } from '@/src/test/timezone';

/** Latest-day HRV against the prior 7 days, as the dashboard computes it. */
function hrvTrendPercent(rows: { date: string; hrv: number }[], latestDateKey: string) {
  const prior = priorWellnessHistory(rows, latestDateKey);
  return calculateTrend(
    rows.find((r) => r.date === latestDateKey)?.hrv ?? null,
    prior.map((r) => r.hrv),
  );
}

describe('wellnessTrendWindow (CW-492)', () => {
  it('keys the latest day on the local calendar, not UTC', () => {
    // 09:00 local on 2026-08-11 in Auckland (UTC+12) is still 2026-08-10 in UTC.
    withTimeZone(TZ_AUCKLAND, () => {
      const now = new Date(2026, 7, 11, 9, 0, 0);
      expect(now.toISOString().split('T')[0]).toBe('2026-08-10');
      expect(wellnessTrendWindow(now).latestDateKey).toBe('2026-08-11');
    });
  });

  it('builds the range from local day boundaries covering 9 local days', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        const { startDateStr, endDateStr } = wellnessTrendWindow(new Date(2026, 7, 11, 9, 0, 0));
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        expect(start.getFullYear()).toBe(2026);
        expect(start.getMonth()).toBe(7);
        expect(start.getDate()).toBe(3);
        expect(start.getHours()).toBe(0);
        expect(end.getDate()).toBe(11);
        expect(end.getHours()).toBe(23);
        expect(end.getTime()).toBeGreaterThan(start.getTime());
      });
    }
  });

  it('handles month and DST boundaries', () => {
    withTimeZone('America/New_York', () => {
      // 2026-03-08 is spring-forward; the window must still start at local midnight.
      const { startDateStr, latestDateKey } = wellnessTrendWindow(new Date(2026, 2, 9, 6, 0, 0));
      expect(latestDateKey).toBe('2026-03-09');
      const start = new Date(startDateStr);
      expect(start.getMonth()).toBe(2);
      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
    });
    withTimeZone(TZ_AUCKLAND, () => {
      const { startDateStr } = wellnessTrendWindow(new Date(2026, 0, 3, 9, 0, 0));
      const start = new Date(startDateStr);
      expect(start.getFullYear()).toBe(2025);
      expect(start.getMonth()).toBe(11);
      expect(start.getDate()).toBe(26);
    });
  });
});

describe('priorWellnessHistory (CW-492)', () => {
  const rows = [
    { date: '2026-08-04', hrv: 60 },
    { date: '2026-08-05', hrv: 60 },
    { date: '2026-08-06', hrv: 60 },
    { date: '2026-08-07', hrv: 60 },
    { date: '2026-08-08', hrv: 60 },
    { date: '2026-08-09', hrv: 60 },
    { date: '2026-08-10', hrv: 60 },
    { date: '2026-08-11', hrv: 40 },
  ];

  it('excludes today (not yesterday) from the baseline at UTC+12', () => {
    withTimeZone(TZ_AUCKLAND, () => {
      const { latestDateKey } = wellnessTrendWindow(new Date(2026, 7, 11, 9, 0, 0));
      const prior = priorWellnessHistory(rows, latestDateKey);
      expect(prior.map((r) => r.date)).toEqual([
        '2026-08-04',
        '2026-08-05',
        '2026-08-06',
        '2026-08-07',
        '2026-08-08',
        '2026-08-09',
        '2026-08-10',
      ]);
      // HRV 40 against a true 7-day mean of 60 is -33%, not the -30% you get
      // when today's own 40 is folded into an 8-value mean of 57.5.
      expect(hrvTrendPercent(rows, latestDateKey)).toBe(-33);
    });
  });

  it('normalizes full timestamps so the latest day still matches', () => {
    const timestamped = rows.map((r) => ({ ...r, date: `${r.date}T00:00:00.000Z` }));
    const prior = priorWellnessHistory(timestamped, '2026-08-11');
    expect(prior).toHaveLength(7);
    expect(prior.every((r) => !r.date.startsWith('2026-08-11'))).toBe(true);
  });

  it('is stable in every critical zone', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        const { latestDateKey } = wellnessTrendWindow(new Date(2026, 7, 11, 9, 0, 0));
        expect(latestDateKey).toBe('2026-08-11');
        expect(priorWellnessHistory(rows, latestDateKey)).toHaveLength(7);
      });
    }
  });
});
