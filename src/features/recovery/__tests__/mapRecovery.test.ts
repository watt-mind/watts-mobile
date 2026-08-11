import { describe, expect, it } from 'vitest';

import {
  applyTimePreset,
  clampDescription,
  filterActiveToday,
  formFromRecoveryItem,
  fromLocalDateTimeValue,
  isLocalTimestampValid,
  parseRecoveryContextList,
  recoveryItemOption,
  toJourneyPayload,
} from '../mapRecovery';
import { optionById, severityValueFromPreset } from '../taxonomy';
import type { RecoveryContextItem } from '../types';

describe('taxonomy map', () => {
  it('maps illness to FATIGUE + WELLNESS_CHECK', () => {
    const option = optionById('illness');
    expect(option.category).toBe('FATIGUE');
    expect(option.eventType).toBe('WELLNESS_CHECK');
  });

  it('maps general note to RECOVERY_NOTE', () => {
    const option = optionById('note');
    expect(option.eventType).toBe('RECOVERY_NOTE');
  });

  it('uses web severity presets', () => {
    expect(severityValueFromPreset('mild')).toBe(3);
    expect(severityValueFromPreset('moderate')).toBe(6);
    expect(severityValueFromPreset('severe')).toBe(9);
  });
});

describe('toJourneyPayload', () => {
  it('builds ISO payload from form values', () => {
    const payload = toJourneyPayload({
      optionId: 'illness',
      severityPreset: 'moderate',
      timePreset: 'custom',
      localTimestamp: '2026-07-19T08:30',
      description: '  fever overnight  ',
    });

    expect(payload.category).toBe('FATIGUE');
    expect(payload.eventType).toBe('WELLNESS_CHECK');
    expect(payload.severity).toBe(6);
    expect(payload.description).toBe('fever overnight');
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('omits empty description', () => {
    const payload = toJourneyPayload({
      optionId: 'fatigue',
      severityPreset: 'mild',
      timePreset: 'now',
      localTimestamp: applyTimePreset('now'),
      description: '   ',
    });
    expect(payload.description).toBeUndefined();
  });

  it('throws instead of silently defaulting to now when the custom timestamp is invalid', () => {
    expect(() =>
      toJourneyPayload({
        optionId: 'fatigue',
        severityPreset: 'mild',
        timePreset: 'custom',
        localTimestamp: 'not-a-date',
        description: '',
      }),
    ).toThrow();

    expect(() =>
      toJourneyPayload({
        optionId: 'fatigue',
        severityPreset: 'mild',
        timePreset: 'custom',
        // Calendar-invalid: February has no 30th day.
        localTimestamp: '2026-02-30T10:00',
        description: '',
      }),
    ).toThrow();
  });
});

describe('fromLocalDateTimeValue / isLocalTimestampValid', () => {
  it('parses a well-formed local datetime', () => {
    const parsed = fromLocalDateTimeValue('2026-07-19T08:30');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(6);
    expect(parsed?.getDate()).toBe(19);
    expect(parsed?.getHours()).toBe(8);
    expect(parsed?.getMinutes()).toBe(30);
    expect(isLocalTimestampValid('2026-07-19T08:30')).toBe(true);
  });

  it('rejects free-text / malformed input instead of defaulting to now', () => {
    expect(fromLocalDateTimeValue('whenever')).toBeNull();
    expect(fromLocalDateTimeValue('')).toBeNull();
    expect(fromLocalDateTimeValue('07/19/2026 8:30am')).toBeNull();
    expect(isLocalTimestampValid('whenever')).toBe(false);
  });

  it('rejects calendar-invalid dates', () => {
    expect(fromLocalDateTimeValue('2026-02-30T10:00')).toBeNull();
    expect(fromLocalDateTimeValue('2026-13-01T00:00')).toBeNull();
    expect(fromLocalDateTimeValue('2026-07-19T25:00')).toBeNull();
  });
});

describe('clampDescription', () => {
  it('trims and caps at 500', () => {
    const long = `${'a'.repeat(510)}`;
    expect(clampDescription(long).length).toBe(500);
  });
});

describe('filterActiveToday', () => {
  const journey: RecoveryContextItem = {
    id: '1',
    sourceRecordId: 'src-1',
    kind: 'journey_event',
    sourceType: 'manual_event',
    label: 'Fatigue',
    description: null,
    severity: 6,
    // Point-in-time: UTC date is Jul 19, but local (device TZ) may be Jul 20.
    startAt: '2026-07-19T23:30:00.000Z',
    endAt: '2026-07-19T23:30:00.000Z',
    editable: true,
    deletable: true,
    origin: 'Manual',
    category: 'FATIGUE',
  };

  const wellness: RecoveryContextItem = {
    id: '2',
    sourceRecordId: 'src-2',
    kind: 'wellness',
    sourceType: 'imported',
    label: 'Illness',
    description: null,
    severity: null,
    startAt: '2026-07-18T00:00:00.000Z',
    endAt: '2026-07-20T00:00:00.000Z',
    editable: false,
    deletable: false,
    origin: 'Imported',
    category: 'illness',
  };

  it('includes wellness ranges by UTC calendar day', () => {
    expect(filterActiveToday([wellness], '2026-07-19')).toHaveLength(1);
    expect(filterActiveToday([wellness], '2026-07-21')).toHaveLength(0);
  });

  it('includes journey events on their local calendar day', () => {
    const localDay = new Date(journey.startAt);
    const y = localDay.getFullYear();
    const m = String(localDay.getMonth() + 1).padStart(2, '0');
    const d = String(localDay.getDate()).padStart(2, '0');
    const todayLocal = `${y}-${m}-${d}`;
    expect(filterActiveToday([journey], todayLocal)).toHaveLength(1);
  });

  it('excludes journey events on other local days', () => {
    expect(filterActiveToday([journey], '2099-01-01')).toHaveLength(0);
  });
});

describe('recoveryItemOption', () => {
  const serverItem = (over: Partial<RecoveryContextItem>): RecoveryContextItem => ({
    id: 'evt-1',
    sourceRecordId: 'rec-1',
    kind: 'journey_event',
    sourceType: 'manual_event',
    label: 'Recovery context',
    description: null,
    severity: 5,
    startAt: '2026-07-19T08:00:00.000Z',
    endAt: '2026-07-19T08:00:00.000Z',
    editable: true,
    deletable: true,
    origin: 'Manual',
    category: null,
    ...over,
  });

  it('resolves GI issues from category + eventType, not the free-text label', () => {
    const option = recoveryItemOption(
      serverItem({
        label: 'Stomach trouble on the long ride',
        category: 'GI_DISTRESS',
        metadata: { eventType: 'SYMPTOM' },
      }),
    );
    expect(option.id).toBe('gi');
    expect(option.sf).toBe('allergens');
    expect(option.id).not.toBe('illness');
  });

  it('resolves cramping without matching on the label', () => {
    const option = recoveryItemOption(
      serverItem({
        label: 'Calf cramps in the final hour',
        category: 'CRAMPING',
        metadata: { eventType: 'SYMPTOM' },
      }),
    );
    expect(option.id).toBe('cramping');
    expect(option.id).not.toBe('illness');
  });

  it('resolves mood from a wellness check', () => {
    const option = recoveryItemOption(
      serverItem({
        label: 'Feeling stressed about work',
        category: 'MOOD',
        metadata: { eventType: 'WELLNESS_CHECK' },
      }),
    );
    expect(option.id).toBe('mood');
    expect(option.id).not.toBe('illness');
  });

  it('falls back to the category match when eventType is missing', () => {
    const option = recoveryItemOption(serverItem({ label: 'Bad night', category: 'SLEEP' }));
    expect(option.id).toBe('sleep');
  });

  it('ignores a non-string metadata.eventType', () => {
    const option = recoveryItemOption(
      serverItem({ label: 'Dizzy spells', category: 'DIZZINESS', metadata: { eventType: 42 } }),
    );
    expect(option.id).toBe('dizziness');
  });

  it('returns a stable option when category is null and metadata is absent', () => {
    const option = recoveryItemOption(serverItem({ label: 'Unknown context', category: null }));
    expect(option).toBeDefined();
    expect(option.id).toBe('illness');
    expect(option.sf).toBeTruthy();
    expect(option.emoji).toBeTruthy();
  });

  it('agrees with formFromRecoveryItem — one lookup path', () => {
    const item = serverItem({
      label: 'Hungry, underfueled',
      category: 'HUNGER',
      metadata: { eventType: 'SYMPTOM' },
    });
    expect(formFromRecoveryItem(item).optionId).toBe(recoveryItemOption(item).id);
    expect(recoveryItemOption(item).id).toBe('hunger');
  });
});

describe('parseRecoveryContextList', () => {
  it('parses valid rows and drops junk', () => {
    const items = parseRecoveryContextList([
      {
        id: 'a',
        sourceRecordId: 's',
        kind: 'journey_event',
        sourceType: 'manual_event',
        label: 'Illness',
        description: null,
        severity: 3,
        startAt: '2026-07-19T00:00:00.000Z',
        endAt: '2026-07-19T23:59:59.000Z',
        editable: true,
        deletable: true,
        origin: 'Manual',
        category: 'FATIGUE',
        metadata: { eventType: 'WELLNESS_CHECK' },
      },
      { nope: true },
    ]);
    expect(items).toHaveLength(1);
    expect(formFromRecoveryItem(items[0]!).optionId).toBe('illness');
  });
});
