import { describe, expect, it } from 'vitest';

import {
  applyPrimaryEventToForm,
  buildEventGoalWizardInput,
  emptyEventGoalWizardForm,
  toggleEventId,
  validateEventGoalWizardForm,
  ymdToGoalDateIso,
} from '../eventGoalWizardModel';

describe('eventGoalWizard', () => {
  it('requires event selection for EVENT goals unless stub allowed', () => {
    const form = emptyEventGoalWizardForm('EVENT');
    form.title = 'A race';
    form.targetDate = '2026-10-15';
    expect(validateEventGoalWizardForm(form)).toMatch(/event/i);
    expect(validateEventGoalWizardForm(form, { allowEventDataStub: true })).toBeNull();
    form.eventIds = ['e1'];
    expect(validateEventGoalWizardForm(form)).toBeNull();
  });

  it('builds EVENT payload with eventData stub when no eventIds', () => {
    const form = emptyEventGoalWizardForm('EVENT');
    form.title = 'First marathon';
    form.targetDate = '2026-11-01';
    form.eventType = 'Marathon';
    const input = buildEventGoalWizardInput(form);
    expect(input.eventIds).toBeUndefined();
    expect(input.eventData).toEqual({
      title: 'First marathon',
      date: '2026-11-01T00:00:00.000Z',
      type: 'RACE',
      subType: 'Marathon',
    });
  });

  it('builds EVENT payload with eventIds (not eventData stub)', () => {
    const form = emptyEventGoalWizardForm('EVENT');
    form.title = 'Gran Fondo';
    form.targetDate = '2026-10-15';
    form.eventIds = ['ev-1', 'ev-2'];
    form.eventType = 'Gran Fondo';
    form.priority = 'HIGH';
    const input = buildEventGoalWizardInput(form, [
      {
        id: 'ev-2',
        title: 'Autumn GF',
        dateKey: '2026-10-15',
        distance: 120,
        elevation: 1500,
      },
    ]);
    expect(input.type).toBe('EVENT');
    expect(input.eventIds).toEqual(['ev-1', 'ev-2']);
    expect(input.eventId).toBe('ev-2');
    expect(input.eventData).toBeUndefined();
    expect(input.targetDate).toBe(ymdToGoalDateIso('2026-10-15'));
    expect(input.aiContext).toMatch(/Gran Fondo/);
    expect(input.distance).toBe(120);
  });

  it('builds BODY_COMPOSITION with weight_kg metric', () => {
    const form = emptyEventGoalWizardForm('BODY_COMPOSITION');
    form.title = 'Race weight';
    form.targetDate = '2026-12-01';
    form.startValue = '78';
    form.targetValue = '72';
    const input = buildEventGoalWizardInput(form);
    expect(input.metric).toBe('weight_kg');
    expect(input.startValue).toBe(78);
    expect(input.targetValue).toBe(72);
  });

  it('prefills from primary selected event', () => {
    const form = emptyEventGoalWizardForm('EVENT');
    const next = applyPrimaryEventToForm(
      form,
      [
        {
          id: 'e1',
          title: 'Local TT',
          dateKey: '2026-09-01',
          description: 'Club time trial',
          subType: 'Time Trial',
        },
      ],
      ['e1'],
    );
    expect(next.title).toBe('Local TT');
    expect(next.targetDate).toBe('2026-09-01');
    expect(next.description).toBe('Club time trial');
    expect(next.eventType).toBe('Time Trial');
  });

  it('toggles event ids', () => {
    expect(toggleEventId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleEventId(['a', 'b'], 'a')).toEqual(['b']);
  });

  // CW-557: the wizard validates before it builds (EventGoalWizard.onSubmit), so a
  // comma decimal from a decimal-pad keyboard used to be rejected outright with
  // "Target value must be a number." — the athlete typed a valid number for their locale.
  describe('locale decimals (CW-557)', () => {
    function bodyCompForm(startValue: string, targetValue: string) {
      const form = emptyEventGoalWizardForm('BODY_COMPOSITION');
      form.title = 'Race weight';
      form.targetDate = '2026-12-01';
      form.startValue = startValue;
      form.targetValue = targetValue;
      return form;
    }

    it('accepts a comma decimal target and carries it through to the payload', () => {
      const form = bodyCompForm('78,25', '72,5');
      expect(validateEventGoalWizardForm(form)).toBeNull();
      const input = buildEventGoalWizardInput(form);
      expect(input.startValue).toBe(78.25);
      expect(input.targetValue).toBe(72.5);
    });

    it('accepts grouped input for PERFORMANCE start/target values', () => {
      const form = emptyEventGoalWizardForm('PERFORMANCE');
      form.title = 'Raise FTP';
      form.targetDate = '2026-12-01';
      form.startValue = '1 234,5';
      form.targetValue = '1.234,56';
      expect(validateEventGoalWizardForm(form)).toBeNull();
      const input = buildEventGoalWizardInput(form);
      expect(input.startValue).toBe(1234.5);
      expect(input.targetValue).toBe(1234.56);
    });

    it('accepts a comma decimal CONSISTENCY target', () => {
      const form = emptyEventGoalWizardForm('CONSISTENCY');
      form.title = 'Weekly hours';
      form.targetDate = '2026-12-01';
      form.targetValue = '8,5';
      expect(validateEventGoalWizardForm(form)).toBeNull();
      expect(buildEventGoalWizardInput(form).targetValue).toBe(8.5);
    });

    it('still rejects genuinely unparseable values with the existing messages', () => {
      expect(validateEventGoalWizardForm(bodyCompForm('78', 'abc'))).toBe(
        'Target value must be a number.',
      );
      expect(validateEventGoalWizardForm(bodyCompForm('abc', '72'))).toBe(
        'Start value must be a number.',
      );
      expect(validateEventGoalWizardForm(bodyCompForm('1,2,3', '72'))).toBe(
        'Start value must be a number.',
      );
    });

    it('treats blank values as absent rather than invalid', () => {
      const form = bodyCompForm('', '   ');
      expect(validateEventGoalWizardForm(form)).toBeNull();
      const input = buildEventGoalWizardInput(form);
      expect(input.startValue).toBeUndefined();
      expect(input.targetValue).toBeUndefined();
    });

    it('omits an unparseable value from the payload instead of sending NaN', () => {
      const input = buildEventGoalWizardInput(bodyCompForm('abc', 'abc'));
      expect(input.startValue).toBeUndefined();
      expect(input.targetValue).toBeUndefined();
    });
  });
});
