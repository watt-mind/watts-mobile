import { describe, expect, it } from 'vitest';

import {
  buildSportSettingsUpsertPayload,
  formFromSportProfile,
  formHasInvalidNumbers,
  isSwimSportProfile,
  paceUnitForSport,
  parseSportProfilesFromProfileResponse,
  thresholdPaceFieldLabel,
  thresholdPaceHelperText,
  toSportThresholdPatch,
} from '../mapSports';
import type { SportProfile } from '../types';

const sample: SportProfile = {
  id: 'sp-1',
  name: 'Cycling',
  isDefault: true,
  types: ['Ride', 'VirtualRide'],
  ftp: 250,
  lthr: 165,
  maxHr: 185,
  thresholdPace: null,
  raw: {
    id: 'sp-1',
    name: 'Cycling',
    isDefault: true,
    types: ['Ride', 'VirtualRide'],
    ftp: 250,
    lthr: 165,
    maxHr: 185,
    indoorFtp: 240,
    powerZones: [{ zone: 1 }],
  },
};

describe('parseSportProfilesFromProfileResponse', () => {
  it('parses nested profile.sportSettings', () => {
    const profiles = parseSportProfilesFromProfileResponse({
      connected: true,
      profile: {
        sportSettings: [
          sample.raw,
          {
            id: 'sp-2',
            name: 'Run',
            isDefault: false,
            types: ['Run'],
            ftp: null,
            lthr: 170,
            maxHr: 190,
            thresholdPace: 4.5,
          },
        ],
      },
    });
    expect(profiles).toHaveLength(2);
    expect(profiles[0]?.isDefault).toBe(true);
    expect(profiles[1]?.thresholdPace).toBe(4.5);
  });

  it('drops junk rows', () => {
    const profiles = parseSportProfilesFromProfileResponse({
      profile: { sportSettings: [{ nope: true }, sample.raw] },
    });
    expect(profiles).toHaveLength(1);
  });
});

describe('buildSportSettingsUpsertPayload', () => {
  it('round-trips raw advanced fields while overriding lite thresholds', () => {
    const payload = buildSportSettingsUpsertPayload(sample, {
      ftp: 260,
      lthr: 166,
      maxHr: 186,
    });
    expect(payload).toHaveLength(1);
    expect(payload[0]?.ftp).toBe(260);
    expect(payload[0]?.indoorFtp).toBe(240);
    expect(payload[0]?.powerZones).toEqual([{ zone: 1 }]);
  });
});

describe('toSportThresholdPatch', () => {
  it('builds ints from form values', () => {
    const form = formFromSportProfile(sample);
    form.ftp = '255';
    expect(toSportThresholdPatch(form, false)).toEqual({
      ftp: 255,
      lthr: 165,
      maxHr: 185,
    });
  });

  it('rejects invalid numbers', () => {
    expect(
      toSportThresholdPatch({ ftp: 'x', lthr: '1', maxHr: '2', thresholdPace: '' }, false),
    ).toBeNull();
  });

  it('converts an mm:ss threshold pace to m/s before patching', () => {
    const form = { ftp: '250', lthr: '165', maxHr: '185', thresholdPace: '5:00' };
    const patch = toSportThresholdPatch(form, true);
    // 5:00 min/km == 1000m / 300s
    expect(patch?.thresholdPace).toBeCloseTo(1000 / 300, 5);
  });

  it('rejects a malformed threshold pace', () => {
    const form = { ftp: '250', lthr: '165', maxHr: '185', thresholdPace: 'not-a-pace' };
    expect(toSportThresholdPatch(form, true)).toBeNull();
  });

  it('clears threshold pace when the field is emptied', () => {
    const form = { ftp: '250', lthr: '165', maxHr: '185', thresholdPace: '' };
    expect(toSportThresholdPatch(form, true)?.thresholdPace).toBeNull();
  });
});

describe('formFromSportProfile threshold pace display', () => {
  it('renders the stored m/s value as an mm:ss label', () => {
    const runProfile: SportProfile = {
      ...sample,
      thresholdPace: 1000 / 300, // 5:00 min/km
    };
    expect(formFromSportProfile(runProfile).thresholdPace).toBe('5:00');
  });

  it('round-trips display -> parse back to the original m/s value', () => {
    const mps = 1000 / 315; // 5:15 min/km
    const label = formFromSportProfile({ ...sample, thresholdPace: mps }).thresholdPace;
    const patch = toSportThresholdPatch(
      { ftp: '250', lthr: '165', maxHr: '185', thresholdPace: label },
      true,
    );
    expect(patch?.thresholdPace).toBeCloseTo(mps, 5);
  });
});

describe('pace unit resolution (CW-483)', () => {
  const swim: SportProfile = { ...sample, name: 'Swimming', types: ['Swim', 'OpenWaterSwim'] };
  const run: SportProfile = { ...sample, name: 'Running', types: ['Run', 'VirtualRun'] };

  it('detects swim profiles by type or name', () => {
    expect(isSwimSportProfile(swim)).toBe(true);
    expect(isSwimSportProfile({ ...sample, name: 'Pool swim', types: [] })).toBe(true);
    expect(isSwimSportProfile(run)).toBe(false);
    expect(isSwimSportProfile(sample)).toBe(false);
  });

  it('always uses per-100m for swim, whatever the distance preference', () => {
    expect(paceUnitForSport(swim, 'Kilometers')).toBe('per-100m');
    expect(paceUnitForSport(swim, 'Miles')).toBe('per-100m');
  });

  it('follows the athlete distanceUnits preference for non-swim sports', () => {
    expect(paceUnitForSport(run, 'Kilometers')).toBe('per-km');
    expect(paceUnitForSport(run, 'Miles')).toBe('per-mile');
  });

  it('defaults to per-km when the athlete profile has not loaded', () => {
    expect(paceUnitForSport(run, null)).toBe('per-km');
    expect(paceUnitForSport(run, undefined)).toBe('per-km');
    expect(paceUnitForSport(run)).toBe('per-km');
  });

  it('labels the field with the single resolved unit', () => {
    expect(thresholdPaceFieldLabel('per-mile')).toBe('Threshold pace (min/mi)');
    expect(thresholdPaceFieldLabel('per-100m')).toBe('Threshold pace (min/100m)');
    expect(thresholdPaceHelperText('per-100m')).toBe('Format mm:ss per 100 m (e.g. 1:45).');
    expect(thresholdPaceHelperText('per-km')).toBe('Format mm:ss per km (e.g. 5:15).');
    // Never describes three units at once any more.
    expect(thresholdPaceHelperText('per-mile')).not.toContain('100m');
  });
});

describe('threshold pace form uses the resolved unit end to end', () => {
  const swim: SportProfile = { ...sample, name: 'Swimming', types: ['Swim'] };

  it('renders a correct 1.25 m/s swim threshold as 1:20, not 13:20', () => {
    expect(formFromSportProfile({ ...swim, thresholdPace: 1.25 }, 'per-100m').thresholdPace).toBe(
      '1:20',
    );
  });

  it('stores 8:00 typed by a miles runner as 3.353 m/s', () => {
    const patch = toSportThresholdPatch(
      { ftp: '250', lthr: '165', maxHr: '185', thresholdPace: '8:00' },
      true,
      'per-mile',
    );
    expect(patch?.thresholdPace).toBeCloseTo(3.3528, 4);
  });

  it('stores 1:45 typed by a swimmer as 0.952 m/s', () => {
    const patch = toSportThresholdPatch(
      { ftp: '250', lthr: '165', maxHr: '185', thresholdPace: '1:45' },
      true,
      'per-100m',
    );
    expect(patch?.thresholdPace).toBeCloseTo(0.9524, 4);
  });

  it('round-trips display -> parse in every unit', () => {
    for (const [unit, meters] of [
      ['per-km', 1000],
      ['per-mile', 1609.344],
      ['per-100m', 100],
    ] as const) {
      const mps = meters / (5.25 * 60);
      const label = formFromSportProfile({ ...sample, thresholdPace: mps }, unit).thresholdPace;
      const patch = toSportThresholdPatch(
        { ftp: '250', lthr: '165', maxHr: '185', thresholdPace: label },
        true,
        unit,
      );
      expect(patch?.thresholdPace).toBeCloseTo(mps, 5);
    }
  });

  it('validates the pace field against the resolved unit', () => {
    const base = { ftp: '250', lthr: '165', maxHr: '185' };
    expect(formHasInvalidNumbers({ ...base, thresholdPace: '1:45' }, true, 'per-100m')).toBe(false);
    expect(formHasInvalidNumbers({ ...base, thresholdPace: 'nope' }, true, 'per-mile')).toBe(true);
    expect(formHasInvalidNumbers({ ...base, thresholdPace: 'nope' }, false, 'per-mile')).toBe(
      false,
    );
  });

  it('accepts a comma decimal in the pace field (CW-484)', () => {
    const patch = toSportThresholdPatch(
      { ftp: '250', lthr: '165', maxHr: '185', thresholdPace: '5,25' },
      true,
      'per-km',
    );
    expect(patch?.thresholdPace).toBeCloseTo(1000 / 315, 5);
  });
});
