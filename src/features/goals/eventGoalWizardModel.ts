import { isValidCalendarYmd } from '@/src/features/log/mapLogForm';
import { localDateKey } from '@/src/features/today/weekGlance';
import { ymdToWireDate } from '@/src/lib/wireDate';

import type { CreateGoalInput, GoalType } from './types';

export type GoalPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type EventGoalWizardForm = {
  type: GoalType;
  title: string;
  /** YYYY-MM-DD deadline */
  targetDate: string;
  priority: GoalPriority;
  description: string;
  metric: string;
  startValue: string;
  targetValue: string;
  /** EVENT: selected calendar event ids (primary = last). */
  eventIds: string[];
  /** EVENT race subtype for aiContext (web eventSubTypes). */
  eventType: string;
};

export const GOAL_TYPE_OPTIONS: {
  id: GoalType;
  label: string;
  description: string;
}[] = [
  {
    id: 'EVENT',
    label: 'Event Preparation',
    description: 'Prepare for a specific race or event.',
  },
  {
    id: 'BODY_COMPOSITION',
    label: 'Body Composition',
    description: 'Lose weight, gain muscle, or maintain.',
  },
  {
    id: 'PERFORMANCE',
    label: 'Performance',
    description: 'Improve FTP, VO2 Max, or pace.',
  },
  {
    id: 'CONSISTENCY',
    label: 'Consistency',
    description: 'Build habits like weekly hours or frequency.',
  },
];

export const PERFORMANCE_METRICS = [
  'FTP (Watts)',
  'VO2 Max',
  '5k Pace (min/km)',
  '10k Pace (min/km)',
  'Max Heart Rate',
] as const;

export const CONSISTENCY_METRICS = ['Hours', 'Workouts', 'TSS'] as const;

export const EVENT_SUBTYPES = [
  'Road Race',
  'Criterium',
  'Time Trial',
  'Gran Fondo',
  'MTB (XC)',
  'MTB (Marathon)',
  'Gravel',
  'Cyclocross',
  'Social Ride',
  'Cyclotour',
  'Running (5k)',
  'Running (10k)',
  'Half Marathon',
  'Marathon',
  'Ultra',
  'Triathlon (Sprint)',
  'Triathlon (Olympic)',
  'Triathlon (70.3)',
  'Triathlon (Full)',
] as const;

export const PRIORITY_OPTIONS: { id: GoalPriority; label: string }[] = [
  { id: 'HIGH', label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' },
];

export function emptyEventGoalWizardForm(type: GoalType = 'EVENT'): EventGoalWizardForm {
  return {
    type,
    title: '',
    targetDate: '',
    priority: 'MEDIUM',
    description: '',
    metric: type === 'PERFORMANCE' ? PERFORMANCE_METRICS[0] : type === 'CONSISTENCY' ? 'Hours' : '',
    startValue: '',
    targetValue: '',
    eventIds: [],
    eventType: 'Road Race',
  };
}

/**
 * EventGoalWizard deadline / event date on the wire.
 *
 * CW-493: both used to be UTC-anchored at a fixed hour (`T23:59:59Z` for the
 * deadline, `T00:00:00Z` for the event), and the 23:59:59 variant pushed the
 * day forward for every zone east of UTC — a Kolkata (UTC+5:30) deadline of
 * Aug 10 landed at 05:29 local on Aug 11 and the countdown read one day
 * short. Both are now the canonical UTC-midnight day marker, which
 * `localDateKey` round-trips unchanged in every zone.
 */
export const ymdToGoalDateIso = ymdToWireDate;

export type SelectableEvent = {
  id: string;
  title: string;
  dateKey: string | null;
  description?: string | null;
  subType?: string | null;
  type?: string | null;
  distance?: number | null;
  elevation?: number | null;
  expectedDuration?: number | null;
  terrain?: string | null;
};

/** Upcoming events first (date ≥ today), then past — for wizard step 2. */
export function sortEventsForGoalWizard(
  events: SelectableEvent[],
  todayKey: string,
): SelectableEvent[] {
  return [...events].sort((a, b) => {
    const aKey = a.dateKey ?? '';
    const bKey = b.dateKey ?? '';
    const aUpcoming = aKey >= todayKey ? 0 : 1;
    const bUpcoming = bKey >= todayKey ? 0 : 1;
    if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;
    return aKey.localeCompare(bKey);
  });
}

export function mapApiEventForWizard(raw: {
  id: string;
  title?: string | null;
  date?: string | Date | null;
  description?: string | null;
  subType?: string | null;
  type?: string | null;
  distance?: number | null;
  elevation?: number | null;
  expectedDuration?: number | null;
  terrain?: string | null;
}): SelectableEvent | null {
  if (!raw.id) return null;
  return {
    id: raw.id,
    title: raw.title?.trim() || 'Untitled event',
    dateKey: localDateKey(raw.date),
    description: raw.description,
    subType: raw.subType,
    type: raw.type,
    distance: typeof raw.distance === 'number' ? raw.distance : null,
    elevation: typeof raw.elevation === 'number' ? raw.elevation : null,
    expectedDuration: typeof raw.expectedDuration === 'number' ? raw.expectedDuration : null,
    terrain: raw.terrain,
  };
}

/** Prefill title/dates from selected events (web toggleUserEvent). */
export function applyPrimaryEventToForm(
  form: EventGoalWizardForm,
  events: SelectableEvent[],
  eventIds: string[],
): EventGoalWizardForm {
  if (eventIds.length === 0) {
    return { ...form, eventIds };
  }
  const primaryId = eventIds[eventIds.length - 1]!;
  const primary = events.find((e) => e.id === primaryId);
  if (!primary) return { ...form, eventIds };

  const title = eventIds.length === 1 ? primary.title : `${primary.title} and others`;

  const next: EventGoalWizardForm = {
    ...form,
    eventIds,
    title,
    targetDate: primary.dateKey ?? form.targetDate,
    description:
      typeof primary.description === 'string' && primary.description.trim()
        ? primary.description
        : form.description,
  };
  if (
    primary.subType &&
    EVENT_SUBTYPES.includes(primary.subType as (typeof EVENT_SUBTYPES)[number])
  ) {
    next.eventType = primary.subType;
  }
  return next;
}

export function toggleEventId(eventIds: string[], id: string): string[] {
  if (eventIds.includes(id)) return eventIds.filter((x) => x !== id);
  return [...eventIds, id];
}

export type EventGoalWizardValidateOptions = {
  /**
   * Activation (and similar) may create an EVENT goal with server `eventData`
   * when the athlete has no calendar events yet. Prefer `eventIds` when any
   * are selected.
   */
  allowEventDataStub?: boolean;
};

export function validateEventGoalWizardForm(
  form: EventGoalWizardForm,
  options: EventGoalWizardValidateOptions = {},
): string | null {
  if (form.title.trim().length < 2) {
    return 'Enter a goal title (at least 2 characters).';
  }
  if (form.type === 'EVENT' && form.eventIds.length === 0 && !options.allowEventDataStub) {
    return 'Select at least one upcoming event for an event goal.';
  }
  if (form.targetDate.trim()) {
    if (!isValidCalendarYmd(form.targetDate.trim())) {
      return 'Enter a valid target date as YYYY-MM-DD.';
    }
  } else if (form.type !== 'EVENT' || (form.type === 'EVENT' && form.eventIds.length === 0)) {
    return 'Enter a target date for this goal.';
  }
  if (
    form.type === 'PERFORMANCE' ||
    form.type === 'BODY_COMPOSITION' ||
    form.type === 'CONSISTENCY'
  ) {
    if (form.targetValue.trim() && Number.isNaN(Number(form.targetValue))) {
      return 'Target value must be a number.';
    }
    if (form.startValue.trim() && Number.isNaN(Number(form.startValue))) {
      return 'Start value must be a number.';
    }
  }
  return null;
}

function buildAiContext(form: EventGoalWizardForm, primary?: SelectableEvent | null): string {
  const parts = [`Type: ${form.type}.`, `Goal: ${form.title.trim()}.`, 'Phase Preference: BASE.'];
  if (form.type === 'EVENT') {
    parts.push(`Race Type: ${form.eventType}.`);
    if (primary?.distance != null) parts.push(`Distance: ${primary.distance}km.`);
    if (primary?.elevation != null) parts.push(`Elevation: ${primary.elevation}m.`);
    if (primary?.terrain) parts.push(`Terrain: ${primary.terrain}.`);
    if (primary?.expectedDuration != null) {
      parts.push(`Expected Duration: ${primary.expectedDuration}h.`);
    }
  }
  return parts.join(' ');
}

/** Bearer POST body matching web EventGoalWizard saveGoal outcomes. */
export function buildEventGoalWizardInput(
  form: EventGoalWizardForm,
  events: SelectableEvent[] = [],
): CreateGoalInput {
  const title = form.title.trim();
  const primary =
    form.eventIds.length > 0
      ? events.find((e) => e.id === form.eventIds[form.eventIds.length - 1])
      : null;

  const targetYmd = form.targetDate.trim() || primary?.dateKey || '';
  const input: CreateGoalInput = {
    type: form.type,
    title,
    priority: form.priority,
    phase: 'BASE',
    aiContext: buildAiContext(form, primary),
  };

  if (form.description.trim()) {
    input.description = form.description.trim();
  }
  if (targetYmd && isValidCalendarYmd(targetYmd)) {
    input.targetDate = ymdToGoalDateIso(targetYmd);
  }

  if (form.type === 'EVENT') {
    input.eventType = form.eventType;
    if (form.eventIds.length > 0) {
      input.eventIds = [...form.eventIds];
      input.eventId = form.eventIds[form.eventIds.length - 1];
      if (primary?.dateKey) {
        input.eventDate = ymdToGoalDateIso(primary.dateKey);
      }
      if (primary?.distance != null) input.distance = primary.distance;
      if (primary?.elevation != null) input.elevation = primary.elevation;
      if (primary?.expectedDuration != null) input.duration = primary.expectedDuration;
      if (primary?.terrain) input.terrain = primary.terrain;
      return input;
    }

    // Activation / empty-calendar path — server creates a linked event from stub.
    const dateIso = targetYmd
      ? ymdToGoalDateIso(targetYmd)
      : ymdToGoalDateIso(form.targetDate.trim());
    input.eventData = {
      title,
      date: dateIso,
      type: 'RACE',
      subType: form.eventType || undefined,
    };
    input.eventDate = dateIso;
    return input;
  }

  if (form.type === 'BODY_COMPOSITION') {
    input.metric = 'weight_kg';
    if (form.startValue.trim()) input.startValue = Number(form.startValue);
    if (form.targetValue.trim()) input.targetValue = Number(form.targetValue);
    return input;
  }

  if (form.type === 'PERFORMANCE') {
    if (form.metric.trim()) input.metric = form.metric.trim();
    if (form.startValue.trim()) input.startValue = Number(form.startValue);
    if (form.targetValue.trim()) input.targetValue = Number(form.targetValue);
    return input;
  }

  // CONSISTENCY
  if (form.metric.trim()) input.metric = form.metric.trim();
  if (form.targetValue.trim()) input.targetValue = Number(form.targetValue);
  return input;
}
