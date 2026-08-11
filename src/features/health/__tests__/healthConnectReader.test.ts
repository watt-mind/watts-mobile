/* eslint-disable import/first -- vi.mock factories must be declared before the modules under test are imported. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

type RecordsByType = Record<string, unknown[]>;
let records: RecordsByType = {};

const readRecords = vi.fn(async (recordType: string) => ({
  records: records[recordType] ?? [],
  pageToken: undefined,
}));
type AggregateRequest = {
  recordType: string;
  timeRangeSlicer?: { period: string; length: number };
};
const aggregateRecord = vi.fn(async (_req: AggregateRequest) => ({}) as unknown);
const aggregateGroupByPeriod = vi.fn(async (_req: AggregateRequest) => [] as unknown[]);

vi.mock('react-native-health-connect', () => ({
  SdkAvailabilityStatus: {
    SDK_UNAVAILABLE: 1,
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
    SDK_AVAILABLE: 3,
  },
  getSdkStatus: vi.fn(async () => 3),
  initialize: vi.fn(async () => true),
  readRecords: (...args: Parameters<typeof readRecords>) => readRecords(...args),
  aggregateRecord: (...args: Parameters<typeof aggregateRecord>) => aggregateRecord(...args),
  aggregateGroupByPeriod: (...args: Parameters<typeof aggregateGroupByPeriod>) =>
    aggregateGroupByPeriod(...args),
}));

import { readHealthConnectWellness, readHealthConnectWorkouts } from '../readers/healthConnect';

/** Local midnight for a day offset from today, as Health Connect reports group bounds. */
function localMidnightIso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** The local YMD the reader keys samples by, for a day offset from today. */
function localDateOf(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

const GROUPED_TYPES = [
  'Steps',
  'Distance',
  'FloorsClimbed',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'BasalMetabolicRate',
  'ExerciseSession',
];

beforeEach(() => {
  vi.clearAllMocks();
  records = {};
  aggregateRecord.mockResolvedValue({});
  aggregateGroupByPeriod.mockResolvedValue([]);
});

// CW-481: the per-day path cost 7 IPC calls × 14 days inside a time-budgeted
// Android background task; grouping slices the whole window server-side.
describe('readHealthConnectWellness daily aggregates', () => {
  it('issues one grouped call per record type instead of one per type per day', async () => {
    await readHealthConnectWellness({ lookbackDays: 5 });

    expect(aggregateGroupByPeriod).toHaveBeenCalledTimes(GROUPED_TYPES.length);
    expect(aggregateGroupByPeriod.mock.calls.map((call) => call[0].recordType).sort()).toEqual(
      [...GROUPED_TYPES].sort(),
    );
    // No per-day fallback needed when grouping works.
    expect(aggregateRecord).not.toHaveBeenCalled();
  });

  it('slices the grouped request by single days', async () => {
    await readHealthConnectWellness({ lookbackDays: 3 });

    expect(aggregateGroupByPeriod.mock.calls[0]?.[0].timeRangeSlicer).toEqual({
      period: 'DAYS',
      length: 1,
    });
  });

  it('maps each grouped bucket onto its own date', async () => {
    aggregateGroupByPeriod.mockImplementation(async (req: { recordType: string }) => {
      if (req.recordType !== 'Steps') return [];
      return [
        {
          startTime: localMidnightIso(1),
          endTime: localMidnightIso(0),
          result: { COUNT_TOTAL: 8000 },
        },
        {
          startTime: localMidnightIso(0),
          endTime: localMidnightIso(0),
          result: { COUNT_TOTAL: 3000 },
        },
      ];
    });

    const samples = await readHealthConnectWellness({ lookbackDays: 2 });
    const byDate = new Map(samples.map((s) => [s.date, s.steps]));

    expect(byDate.get(localDateOf(1))).toBe(8000);
    expect(byDate.get(localDateOf(0))).toBe(3000);
  });

  it('falls back to the per-day aggregate only for a type the grouped call rejects', async () => {
    aggregateGroupByPeriod.mockImplementation(async (req: { recordType: string }) => {
      if (req.recordType === 'Steps') throw new Error('grouped unsupported');
      return [];
    });
    aggregateRecord.mockResolvedValue({ COUNT_TOTAL: 4200 });

    const samples = await readHealthConnectWellness({ lookbackDays: 2 });

    const perDayTypes = new Set(aggregateRecord.mock.calls.map((call) => call[0].recordType));
    expect([...perDayTypes]).toEqual(['Steps']);
    expect(samples.every((s) => s.steps === 4200)).toBe(true);
  });
});

// CW-481: CyclingPedalingCadence is crank rpm, StepsCadence is steps/min —
// concatenating them puts two units in a single series.
describe('readHealthConnectWorkouts cadence', () => {
  const start = new Date();
  start.setHours(start.getHours() - 2, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const midSession = new Date(start.getTime() + 10 * 60 * 1000).toISOString();

  function session() {
    return {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      metadata: { id: 'sess-1' },
      exerciseType: 8,
    };
  }

  it('prefers cycling cadence and ignores steps cadence for the same session', async () => {
    records = {
      ExerciseSession: [session()],
      CyclingPedalingCadence: [{ samples: [{ time: midSession, revolutionsPerMinute: 90 }] }],
      StepsCadence: [{ samples: [{ time: midSession, rate: 170 }] }],
    };

    const [workout] = await readHealthConnectWorkouts({ lookbackDays: 2 });

    expect(workout?.cadenceSamples?.map((s) => s.rpm)).toEqual([90]);
  });

  it('falls back to steps cadence when the session has no cycling cadence', async () => {
    records = {
      ExerciseSession: [session()],
      StepsCadence: [{ samples: [{ time: midSession, rate: 170 }] }],
    };

    const [workout] = await readHealthConnectWorkouts({ lookbackDays: 2 });

    expect(workout?.cadenceSamples?.map((s) => s.rpm)).toEqual([170]);
  });

  it('does not borrow cycling cadence recorded outside the session window', async () => {
    const wayEarlier = new Date(start.getTime() - 6 * 60 * 60 * 1000).toISOString();
    records = {
      ExerciseSession: [session()],
      CyclingPedalingCadence: [{ samples: [{ time: wayEarlier, revolutionsPerMinute: 90 }] }],
      StepsCadence: [{ samples: [{ time: midSession, rate: 170 }] }],
    };

    const [workout] = await readHealthConnectWorkouts({ lookbackDays: 2 });

    expect(workout?.cadenceSamples?.map((s) => s.rpm)).toEqual([170]);
  });
});
