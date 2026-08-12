import { describe, expect, it } from 'vitest';

import { TZ_AUCKLAND, withTimeZone } from '@/src/test/timezone';

import {
  filterPlannedToWeek,
  findCurrentWeekIndex,
  flattenPlanWeeks,
  mapActivePlanShell,
  selectCurrentWeek,
} from '../mapActivePlan';
import type { ActivePlanApi, PlanBlockApi } from '../types';

const plan: ActivePlanApi = {
  id: 'plan-1',
  name: 'A Race Plan',
  strategy: 'POLARIZED',
  startDate: '2026-07-01',
  targetDate: '2026-09-01',
  currentBlockId: 'b2',
  coachNotes: 'Keep easy days easy.',
  blocks: [
    {
      id: 'b1',
      order: 0,
      name: 'Base',
      type: 'BASE',
      durationWeeks: 4,
      startDate: '2026-07-01',
      weeks: [
        {
          id: 'w1',
          weekNumber: 1,
          startDate: '2026-07-01',
          endDate: '2026-07-07',
          focusLabel: 'Aerobic',
          volumeTargetMinutes: 300,
          tssTarget: 200,
          isRecovery: false,
        },
      ],
    },
    {
      id: 'b2',
      order: 1,
      name: 'Build',
      type: 'BUILD',
      durationWeeks: 3,
      startDate: '2026-07-22',
      weeks: [
        {
          id: 'w2',
          weekNumber: 1,
          startDate: '2026-07-22',
          endDate: '2026-07-28',
          focusLabel: 'Threshold',
          isRecovery: false,
        },
      ],
    },
  ],
};

describe('mapActivePlanShell', () => {
  it('maps title, phase, blocks, and current week for today in range', () => {
    const shell = mapActivePlanShell(plan, { hasUsableData: false });
    expect(shell?.title).toBe('A Race Plan');
    expect(shell?.blocks).toHaveLength(2);
    expect(shell?.weeks).toHaveLength(2);
    expect(shell?.provisionalHint).toBe(true);
    expect(shell?.coachNotes).toContain('easy');
    expect(shell?.currentPhaseLabel).toMatch(/Build/);

    const week = selectCurrentWeek(plan.blocks!, '2026-07-24');
    expect(week?.id).toBe('w2');
    expect(week?.focusLabel).toBe('Threshold');
  });

  it('filters planned workouts to the week range', () => {
    const week = selectCurrentWeek(plan.blocks!, '2026-07-24');
    const filtered = filterPlannedToWeek(
      [
        { id: '1', date: '2026-07-23T00:00:00.000Z', title: 'In' },
        { id: '2', date: '2026-07-30T00:00:00.000Z', title: 'Out' },
      ],
      week,
    );
    expect(filtered.map((x) => x.id)).toEqual(['1']);
  });

  it('returns null for missing plan', () => {
    expect(mapActivePlanShell(null)).toBeNull();
  });
});

/**
 * Three consecutive weeks (Mon–Sun) in one block. Every assertion below pins the
 * date explicitly rather than reading the machine clock.
 */
const seasonBlocks: PlanBlockApi[] = [
  {
    id: 'blk',
    order: 0,
    name: 'Base',
    type: 'BASE',
    durationWeeks: 3,
    startDate: '2026-03-02',
    weeks: [
      { id: 'w1', weekNumber: 1, startDate: '2026-03-02', endDate: '2026-03-08' },
      { id: 'w2', weekNumber: 2, startDate: '2026-03-09', endDate: '2026-03-15' },
      { id: 'w3', weekNumber: 3, startDate: '2026-03-16', endDate: '2026-03-22' },
    ],
  },
];
const seasonWeeks = flattenPlanWeeks(seasonBlocks);

describe('findCurrentWeekIndex', () => {
  it('prefers the plan’s own currentWeek pointer when it matches a week by id', () => {
    // Today sits in w1, but the plan says w2 — the id match wins.
    const index = findCurrentWeekIndex(
      { weeks: seasonWeeks, currentWeek: seasonWeeks[1]! },
      '2026-03-04',
    );
    expect(index).toBe(1);
  });

  // The CW-285 branch: the plan's pointer is stale, so the view must fall back to
  // the week whose date range actually contains today instead of parking on the
  // plan's last historical week.
  it('falls back to the week containing today when currentWeek is stale', () => {
    const stalePointer = { ...seasonWeeks[0]!, id: 'week-from-an-abandoned-plan' };
    const index = findCurrentWeekIndex(
      { weeks: seasonWeeks, currentWeek: stalePointer },
      '2026-03-17',
    );
    expect(index).toBe(2);
    expect(seasonWeeks[index]!.id).toBe('w3');
  });

  it('falls back to the week containing today when the plan has no currentWeek', () => {
    const index = findCurrentWeekIndex({ weeks: seasonWeeks, currentWeek: null }, '2026-03-10');
    expect(index).toBe(1);
  });

  it('resolves the stale-pointer fallback identically outside UTC', () => {
    withTimeZone(TZ_AUCKLAND, () => {
      const index = findCurrentWeekIndex({ weeks: seasonWeeks, currentWeek: null }, '2026-03-17');
      expect(index).toBe(2);
    });
  });

  it('returns -1 when no week contains today, so the caller clamps to the last week', () => {
    const index = findCurrentWeekIndex({ weeks: seasonWeeks, currentWeek: null }, '2026-06-01');
    expect(index).toBe(-1);
    // PlanTrainingSegment's guard for exactly this case.
    expect(index >= 0 ? index : Math.max(0, seasonWeeks.length - 1)).toBe(2);
  });

  it('returns -1 for a missing shell or an unresolvable today key', () => {
    expect(findCurrentWeekIndex(null, '2026-03-10')).toBe(-1);
    expect(findCurrentWeekIndex(undefined, '2026-03-10')).toBe(-1);
    expect(findCurrentWeekIndex({ weeks: seasonWeeks, currentWeek: null }, '')).toBe(-1);
    expect(findCurrentWeekIndex({ weeks: [], currentWeek: null }, '2026-03-10')).toBe(-1);
  });
});

describe('selectCurrentWeek', () => {
  it('returns the week containing today', () => {
    expect(selectCurrentWeek(seasonBlocks, '2026-03-10')?.id).toBe('w2');
  });

  it('returns the nearest upcoming week when the plan is wholly in the future', () => {
    // Weeks are listed out of chronological order to prove the date sort, not array order.
    const unordered: PlanBlockApi[] = [
      {
        ...seasonBlocks[0]!,
        weeks: [
          { id: 'late', weekNumber: 3, startDate: '2026-03-16', endDate: '2026-03-22' },
          { id: 'soon', weekNumber: 1, startDate: '2026-03-02', endDate: '2026-03-08' },
        ],
      },
    ];
    expect(selectCurrentWeek(unordered, '2026-01-05')?.id).toBe('soon');
  });

  it('returns the last week when the plan is wholly in the past, not null', () => {
    const week = selectCurrentWeek(seasonBlocks, '2026-12-01');
    expect(week).not.toBeNull();
    expect(week?.id).toBe('w3');
  });

  it('returns null when the plan has no weeks at all', () => {
    expect(selectCurrentWeek([{ ...seasonBlocks[0]!, weeks: [] }], '2026-03-10')).toBeNull();
  });
});
