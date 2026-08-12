import { describe, expect, it } from 'vitest';

import type { ActivityListItem, PlannedListItem } from '@/src/features/activity/types';
import { localDateKey } from '@/src/lib/date';

import {
  ACTIVITY_GLANCE_WEEK_COUNT,
  activityGlanceRange,
  computeActivityGlance,
  computeNutritionGlance,
  resolveActivityGlanceTap,
} from '../activityGlance';

function activity(
  partial: Partial<ActivityListItem> & { date: string; id?: string },
): ActivityListItem {
  return {
    id: partial.id ?? 'a1',
    title: partial.title ?? 'Ride',
    date: partial.date,
    type: partial.type ?? 'Ride',
    durationSec: partial.durationSec ?? 3600,
    tss: partial.tss ?? 50,
    trainingLoad: null,
    status: { kind: 'ready', label: 'Ready' },
  };
}

function planned(
  partial: Partial<PlannedListItem> & { date: string; id?: string },
): PlannedListItem {
  return {
    id: partial.id ?? 'p1',
    title: partial.title ?? 'Plan',
    date: partial.date,
    type: partial.type ?? 'Ride',
    durationSec: partial.durationSec ?? 3600,
    tss: partial.tss ?? 80,
  };
}

describe('activityGlance', () => {
  it('builds twelve Monday-start weeks ending two weeks after current', () => {
    // Wednesday 2026-07-15 → current Monday 2026-07-13
    const now = new Date(2026, 6, 15, 12, 0, 0);
    const range = activityGlanceRange(now);
    expect(ACTIVITY_GLANCE_WEEK_COUNT).toBe(12);
    expect(range.startKey).toBe('2026-05-11'); // Monday 9 weeks before 2026-07-13
    expect(range.endKey).toBe('2026-08-02'); // Sunday of week starting 2026-07-27
    expect(range.weekStarts).toHaveLength(12);
    expect(localDateKey(range.weekStarts[0]!)).toBe('2026-05-11');
    expect(localDateKey(range.weekStarts[11]!)).toBe('2026-07-27');
  });

  it('marks done and upcoming planned days; ignores past planned-only', () => {
    const now = new Date(2026, 6, 15, 12, 0, 0);
    const glance = computeActivityGlance(
      [
        activity({ id: 'done-1', date: '2026-07-14T10:00:00' }),
        activity({ id: 'old', date: '2026-04-01T10:00:00' }),
      ],
      [
        planned({ id: 'past-plan', date: '2026-07-10' }),
        planned({ id: 'future-plan', date: '2026-07-16' }),
        planned({ id: 'today-plan', date: '2026-07-15' }),
      ],
      now,
    );

    expect(glance.weeks).toHaveLength(12);
    const flat = glance.weeks.flatMap((w) => w.days);
    expect(flat.find((d) => d.dateKey === '2026-07-14')?.hasDone).toBe(true);
    expect(flat.find((d) => d.dateKey === '2026-07-10')?.hasPlanned).toBe(false);
    expect(flat.find((d) => d.dateKey === '2026-07-16')?.hasPlanned).toBe(true);
    expect(flat.find((d) => d.dateKey === '2026-07-15')?.isToday).toBe(true);
    expect(flat.find((d) => d.dateKey === '2026-07-15')?.hasPlanned).toBe(true);
    expect(glance.doneDayCount).toBe(1);
    expect(glance.plannedDayCount).toBe(2);
    expect(glance.summaryLine).toBe('1 done · 2 planned');
  });

  it('buckets date-only and UTC-midnight planned dates as calendar days', () => {
    const now = new Date(2026, 6, 15, 12, 0, 0);
    const glance = computeActivityGlance(
      [],
      [
        planned({ id: 'd1', date: '2026-07-20' }),
        planned({ id: 'd2', date: '2026-07-21T00:00:00.000Z' }),
      ],
      now,
    );
    const flat = glance.weeks.flatMap((w) => w.days);
    expect(flat.find((d) => d.dateKey === '2026-07-20')?.hasPlanned).toBe(true);
    expect(flat.find((d) => d.dateKey === '2026-07-21')?.hasPlanned).toBe(true);
  });

  it('done wins over planned on the same day', () => {
    const now = new Date(2026, 6, 15, 12, 0, 0);
    const glance = computeActivityGlance(
      [activity({ id: 'a', date: '2026-07-16T12:00:00' })],
      [planned({ id: 'p', date: '2026-07-16' })],
      now,
    );
    const day = glance.weeks.flatMap((w) => w.days).find((d) => d.dateKey === '2026-07-16')!;
    expect(day.hasDone).toBe(true);
    expect(day.hasPlanned).toBe(false);
  });

  it('shifts the window back by twelve weeks per pageOffset', () => {
    const now = new Date(2026, 6, 15, 12, 0, 0);
    const live = activityGlanceRange(now, 0);
    const older = activityGlanceRange(now, -1);
    expect(live.startKey).toBe('2026-05-11');
    expect(older.endKey).toBe('2026-05-10'); // Sunday before live start
    expect(older.startKey).toBe('2026-02-16');
    expect(older.pageOffset).toBe(-1);
  });

  it('computes nutrition logged vs gap days for a page', () => {
    const now = new Date(2026, 6, 15, 12, 0, 0);
    const glance = computeNutritionGlance(['2026-07-14', '2026-07-15', '2026-04-01'], now, 0);
    expect(glance.loggedDayCount).toBe(2);
    expect(glance.summaryLine).toContain('logged');
    expect(glance.summaryLine).toContain('gaps');
    const flat = glance.weeks.flatMap((w) => w.days);
    expect(flat.find((d) => d.dateKey === '2026-07-14')?.hasLogged).toBe(true);
    expect(flat.find((d) => d.dateKey === '2026-07-13')?.hasLogged).toBe(false);
    expect(flat.find((d) => d.dateKey === '2026-07-16')?.isFuture).toBe(true);
    expect(flat.find((d) => d.dateKey === '2026-07-16')?.hasLogged).toBe(false);
  });

  it('resolves taps to detail or list destinations', () => {
    expect(
      resolveActivityGlanceTap({
        dateKey: '2026-07-14',
        hasDone: true,
        hasPlanned: false,
        isToday: false,
        isFuture: false,
        activityIds: ['a1'],
        plannedIds: [],
      }),
    ).toEqual({ kind: 'activity', id: 'a1' });

    expect(
      resolveActivityGlanceTap({
        dateKey: '2026-07-16',
        hasDone: false,
        hasPlanned: true,
        isToday: false,
        isFuture: true,
        activityIds: [],
        plannedIds: ['p1'],
      }),
    ).toEqual({ kind: 'planned', id: 'p1' });

    expect(
      resolveActivityGlanceTap({
        dateKey: '2026-07-14',
        hasDone: true,
        hasPlanned: false,
        isToday: false,
        isFuture: false,
        activityIds: ['a1', 'a2'],
        plannedIds: [],
      }),
    ).toEqual({ kind: 'recent' });

    expect(
      resolveActivityGlanceTap({
        dateKey: '2026-07-20',
        hasDone: false,
        hasPlanned: false,
        isToday: false,
        isFuture: true,
        activityIds: [],
        plannedIds: [],
      }),
    ).toEqual({ kind: 'upcoming' });
  });
});
