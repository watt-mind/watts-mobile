import { describe, expect, it } from 'vitest';

import { canUploadRecentWorkouts, resolveRecentWorkoutAction } from '../recentWorkoutActions';

describe('resolveRecentWorkoutAction', () => {
  it('uploads when both preferences are on', () => {
    expect(resolveRecentWorkoutAction({ syncEnabled: true, syncWorkouts: true })).toEqual({
      kind: 'upload',
    });
  });

  it('routes to settings and names Sync to Coach Watts when sync is off', () => {
    // The reported case: the athlete could not turn sync on, then found Sync
    // buttons that did nothing at all when tapped (CW-573).
    const action = resolveRecentWorkoutAction({ syncEnabled: false, syncWorkouts: true });

    expect(action.kind).toBe('enable-sync');
    if (action.kind !== 'enable-sync') throw new Error('expected enable-sync');
    expect(action.reason).toContain('Sync to Coach Watts');
    expect(action.label.length).toBeGreaterThan(0);
  });

  it('names Sync workouts when only that switch is off', () => {
    const action = resolveRecentWorkoutAction({ syncEnabled: true, syncWorkouts: false });

    expect(action.kind).toBe('enable-sync');
    if (action.kind !== 'enable-sync') throw new Error('expected enable-sync');
    expect(action.reason).toContain('Sync workouts');
  });

  it('reports the missing top-level switch first when both are off', () => {
    // Enabling sync force-sets syncWorkouts, so telling someone to turn on
    // workout sync while the master switch is off would be a dead end.
    const action = resolveRecentWorkoutAction({ syncEnabled: false, syncWorkouts: false });

    expect(action.kind).toBe('enable-sync');
    if (action.kind !== 'enable-sync') throw new Error('expected enable-sync');
    expect(action.reason).toContain('Sync to Coach Watts');
  });
});

describe('canUploadRecentWorkouts', () => {
  it('is true only when both preferences are on', () => {
    expect(canUploadRecentWorkouts({ syncEnabled: true, syncWorkouts: true })).toBe(true);
    expect(canUploadRecentWorkouts({ syncEnabled: false, syncWorkouts: true })).toBe(false);
    expect(canUploadRecentWorkouts({ syncEnabled: true, syncWorkouts: false })).toBe(false);
    expect(canUploadRecentWorkouts({ syncEnabled: false, syncWorkouts: false })).toBe(false);
  });
});
