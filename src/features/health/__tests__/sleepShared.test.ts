import { describe, expect, it } from 'vitest';

import {
  bucketHealthConnectSleep,
  bucketHealthKitSleep,
  clipHcSleepSessionToWindow,
  sleepWindowForDate,
  type HcSleepSession,
} from '../readers/sleepShared';

const HOUR = 60 * 60 * 1000;
const base = new Date('2026-07-20T22:00:00.000Z').getTime();

function stage(stageNo: number, fromHours: number, toHours: number) {
  return {
    stage: stageNo,
    startTime: new Date(base + fromHours * HOUR).toISOString(),
    endTime: new Date(base + toHours * HOUR).toISOString(),
  };
}

function session(stages: ReturnType<typeof stage>[], fromHours = 0, toHours = 8): HcSleepSession {
  return { start: base + fromHours * HOUR, end: base + toHours * HOUR, stages };
}

describe('bucketHealthConnectSleep', () => {
  it('sums asleep stages and excludes awake', () => {
    const bucket = bucketHealthConnectSleep([
      session([
        stage(4, 0, 3), // light
        stage(5, 3, 5), // deep
        stage(6, 5, 7), // rem
        stage(1, 7, 8), // awake
      ]),
    ]);

    expect(bucket?.sleepSecs).toBe(7 * 3600);
    expect(bucket?.sleepLightSecs).toBe(3 * 3600);
    expect(bucket?.sleepDeepSecs).toBe(2 * 3600);
    expect(bucket?.sleepRemSecs).toBe(2 * 3600);
    expect(bucket?.sleepAwakeSecs).toBe(1 * 3600);
  });

  it('counts the generic SLEEPING stage toward time asleep, not awake', () => {
    const bucket = bucketHealthConnectSleep([session([stage(2, 0, 6)])]);

    expect(bucket?.sleepSecs).toBe(6 * 3600);
    expect(bucket?.sleepAwakeSecs).toBeUndefined();
  });

  it('does not double-count the same night written by two sources', () => {
    // Watch and phone both record the identical 8h night.
    const stages = [stage(4, 0, 4), stage(5, 4, 8)];
    const bucket = bucketHealthConnectSleep([session(stages), session(stages)]);

    expect(bucket?.sleepSecs).toBe(8 * 3600);
    expect(bucket?.sleepLightSecs).toBe(4 * 3600);
    expect(bucket?.sleepDeepSecs).toBe(4 * 3600);
  });

  it('merges partially overlapping sources rather than summing', () => {
    const bucket = bucketHealthConnectSleep([
      session([stage(2, 0, 6)], 0, 6),
      session([stage(2, 4, 9)], 4, 9),
    ]);

    // Union is 0h→9h, not 6h + 5h.
    expect(bucket?.sleepSecs).toBe(9 * 3600);
  });

  it('falls back to the merged in-bed span when no session carries stages', () => {
    const bucket = bucketHealthConnectSleep([session([], 0, 7), session([], 5, 9)]);

    expect(bucket?.sleepSecs).toBe(9 * 3600);
    expect(bucket?.sleepDeepSecs).toBeUndefined();
  });

  it('returns null with no sessions', () => {
    expect(bucketHealthConnectSleep([])).toBeNull();
  });

  it('ignores malformed stage rows', () => {
    const bucket = bucketHealthConnectSleep([
      session([
        stage(4, 0, 3),
        { stage: 5, startTime: undefined, endTime: undefined },
        { stage: 6, startTime: 'not-a-date', endTime: 'nope' },
        {
          stage: 4,
          startTime: new Date(base).toISOString(),
          endTime: new Date(base).toISOString(),
        },
      ] as ReturnType<typeof stage>[]),
    ]);

    expect(bucket?.sleepSecs).toBe(3 * 3600);
  });
});

function hkSample(value: number, fromHours: number, toHours: number) {
  return { value, start: base + fromHours * HOUR, end: base + toHours * HOUR };
}

describe('bucketHealthKitSleep', () => {
  it('reports awake time alongside the asleep stages', () => {
    const bucket = bucketHealthKitSleep([
      hkSample(3, 0, 3), // core
      hkSample(4, 3, 5), // deep
      hkSample(5, 5, 7), // rem
      hkSample(2, 7, 8), // awake
    ]);

    expect(bucket?.sleepSecs).toBe(7 * 3600);
    expect(bucket?.sleepLightSecs).toBe(3 * 3600);
    expect(bucket?.sleepDeepSecs).toBe(2 * 3600);
    expect(bucket?.sleepRemSecs).toBe(2 * 3600);
    expect(bucket?.sleepAwakeSecs).toBe(1 * 3600);
  });

  it('never counts awake toward time asleep', () => {
    const bucket = bucketHealthKitSleep([hkSample(4, 0, 6), hkSample(2, 2, 3)]);

    expect(bucket?.sleepSecs).toBe(6 * 3600);
    expect(bucket?.sleepAwakeSecs).toBe(1 * 3600);
  });

  it('merges awake segments written by two sources rather than summing', () => {
    const bucket = bucketHealthKitSleep([hkSample(4, 0, 6), hkSample(2, 6, 7), hkSample(2, 6, 7)]);

    expect(bucket?.sleepAwakeSecs).toBe(1 * 3600);
  });

  it('omits awake when the night has none', () => {
    const bucket = bucketHealthKitSleep([hkSample(4, 0, 6)]);

    expect(bucket?.sleepSecs).toBe(6 * 3600);
    expect(bucket?.sleepAwakeSecs).toBeUndefined();
  });

  it('prefers stage samples so watch stages and phone "asleep" do not double-count', () => {
    const bucket = bucketHealthKitSleep([
      hkSample(1, 0, 8), // phone: asleepUnspecified across the whole night
      hkSample(4, 0, 4), // watch: deep
      hkSample(5, 4, 8), // watch: rem
    ]);

    expect(bucket?.sleepSecs).toBe(8 * 3600);
    expect(bucket?.sleepDeepSecs).toBe(4 * 3600);
    expect(bucket?.sleepRemSecs).toBe(4 * 3600);
  });

  it('returns null when nothing is asleep', () => {
    expect(bucketHealthKitSleep([hkSample(2, 0, 2)])).toBeNull();
    expect(bucketHealthKitSleep([])).toBeNull();
  });
});

// CW-480: sessions are selected by intersection with the noon-to-noon window,
// so they must be clipped to it — otherwise sleep crossing noon is counted in
// full against both adjacent dates.
describe('clipHcSleepSessionToWindow', () => {
  const day = sleepWindowForDate('2026-07-21');
  const next = sleepWindowForDate('2026-07-22');
  const winStart = day.start.getTime();
  const winEnd = day.end.getTime();

  /** 08:00–15:00 on 2026-07-21 — a shift worker's sleep, crossing the noon bound. */
  const crossing: HcSleepSession = {
    start: new Date(2026, 6, 21, 8, 0, 0, 0).getTime(),
    end: new Date(2026, 6, 21, 15, 0, 0, 0).getTime(),
    stages: [
      {
        stage: 4,
        startTime: new Date(2026, 6, 21, 8, 0, 0, 0).toISOString(),
        endTime: new Date(2026, 6, 21, 15, 0, 0, 0).toISOString(),
      },
    ],
  };

  it('splits a session crossing noon between the two dates instead of double-counting', () => {
    const onDay = clipHcSleepSessionToWindow(crossing, winStart, winEnd);
    const onNext = clipHcSleepSessionToWindow(crossing, next.start.getTime(), next.end.getTime());

    expect(bucketHealthConnectSleep([onDay!])?.sleepSecs).toBe(4 * 3600); // 08:00–12:00
    expect(bucketHealthConnectSleep([onNext!])?.sleepSecs).toBe(3 * 3600); // 12:00–15:00

    const total =
      bucketHealthConnectSleep([onDay!])!.sleepSecs +
      bucketHealthConnectSleep([onNext!])!.sleepSecs;
    expect(total).toBe(7 * 3600); // the session's real length, counted exactly once
  });

  it('leaves an ordinary overnight session untouched', () => {
    const overnight: HcSleepSession = {
      start: new Date(2026, 6, 20, 23, 0, 0, 0).getTime(),
      end: new Date(2026, 6, 21, 7, 0, 0, 0).getTime(),
      stages: [
        {
          stage: 5,
          startTime: new Date(2026, 6, 20, 23, 0, 0, 0).toISOString(),
          endTime: new Date(2026, 6, 21, 7, 0, 0, 0).toISOString(),
        },
      ],
    };
    const clipped = clipHcSleepSessionToWindow(overnight, winStart, winEnd);
    expect(clipped?.start).toBe(overnight.start);
    expect(clipped?.end).toBe(overnight.end);
    expect(bucketHealthConnectSleep([clipped!])?.sleepDeepSecs).toBe(8 * 3600);
  });

  it('returns null when the session falls entirely outside the window', () => {
    const later: HcSleepSession = {
      start: new Date(2026, 6, 22, 1, 0, 0, 0).getTime(),
      end: new Date(2026, 6, 22, 6, 0, 0, 0).getTime(),
    };
    expect(clipHcSleepSessionToWindow(later, winStart, winEnd)).toBeNull();
  });

  it('returns null for a session touching only the closing boundary instant', () => {
    const atNoon: HcSleepSession = { start: winEnd, end: winEnd + 3600_000 };
    expect(clipHcSleepSessionToWindow(atNoon, winStart, winEnd)).toBeNull();
  });

  it('drops stages outside the window and keeps the stageless shape working', () => {
    const stageless: HcSleepSession = { start: winStart - 3600_000, end: winStart + 3600_000 };
    const clipped = clipHcSleepSessionToWindow(stageless, winStart, winEnd);
    expect(clipped?.start).toBe(winStart);
    expect(clipped?.stages).toBeUndefined();
    expect(bucketHealthConnectSleep([clipped!])?.sleepSecs).toBe(3600);
  });
});

describe('sleepWindowForDate', () => {
  it('spans exactly 24h so an afternoon nap lands on a single date', () => {
    const window = sleepWindowForDate('2026-07-21');
    expect(window.end.getTime() - window.start.getTime()).toBe(24 * HOUR);
  });

  it('abuts the neighbouring day without overlapping it', () => {
    const day = sleepWindowForDate('2026-07-21');
    const next = sleepWindowForDate('2026-07-22');
    expect(next.start.getTime()).toBe(day.end.getTime());
  });
});
