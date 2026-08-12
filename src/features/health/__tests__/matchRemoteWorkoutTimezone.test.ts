import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { matchRemoteWorkout } from '../matchRemoteWorkout';
import { localDateYmd } from '@/src/lib/date';

const ORIGINAL_TZ = process.env.TZ;

function session(startedAt: string) {
  return {
    platformSessionId: 'sess-1',
    platform: 'healthkit' as const,
    startedAt,
    durationSec: 3600,
  };
}

/**
 * CW-464: a date-only remote date is midnight-UTC normalized, so it names the
 * UTC calendar day. Comparing it only against the LOCAL day of the session
 * start left evening workouts west of UTC (and early-morning ones east of it)
 * permanently unmatched — which made the pass re-upload them every cycle.
 */
describe('matchRemoteWorkout date-only matching across timezones', () => {
  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  describe('negative UTC offset (America/Los_Angeles)', () => {
    beforeAll(() => {
      process.env.TZ = 'America/Los_Angeles';
    });

    it('matches an evening workout stored under the next UTC day', () => {
      // 20:00 PDT on 2026-07-20 === 03:00 UTC on 2026-07-21.
      const startedAt = '2026-07-21T03:00:00.000Z';
      expect(localDateYmd(new Date(startedAt))).toBe('2026-07-20');

      const match = matchRemoteWorkout(session(startedAt), [
        { id: 'remote-utc-day', date: '2026-07-21', type: 'run', durationSec: 3500 },
      ]);
      expect(match?.id).toBe('remote-utc-day');
    });

    it('still matches when the remote is stored under the local day', () => {
      const startedAt = '2026-07-21T03:00:00.000Z';
      const match = matchRemoteWorkout(session(startedAt), [
        { id: 'remote-local-day', date: '2026-07-20', type: 'run', durationSec: 3500 },
      ]);
      expect(match?.id).toBe('remote-local-day');
    });

    it('does not match an unrelated calendar day', () => {
      const match = matchRemoteWorkout(session('2026-07-21T03:00:00.000Z'), [
        { id: 'remote-other', date: '2026-07-18', type: 'run', durationSec: 3500 },
      ]);
      expect(match).toBeNull();
    });
  });

  describe('positive UTC offset (Asia/Tokyo)', () => {
    beforeAll(() => {
      process.env.TZ = 'Asia/Tokyo';
    });

    it('matches an early-morning workout stored under the previous UTC day', () => {
      // 07:00 JST on 2026-07-21 === 22:00 UTC on 2026-07-20.
      const startedAt = '2026-07-20T22:00:00.000Z';
      expect(localDateYmd(new Date(startedAt))).toBe('2026-07-21');

      const match = matchRemoteWorkout(session(startedAt), [
        { id: 'remote-utc-day', date: '2026-07-20T00:00:00.000Z', type: 'run', durationSec: 3500 },
      ]);
      expect(match?.id).toBe('remote-utc-day');
    });

    it('still requires duration agreement on the UTC day', () => {
      const match = matchRemoteWorkout(session('2026-07-20T22:00:00.000Z'), [
        { id: 'remote-utc-day', date: '2026-07-20', type: 'run', durationSec: 300 },
      ]);
      expect(match).toBeNull();
    });
  });
});
