/* eslint-disable import/first -- vi.mock factories must be declared before the modules under test are imported. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const queryWorkoutSamples = vi.fn();
vi.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: vi.fn(async () => true),
  queryWorkoutSamples: (...args: unknown[]) => queryWorkoutSamples(...args),
}));

import { readHealthKitWorkouts } from '../readers/healthKit';

describe('readHealthKitWorkouts error visibility (CW-465)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rethrows a HealthKit query failure instead of returning an empty list', async () => {
    queryWorkoutSamples.mockRejectedValue(new Error('HealthKit authorization not determined'));

    await expect(readHealthKitWorkouts({ lookbackDays: 14 })).rejects.toThrow(
      'HealthKit authorization not determined',
    );
  });

  it('wraps a non-Error rejection so the failure still surfaces', async () => {
    queryWorkoutSamples.mockRejectedValue('boom');

    await expect(readHealthKitWorkouts({ lookbackDays: 14 })).rejects.toThrow(
      'HealthKit workout query failed',
    );
  });

  it('still returns an empty list when the device genuinely has no workouts', async () => {
    queryWorkoutSamples.mockResolvedValue([]);

    await expect(readHealthKitWorkouts({ lookbackDays: 14 })).resolves.toEqual([]);
  });
});
