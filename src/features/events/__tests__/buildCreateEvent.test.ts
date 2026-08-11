import { describe, expect, it } from 'vitest';

import { localDateKey } from '@/src/features/today/weekGlance';
import { CRITICAL_TIME_ZONES, withTimeZone } from '@/src/test/timezone';

import {
  buildCreateEventInput,
  defaultEventDateYmd,
  validateEventCreateForm,
  type EventCreateFormValues,
} from '../buildCreateEvent';

function base(overrides: Partial<EventCreateFormValues> = {}): EventCreateFormValues {
  return {
    title: 'Autumn fondo',
    date: '2026-10-15',
    type: 'Ride',
    priority: 'A',
    location: 'Tuscany',
    description: 'A-priority race',
    startTime: '09:00',
    ...overrides,
  };
}

describe('buildCreateEvent', () => {
  it('validates title and date', () => {
    expect(validateEventCreateForm(base({ title: '  ' }))).toMatch(/title/i);
    expect(validateEventCreateForm(base({ date: 'bad' }))).toMatch(/YYYY-MM-DD/);
    expect(validateEventCreateForm(base({ date: '2026-02-31' }))).toMatch(/valid date/i);
    expect(validateEventCreateForm(base())).toBeNull();
  });

  it('defaults to a local calendar YMD', () => {
    const ymd = defaultEventDateYmd(0);
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [y, m, d] = ymd.split('-').map(Number);
    const now = new Date();
    expect(y).toBe(now.getFullYear());
    expect(m).toBe(now.getMonth() + 1);
    expect(d).toBe(now.getDate());
  });

  it('builds lite POST body', () => {
    expect(buildCreateEventInput(base())).toEqual({
      title: 'Autumn fondo',
      date: '2026-10-15T00:00:00.000Z',
      type: 'Ride',
      priority: 'A',
      location: 'Tuscany',
      description: 'A-priority race',
      startTime: '09:00',
    });
  });

  it('omits empty optionals', () => {
    expect(
      buildCreateEventInput(
        base({ priority: '', location: '', description: '', startTime: '', type: '' }),
      ),
    ).toEqual({
      title: 'Autumn fondo',
      date: '2026-10-15T00:00:00.000Z',
    });
  });

  // CW-493: a UTC-noon anchor makes a Sunday A-race show as Monday at UTC+12.
  it('round-trips the picked calendar day in every zone', () => {
    for (const tz of CRITICAL_TIME_ZONES) {
      withTimeZone(tz, () => {
        const input = buildCreateEventInput(base({ date: '2026-10-15' }));
        expect(localDateKey(input.date)).toBe('2026-10-15');
      });
    }
  });
});
