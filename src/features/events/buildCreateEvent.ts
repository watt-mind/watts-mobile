import { addLocalMonthsYmd, isValidCalendarYmd } from '@/src/features/log/mapLogForm';
import { ymdToWireDate } from '@/src/lib/wireDate';

import type { CreateEventInput, EventPriority } from './types';

export type EventCreateFormValues = {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  type: string;
  priority: EventPriority | '';
  location: string;
  description: string;
  startTime: string;
};

export const EVENT_TYPE_OPTIONS = [
  { id: 'Ride', label: 'Ride' },
  { id: 'Run', label: 'Run' },
  { id: 'Swim', label: 'Swim' },
  { id: 'Triathlon', label: 'Triathlon' },
  { id: 'Other', label: 'Other' },
] as const;

export const EVENT_PRIORITY_OPTIONS: { id: EventPriority | ''; label: string }[] = [
  { id: '', label: 'None' },
  { id: 'A', label: 'A' },
  { id: 'B', label: 'B' },
  { id: 'C', label: 'C' },
];

export function defaultEventDateYmd(monthsAhead = 2): string {
  return addLocalMonthsYmd(monthsAhead);
}

export function validateEventCreateForm(values: EventCreateFormValues): string | null {
  if (!values.title.trim()) return 'Enter an event title.';
  const date = values.date.trim();
  if (!isValidCalendarYmd(date)) {
    return 'Enter a valid date as YYYY-MM-DD.';
  }
  return null;
}

export function buildCreateEventInput(values: EventCreateFormValues): CreateEventInput {
  const input: CreateEventInput = {
    title: values.title.trim(),
    date: ymdToWireDate(values.date.trim()),
  };
  if (values.type.trim()) input.type = values.type.trim();
  if (values.priority) input.priority = values.priority;
  if (values.location.trim()) input.location = values.location.trim();
  if (values.description.trim()) input.description = values.description.trim();
  if (values.startTime.trim()) input.startTime = values.startTime.trim();
  return input;
}
