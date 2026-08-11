import { describe, expect, it } from 'vitest';

import type { ActivityListItem, PlannedListItem } from '@/src/features/activity/types';
import {
  computeWeekGlance,
  localDateKey,
  resolveWeekGlanceStripState,
  weekRangeContaining,
} from '@/src/features/today/weekGlance';

function activity(
  partial: Partial<ActivityListItem> & { date: string; durationSec?: number; tss?: number },
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
  partial: Partial<PlannedListItem> & { date: string; tss?: number },
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

describe('weekGlance', () => {
  it('builds a Monday-start local week', () => {
    // Wednesday 2026-07-15 local
    const { keys } = weekRangeContaining(new Date(2026, 6, 15, 12, 0, 0));
    expect(keys[0]).toBe('2026-07-13');
    expect(keys[6]).toBe('2026-07-19');
  });

  it('sums done duration/TSS and planned TSS in the current week', () => {
    const now = new Date(2026, 6, 15, 12, 0, 0);
    const glance = computeWeekGlance(
      [
        activity({ date: '2026-07-14T10:00:00', durationSec: 7200, tss: 100 }),
        activity({ date: '2026-07-01T10:00:00', durationSec: 3600, tss: 40 }), // outside week
      ],
      [
        planned({ date: '2026-07-16T10:00:00', tss: 90 }),
        planned({ date: '2026-07-17T10:00:00', tss: 70 }),
      ],
      now,
    );

    expect(glance.doneDurationLabel).toBe('2h');
    expect(Math.round(glance.doneTss)).toBe(100);
    expect(Math.round(glance.plannedTss)).toBe(160);
    expect(glance.summaryLine).toContain('100 TSS of ~160 planned');
    expect(glance.days).toHaveLength(7);
    expect(glance.days.find((d) => d.dateKey === '2026-07-14')?.hasDone).toBe(true);
    expect(glance.days.find((d) => d.dateKey === '2026-07-16')?.hasPlanned).toBe(true);
  });

  it('localDateKey uses local calendar day', () => {
    expect(localDateKey(new Date(2026, 6, 19, 23, 30, 0))).toBe('2026-07-19');
  });

  it('treats date-only strings and UTC midnight ISO strings as calendar days', () => {
    expect(localDateKey('2026-07-20')).toBe('2026-07-20');
    expect(localDateKey('2026-07-20T00:00:00.000Z')).toBe('2026-07-20');
    expect(localDateKey('2026-07-20T00:00:00Z')).toBe('2026-07-20');
  });

  it('keeps planned-day bars visible when done days use duration/TSS', () => {
    const now = new Date(2026, 6, 15, 12, 0, 0);
    const glance = computeWeekGlance(
      [activity({ date: '2026-07-14T10:00:00', durationSec: 3600, tss: 80 })],
      [planned({ date: '2026-07-16T10:00:00', tss: 70 })],
      now,
    );
    const done = glance.days.find((d) => d.dateKey === '2026-07-14')!;
    const plannedDay = glance.days.find((d) => d.dateKey === '2026-07-16')!;
    expect(done.height).toBeGreaterThan(0.5);
    expect(plannedDay.height).toBeGreaterThan(0.5);
  });
});

describe('resolveWeekGlanceStripState (CW-489)', () => {
  const now = new Date(2026, 6, 18, 12, 0, 0); // Saturday

  it('reports loading while the week-ranged workouts query is still pending', () => {
    const state = resolveWeekGlanceStripState({
      workouts: undefined,
      planned: undefined,
      workoutsPending: true,
      now,
    });
    expect(state.status).toBe('loading');
  });

  it('is ready (not loading) once the query settles with no workouts', () => {
    const state = resolveWeekGlanceStripState({
      workouts: [],
      planned: undefined,
      workoutsPending: false,
      now,
    });
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.glance.summaryLine).toBe('This week: no load logged yet');
  });

  it('is ready when the query errored out (no data, not pending)', () => {
    const state = resolveWeekGlanceStripState({
      workouts: undefined,
      planned: [planned({ date: '2026-07-17T10:00:00', tss: 70 })],
      workoutsPending: false,
      now,
    });
    expect(state.status).toBe('ready');
  });

  it('sums the WHOLE week — 15 multi-sport sessions since Monday, not the last 10', () => {
    // Mon–Sat, 3 sessions/day for the first five days: a fixed 10-item recent list
    // would only ever reach back to Thursday.
    const days = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'];
    const workouts = days.flatMap((date, dayIdx) =>
      ['Swim', 'Ride', 'Run'].map((type, i) =>
        activity({
          id: `w-${dayIdx}-${i}`,
          date: `${date}T0${6 + i}:00:00`,
          type,
          durationSec: 2400,
          tss: 45,
        }),
      ),
    );

    const full = resolveWeekGlanceStripState({
      workouts,
      planned: undefined,
      workoutsPending: false,
      now,
    });
    if (full.status !== 'ready') throw new Error('expected ready');
    expect(full.glance.doneTss).toBe(15 * 45);
    expect(full.glance.doneDurationSec).toBe(15 * 2400);
    expect(full.glance.doneDurationLabel).toBe('10h');
    // Every logged day has a completed bar — Mon–Wed are no longer phantom rest days.
    for (const dateKey of days) {
      expect(full.glance.days.find((d) => d.dateKey === dateKey)?.hasDone).toBe(true);
    }

    // The old behaviour: only the 10 most recent sessions ever reached the strip.
    const capped = resolveWeekGlanceStripState({
      workouts: workouts.slice(-10),
      planned: undefined,
      workoutsPending: false,
      now,
    });
    if (capped.status !== 'ready') throw new Error('expected ready');
    expect(capped.glance.doneTss).toBe(10 * 45);
    expect(capped.glance.days.find((d) => d.dateKey === '2026-07-13')?.hasDone).toBe(false);
    expect(capped.glance.doneTss).toBeLessThan(full.glance.doneTss);
  });
});
