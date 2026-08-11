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
});
