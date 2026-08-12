import { describe, expect, it } from 'vitest';

import {
  NO_DATA_HINT_ANDROID,
  NO_DATA_HINT_IOS,
  resolveEnableSyncOutcome,
  type EnableSyncOutcomeInput,
} from '../enableSyncOutcome';

/** A pass that ran to completion and read at least one usable sample. */
const FOUND_DATA: EnableSyncOutcomeInput = { skipped: false, foundLocalData: true };
/** A pass that ran to completion but the platform store returned nothing usable. */
const FOUND_NOTHING: EnableSyncOutcomeInput = { skipped: false, foundLocalData: false };
/** A pass that never read anything — offline, signed out, or sync disabled. */
const SKIPPED: EnableSyncOutcomeInput = { skipped: true, foundLocalData: false };

describe('resolveEnableSyncOutcome', () => {
  it('reports no problem when the pass found data', () => {
    for (const platformOS of ['ios', 'android']) {
      expect(resolveEnableSyncOutcome(FOUND_DATA, platformOS)).toEqual({
        noDataFound: false,
        hint: null,
      });
    }
  });

  it('hints at HealthKit read access on iOS when a completed pass found nothing', () => {
    const outcome = resolveEnableSyncOutcome(FOUND_NOTHING, 'ios');

    expect(outcome.noDataFound).toBe(true);
    expect(outcome.hint).toBe(NO_DATA_HINT_IOS);
    expect(outcome.hint).toContain('Health → Profile → Apps');
  });

  it('hints at Health Connect on Android when a completed pass found nothing', () => {
    const outcome = resolveEnableSyncOutcome(FOUND_NOTHING, 'android');

    expect(outcome.noDataFound).toBe(true);
    expect(outcome.hint).toBe(NO_DATA_HINT_ANDROID);
    expect(outcome.hint).toContain('Health Connect');
    expect(outcome.hint).not.toContain('Health → Profile → Apps');
  });

  // The subtle one: a skipped pass read nothing because it never tried, so it is
  // not evidence of denial. Hinting here would show "no data found" to an athlete
  // who is merely offline.
  it('stays silent for a skipped pass, which is not evidence of denial', () => {
    for (const platformOS of ['ios', 'android']) {
      expect(resolveEnableSyncOutcome(SKIPPED, platformOS)).toEqual({
        noDataFound: false,
        hint: null,
      });
    }
  });

  it.each(['offline', 'not_authenticated', 'sync_disabled', 'signed_out'])(
    'stays silent for a pass skipped because of %s',
    (reason) => {
      expect(resolveEnableSyncOutcome({ ...SKIPPED, reason }, 'ios').hint).toBeNull();
    },
  );

  it('stays silent when no pass ran at all', () => {
    expect(resolveEnableSyncOutcome(null, 'ios')).toEqual({ noDataFound: false, hint: null });
    expect(resolveEnableSyncOutcome(undefined, 'android')).toEqual({
      noDataFound: false,
      hint: null,
    });
  });

  it('falls back to the non-iOS hint for any other platform', () => {
    expect(resolveEnableSyncOutcome(FOUND_NOTHING, 'web').hint).toBe(NO_DATA_HINT_ANDROID);
  });
});
