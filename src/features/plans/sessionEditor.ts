export const SESSION_SPORT_OPTIONS = [
  { label: 'Cycling', value: 'Ride' },
  { label: 'Running', value: 'Run' },
  { label: 'Swimming', value: 'Swim' },
  { label: 'Strength', value: 'WeightTraining' },
] as const;

export type SessionSportType = (typeof SESSION_SPORT_OPTIONS)[number]['value'];

export type SessionEditorForm = {
  dateKey: string;
  title: string;
  type: SessionSportType;
  durationMinutes: string;
  tss: string;
  description: string;
};

export type SessionEditorField = 'title' | 'type' | 'durationMinutes' | 'dateKey' | 'tss';

export type SessionEditorPayload = {
  title: string;
  type: SessionSportType;
  durationSec: number;
  tss: number | null;
  description: string | null;
  dateKey: string;
};

export type SessionEditorValidation =
  | { ok: true; payload: SessionEditorPayload }
  | { ok: false; fieldErrors: Partial<Record<SessionEditorField, string>> };

/** Sparse PATCH body — only keys the athlete actually changed are present (CW-486). */
export type SessionEditorPatch = {
  date?: string;
  title?: string;
  type?: string;
  durationSec?: number;
  tss?: number | null;
  description?: string | null;
};

export function emptySessionEditorForm(dateKey: string): SessionEditorForm {
  return {
    dateKey,
    title: '',
    type: 'Ride',
    durationMinutes: '60',
    tss: '',
    description: '',
  };
}

export function sessionEditorFormFromValues(input: {
  dateKey: string;
  title: string;
  type?: string | null;
  durationSec?: number | null;
  tss?: number | null;
  description?: string | null;
}): SessionEditorForm {
  const typeValue = SESSION_SPORT_OPTIONS.some((o) => o.value === input.type)
    ? (input.type as SessionSportType)
    : 'Ride';
  return {
    dateKey: input.dateKey,
    title: input.title ?? '',
    type: typeValue,
    durationMinutes:
      input.durationSec != null && input.durationSec > 0
        ? String(Math.round(input.durationSec / 60))
        : '60',
    tss: input.tss != null && Number.isFinite(input.tss) ? String(Math.round(input.tss)) : '',
    description: input.description ?? '',
  };
}

function normalizeDurationSec(durationMinutes: string): number | null {
  const minutes = Number(durationMinutes);
  if (!durationMinutes.trim() || !Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60);
}

function normalizeTss(tss: string): number | null {
  const raw = tss.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Comparable (payload-shaped) view of a form, used to diff edits against the initial state. */
function normalizeSessionEditorForm(form: SessionEditorForm): {
  dateKey: string;
  title: string;
  type: string;
  durationSec: number | null;
  tss: number | null;
  description: string | null;
} {
  return {
    dateKey: form.dateKey,
    title: form.title.trim(),
    type: form.type,
    durationSec: normalizeDurationSec(form.durationMinutes),
    tss: normalizeTss(form.tss),
    description: form.description.trim() || null,
  };
}

export function validateSessionEditorForm(form: SessionEditorForm): SessionEditorValidation {
  const fieldErrors: Partial<Record<SessionEditorField, string>> = {};
  const title = form.title.trim();
  if (!title) fieldErrors.title = 'Title is required';
  if (!form.type) fieldErrors.type = 'Activity type is required';
  if (!form.dateKey) fieldErrors.dateKey = 'Day is required';

  const minutes = Number(form.durationMinutes);
  if (!form.durationMinutes.trim() || !Number.isFinite(minutes) || minutes <= 0) {
    fieldErrors.durationMinutes = 'Duration (minutes) is required';
  }

  const tssRaw = form.tss.trim();
  let tss: number | null = null;
  if (tssRaw) {
    const n = Number(tssRaw);
    if (!Number.isFinite(n) || n < 0) {
      fieldErrors.tss = 'TSS must be a number';
    } else {
      tss = Math.round(n);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const description = form.description.trim();
  return {
    ok: true,
    payload: {
      title,
      type: form.type,
      durationSec: Math.round(minutes * 60),
      tss,
      description: description || null,
      dateKey: form.dateKey,
    },
  };
}

/**
 * Build a sparse PATCH body by diffing the submitted payload against the form the athlete
 * was actually shown. Fields the editor context never supplied (e.g. a coach description
 * absent from the plan-week list view) stay at their prefill value, so they are never sent
 * and can never clobber server data (CW-486). Unchanged fields are omitted too.
 */
export function buildSessionEditorPatch(
  initial: SessionEditorForm,
  payload: SessionEditorPayload,
): SessionEditorPatch {
  const base = normalizeSessionEditorForm(initial);
  const patch: SessionEditorPatch = {};
  if (payload.dateKey !== base.dateKey) patch.date = payload.dateKey;
  if (payload.title !== base.title) patch.title = payload.title;
  if (payload.type && payload.type !== base.type) patch.type = payload.type;
  if (payload.durationSec !== base.durationSec) patch.durationSec = payload.durationSec;
  if (payload.tss !== base.tss) patch.tss = payload.tss;
  if (payload.description !== base.description) patch.description = payload.description;
  return patch;
}
