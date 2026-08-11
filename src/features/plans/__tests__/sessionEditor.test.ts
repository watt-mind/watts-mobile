import { describe, expect, it } from 'vitest';

import type { PlannedListItem } from '@/src/features/activity/types';

import {
  buildSessionEditorPatch,
  emptySessionEditorForm,
  sessionEditorFormFromValues,
  validateSessionEditorForm,
  type SessionEditorForm,
} from '../sessionEditor';

describe('validateSessionEditorForm', () => {
  it('requires title, type, duration, and date', () => {
    const result = validateSessionEditorForm({
      ...emptySessionEditorForm(''),
      title: '',
      durationMinutes: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.title).toBeTruthy();
      expect(result.fieldErrors.durationMinutes).toBeTruthy();
      expect(result.fieldErrors.dateKey).toBeTruthy();
    }
  });

  it('builds create/patch payload with duration seconds', () => {
    const result = validateSessionEditorForm({
      dateKey: '2026-07-22',
      title: ' Club ride ',
      type: 'Ride',
      durationMinutes: '90',
      tss: '75',
      description: 'Easy pace',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({
        dateKey: '2026-07-22',
        title: 'Club ride',
        type: 'Ride',
        durationSec: 5400,
        tss: 75,
        description: 'Easy pace',
      });
    }
  });

  it('allows empty optional TSS and description', () => {
    const result = validateSessionEditorForm({
      dateKey: '2026-07-22',
      title: 'Run',
      type: 'Run',
      durationMinutes: '45',
      tss: '',
      description: '  ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.tss).toBeNull();
      expect(result.payload.description).toBeNull();
    }
  });

  it('rejects non-numeric TSS', () => {
    const result = validateSessionEditorForm({
      dateKey: '2026-07-22',
      title: 'Ride',
      type: 'Ride',
      durationMinutes: '60',
      tss: 'abc',
      description: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.tss).toBeTruthy();
    }
  });
});

describe('sessionEditorFormFromValues', () => {
  it('prefills edit form from an existing session', () => {
    const form = sessionEditorFormFromValues({
      dateKey: '2026-07-23',
      title: 'Tempo',
      type: 'Run',
      durationSec: 3600,
      tss: 68,
      description: 'Z3',
    });
    expect(form).toMatchObject({
      dateKey: '2026-07-23',
      title: 'Tempo',
      type: 'Run',
      durationMinutes: '60',
      tss: '68',
      description: 'Z3',
    });
  });
});

/**
 * The plan-week list row (`PlannedListItem`) carries no description, so the editor opened
 * from there must not send one. Mirrors PlanTrainingSegment.openEditSession → the sheet.
 */
function editorContextFromListItem(item: PlannedListItem) {
  return {
    dateKey: item.date ?? '',
    title: item.title,
    type: item.type,
    durationSec: item.durationSec,
    tss: item.tss,
    ...(item.description !== undefined ? { description: item.description } : {}),
  };
}

function patchFrom(initial: SessionEditorForm, edited: Partial<SessionEditorForm>) {
  const result = validateSessionEditorForm({ ...initial, ...edited });
  if (!result.ok) throw new Error(`form invalid: ${JSON.stringify(result.fieldErrors)}`);
  return buildSessionEditorPatch(initial, result.payload);
}

describe('buildSessionEditorPatch', () => {
  const listItem: PlannedListItem = {
    id: 'pw_1',
    title: 'Sweet spot 3x12',
    date: '2026-07-22',
    type: 'Ride',
    durationSec: 3600,
    tss: 75,
  };

  it('never sends description when the context had none (CW-486)', () => {
    const initial = sessionEditorFormFromValues(editorContextFromListItem(listItem));
    const patch = patchFrom(initial, { durationMinutes: '75' });

    expect(patch).toEqual({ durationSec: 4500 });
    expect('description' in patch).toBe(false);
    expect(Object.values(patch)).not.toContain(null);
  });

  it('sends description only when the athlete edited it', () => {
    const withDescription = sessionEditorFormFromValues(
      editorContextFromListItem({ ...listItem, description: 'Coach notes: keep it smooth' }),
    );
    expect(patchFrom(withDescription, { title: 'Renamed' })).toEqual({ title: 'Renamed' });
    expect(patchFrom(withDescription, { description: 'New notes' })).toEqual({
      description: 'New notes',
    });
    expect(patchFrom(withDescription, { description: '  ' })).toEqual({ description: null });
  });

  it('never clears TSS the context did not carry', () => {
    const initial = sessionEditorFormFromValues(
      editorContextFromListItem({ ...listItem, tss: null }),
    );
    const patch = patchFrom(initial, { title: 'Endurance' });
    expect(patch).toEqual({ title: 'Endurance' });
  });

  it('is empty when nothing changed, and carries date moves', () => {
    const initial = sessionEditorFormFromValues(editorContextFromListItem(listItem));
    expect(patchFrom(initial, {})).toEqual({});
    expect(patchFrom(initial, { dateKey: '2026-07-24' })).toEqual({ date: '2026-07-24' });
  });
});
