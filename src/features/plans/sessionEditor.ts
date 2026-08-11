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
  /**
   * Stored sport value. May be outside SESSION_SPORT_OPTIONS (VirtualRide, Rowing, …) or
   * empty when the session has no type — those are preserved rather than coerced (CW-487).
   */
  type: string;
  durationMinutes: string;
  tss: string;
  description: string;
};

export type SessionEditorField = 'title' | 'type' | 'durationMinutes' | 'dateKey' | 'tss';

export type SessionEditorPayload = {
  title: string;
  type: string;
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

export type SessionSportChoice = {
  label: string;
  value: string;
  /** True for the stored sport carried through because it has no editor option. */
  preserved: boolean;
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

function humanizeSportValue(value: string): string {
  const spaced = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return value;
  return spaced
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Display label for any stored sport value, known option or not. */
export function sessionSportLabel(value: string): string {
  const known = SESSION_SPORT_OPTIONS.find((option) => option.value === value);
  return known ? known.label : humanizeSportValue(value);
}

/**
 * Editor sport chips for a session. Sessions stored as a sport the editor cannot
 * represent (VirtualRide, Rowing, Hike, …) get an extra chip so the athlete sees
 * — and keeps — the real sport instead of it silently becoming a Ride (CW-487).
 */
export function sessionSportChoices(storedType?: string | null): SessionSportChoice[] {
  const base: SessionSportChoice[] = SESSION_SPORT_OPTIONS.map((option) => ({
    label: option.label,
    value: option.value,
    preserved: false,
  }));
  const stored = (storedType ?? '').trim();
  if (!stored || base.some((choice) => choice.value === stored)) return base;
  return [...base, { label: sessionSportLabel(stored), value: stored, preserved: true }];
}

export function sessionEditorFormFromValues(input: {
  dateKey: string;
  title: string;
  type?: string | null;
  durationSec?: number | null;
  tss?: number | null;
  description?: string | null;
}): SessionEditorForm {
  return {
    dateKey: input.dateKey,
    title: input.title ?? '',
    // Preserve whatever the session is stored as — never coerce to 'Ride' (CW-487).
    type: (input.type ?? '').trim(),
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
    type: form.type.trim(),
    durationSec: normalizeDurationSec(form.durationMinutes),
    tss: normalizeTss(form.tss),
    description: form.description.trim() || null,
  };
}

export function validateSessionEditorForm(
  form: SessionEditorForm,
  options: { requireType?: boolean } = {},
): SessionEditorValidation {
  const { requireType = true } = options;
  const fieldErrors: Partial<Record<SessionEditorField, string>> = {};
  const title = form.title.trim();
  if (!title) fieldErrors.title = 'Title is required';
  if (requireType && !form.type.trim()) fieldErrors.type = 'Activity type is required';
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
      type: form.type.trim(),
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
 * and can never clobber server data (CW-486). Unchanged fields are omitted too, which also
 * keeps a stored sport the editor cannot represent from being rewritten (CW-487).
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
