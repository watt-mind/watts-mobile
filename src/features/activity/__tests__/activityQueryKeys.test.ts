import { describe, expect, it } from 'vitest';

import { activityDetailQueryKey, activityDetailQueryPrefix } from '../mapActivity';

describe('activityDetailQueryKey (CW-491)', () => {
  it('carries the distance preference so unit variants cannot collide', () => {
    expect(activityDetailQueryKey('a1', 'Kilometers')).toEqual([
      'activity',
      'detail',
      'a1',
      'Kilometers',
    ]);
    expect(activityDetailQueryKey('a1', 'Miles')).toEqual(['activity', 'detail', 'a1', 'Miles']);
    expect(activityDetailQueryKey('a1', 'Kilometers')).not.toEqual(
      activityDetailQueryKey('a1', 'Miles'),
    );
  });

  it('defaults to Kilometers', () => {
    expect(activityDetailQueryKey('a1')).toEqual(activityDetailQueryKey('a1', 'Kilometers'));
  });

  it('exposes a prefix that matches every unit variant for invalidation', () => {
    const prefix = activityDetailQueryPrefix('a1');
    expect(prefix).toEqual(['activity', 'detail', 'a1']);
    for (const units of ['Kilometers', 'Miles'] as const) {
      expect(activityDetailQueryKey('a1', units).slice(0, prefix.length)).toEqual([...prefix]);
    }
  });
});
