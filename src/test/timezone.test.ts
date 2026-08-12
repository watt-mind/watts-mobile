import { describe, expect, it } from 'vitest';

import { TZ_AUCKLAND, TZ_KOLKATA, TZ_NEW_YORK, withTimeZone } from './timezone';

describe('test timezone harness', () => {
  it('pins an explicit zone (UTC unless TZ= is set, e.g. pnpm test:tz)', () => {
    expect(process.env.TZ).toBeTruthy();
    if (process.env.TZ === 'UTC') {
      expect(new Date(2026, 2, 1).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    }
  });

  it('actually changes local time arithmetic inside withTimeZone', () => {
    const offsets = [TZ_NEW_YORK, TZ_AUCKLAND, TZ_KOLKATA].map((tz) =>
      withTimeZone(tz, () => new Date('2026-08-10T12:00:00.000Z').getTimezoneOffset()),
    );
    // EDT -240, NZST +720 → -720, IST +330 → -330
    expect(offsets).toEqual([240, -720, -330]);
  });

  it('restores the previous zone afterwards', () => {
    const before = process.env.TZ;
    withTimeZone(TZ_AUCKLAND, () => undefined);
    expect(process.env.TZ).toBe(before);
  });

  it('crosses the day boundary at UTC+12 for a UTC-noon anchor', () => {
    const localDay = withTimeZone(TZ_AUCKLAND, () =>
      new Date('2026-08-10T12:00:00.000Z').getDate(),
    );
    expect(localDay).toBe(11);
  });
});
