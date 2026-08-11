import { describe, expect, it } from 'vitest';

import {
  addWeeksToYmd,
  buildAvailabilityDays,
  clampDurationWeeks,
  clampVolumeHours,
  defaultSelectedGoalId,
  formatGenerateProgress,
  isPlanSpanValid,
  mapPhaseGlance,
  nextMondayYmd,
  PLAN_GENERATE_TIMEOUT_MS,
  planDateIsoNoon,
  planEndDateIso,
  recommendStrategy,
  resolvePlanEndDateYmd,
  volumePreferenceFromHours,
  weeksBetweenYmd,
} from '../planGeneratorHelpers';

describe('volumePreferenceFromHours', () => {
  it('maps web PlanWizard buckets', () => {
    expect(volumePreferenceFromHours(4)).toBe('LOW');
    expect(volumePreferenceFromHours(5)).toBe('LOW');
    expect(volumePreferenceFromHours(6)).toBe('MID');
    expect(volumePreferenceFromHours(9.5)).toBe('MID');
    expect(volumePreferenceFromHours(10)).toBe('HIGH');
  });
});

describe('clampVolumeHours', () => {
  it('clamps to 3–20 in half-hour steps', () => {
    expect(clampVolumeHours(1)).toBe(3);
    expect(clampVolumeHours(25)).toBe(20);
    expect(clampVolumeHours(6.25)).toBe(6.5);
  });
});

describe('buildAvailabilityDays', () => {
  it('emits afternoon slots so days are not rest', () => {
    const days = buildAvailabilityDays([1, 3], ['Ride', 'Gym']);
    expect(days).toHaveLength(2);
    expect(days[0]?.slots?.[0]).toMatchObject({
      startTime: '14:00',
      duration: 90,
      activityTypes: ['Ride', 'Gym'],
      gymAccess: true,
      bikeAccess: true,
    });
    expect(days[0]?.afternoon).toBe(true);
  });
});

describe('plan calendar helpers', () => {
  it('builds noon/end ISO from YMD', () => {
    expect(planDateIsoNoon('2026-07-24')).toBe('2026-07-24T12:00:00.000Z');
    expect(planEndDateIso('2026-10-15')).toBe('2026-10-15T23:59:59.000Z');
  });

  it('adds weeks on the local calendar', () => {
    expect(addWeeksToYmd('2026-07-24', 12)).toBe('2026-10-16');
  });

  it('resolves end from goal or duration', () => {
    expect(
      resolvePlanEndDateYmd({
        mode: 'goal',
        startYmd: '2026-07-24',
        goalEndYmd: '2026-10-15',
        durationWeeks: 12,
      }),
    ).toBe('2026-10-15');
    expect(
      resolvePlanEndDateYmd({
        mode: 'goal',
        startYmd: '2026-07-24',
        goalEndYmd: null,
        durationWeeks: 12,
      }),
    ).toBeNull();
    expect(
      resolvePlanEndDateYmd({
        mode: 'duration',
        startYmd: '2026-07-24',
        goalEndYmd: null,
        durationWeeks: 12,
      }),
    ).toBe('2026-10-16');
  });

  it('requires ≥4 weeks span', () => {
    expect(weeksBetweenYmd('2026-07-24', '2026-08-21')).toBe(4);
    expect(isPlanSpanValid('2026-07-24', '2026-08-21')).toBe(true);
    expect(isPlanSpanValid('2026-07-24', '2026-08-01')).toBe(false);
  });

  it('clamps duration weeks 4–52', () => {
    expect(clampDurationWeeks(2)).toBe(4);
    expect(clampDurationWeeks(60)).toBe(52);
  });

  it('computes next Monday after today', () => {
    // Friday 2026-07-24 → Monday 2026-07-27
    expect(nextMondayYmd(new Date(2026, 6, 24))).toBe('2026-07-27');
    // Monday → next Monday
    expect(nextMondayYmd(new Date(2026, 6, 27))).toBe('2026-08-03');
  });
});

describe('defaultSelectedGoalId', () => {
  it('auto-selects sole goal; prefers preferred then primary', () => {
    expect(defaultSelectedGoalId([])).toBeNull();
    expect(defaultSelectedGoalId(['a'])).toBe('a');
    expect(defaultSelectedGoalId(['a', 'b'], 'b', 'a')).toBe('b');
    expect(defaultSelectedGoalId(['a', 'b'], null, 'a')).toBe('a');
    expect(defaultSelectedGoalId(['a', 'b'])).toBe('a');
  });
});

describe('recommendStrategy', () => {
  it('matches web PlanWizard heuristics', () => {
    expect(
      recommendStrategy({ volumeHours: 12, eventBased: false, weeksToGoal: null }).strategy,
    ).toBe('POLARIZED');
    expect(recommendStrategy({ volumeHours: 6, eventBased: true, weeksToGoal: 6 }).strategy).toBe(
      'BLOCK',
    );
    expect(recommendStrategy({ volumeHours: 6, eventBased: true, weeksToGoal: 12 }).strategy).toBe(
      'LINEAR',
    );
    expect(
      recommendStrategy({ volumeHours: 6, eventBased: false, weeksToGoal: null }).strategy,
    ).toBe('LINEAR');
  });
});

describe('mapPhaseGlance', () => {
  it('maps initialize blocks for preview', () => {
    const glances = mapPhaseGlance([
      {
        id: 'b1',
        name: 'Base',
        type: 'BASE',
        durationWeeks: 4,
        startDate: '2026-07-24',
      },
      {
        id: 'b2',
        type: 'BUILD',
        weeks: [{ id: 'w1' }, { id: 'w2' }],
      },
    ]);
    expect(glances).toEqual([
      {
        id: 'b1',
        title: 'Base',
        weeksLabel: '4 wk',
        rangeLabel: '2026-07-24 → 2026-08-21',
        type: 'BASE',
      },
      {
        id: 'b2',
        title: 'BUILD',
        weeksLabel: '2 wk',
        rangeLabel: null,
        type: 'BUILD',
      },
    ]);
  });
});

describe('formatGenerateProgress', () => {
  it('counts elapsed time so the working phase cannot look frozen', () => {
    expect(formatGenerateProgress(0).elapsedLabel).toBe('0:00');
    expect(formatGenerateProgress(9_400).elapsedLabel).toBe('0:09');
    expect(formatGenerateProgress(65_000).elapsedLabel).toBe('1:05');
    expect(formatGenerateProgress(-5).elapsedLabel).toBe('0:00');
  });

  it('escalates the hint as generation drags on', () => {
    expect(formatGenerateProgress(5_000).hint).toMatch(/under a minute/i);
    expect(formatGenerateProgress(45_000).hint).toMatch(/still working/i);
    expect(formatGenerateProgress(PLAN_GENERATE_TIMEOUT_MS).hint).toMatch(/cancel/i);
  });
});
