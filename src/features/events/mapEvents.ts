import { localDateKey } from '@/src/lib/date';

import type {
  CalendarEventGlance,
  EventApi,
  EventDetail,
  EventGoalApi,
  EventGoalGlance,
} from './types';

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole local calendar days from today to event date (can be negative if past). */
export function daysUntilLocal(
  eventDate: string | Date | null | undefined,
  now = new Date(),
): number | null {
  const key = localDateKey(eventDate);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const eventDay = new Date(y, m - 1, d);
  const today = startOfLocalDay(now);
  const ms = eventDay.getTime() - today.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function countdownLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return '1 day';
  return `${daysUntil} days`;
}

/** Prefer city, country; fall back to freeform location (web calendar parity). */
export function formatEventLocation(
  raw: Pick<EventApi, 'city' | 'country' | 'location'>,
): string | null {
  const cityCountry = [raw.city?.trim(), raw.country?.trim()].filter(Boolean).join(', ');
  if (cityCountry) return cityCountry;
  const location = raw.location?.trim();
  return location || null;
}

/** Web AthleteProfileCard `formatEventMeta`: type · location. */
export function formatEventMeta(raw: EventApi): string {
  const type = raw.subType?.trim() || raw.type?.trim() || 'Event';
  const location = formatEventLocation(raw);
  if (location) return `${type} · ${location}`;
  return type;
}

function monthDayLabels(eventDate: string | Date | null | undefined): {
  monthLabel: string | null;
  dayLabel: string | null;
} {
  const key = localDateKey(eventDate);
  if (!key) return { monthLabel: null, dayLabel: null };
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    monthLabel: date.toLocaleString(undefined, { month: 'short' }),
    dayLabel: String(d),
  };
}

function formatEventDateLabel(eventDate: string | Date | null | undefined): string | null {
  const key = localDateKey(eventDate);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function mapGoalGlance(raw: EventGoalApi): EventGoalGlance | null {
  const title = raw.title?.trim();
  if (!title || !raw.id) return null;
  const targetKey = localDateKey(raw.targetDate);
  let targetDateLabel: string | null = null;
  if (targetKey) {
    const [y, m, d] = targetKey.split('-').map(Number);
    targetDateLabel = new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return {
    id: raw.id,
    title,
    status: raw.status?.trim() || null,
    targetDateLabel,
  };
}

export function mapEventGlance(raw: EventApi, now = new Date()): CalendarEventGlance | null {
  const days = daysUntilLocal(raw.date, now);
  if (days == null || days < 0) return null;
  const title = raw.title?.trim();
  if (!title) return null;
  const { monthLabel, dayLabel } = monthDayLabels(raw.date);
  return {
    id: raw.id,
    title,
    date: raw.date ? String(raw.date) : null,
    type: raw.type ?? null,
    subType: raw.subType ?? null,
    meta: formatEventMeta(raw),
    monthLabel,
    dayLabel,
    priority: raw.priority?.trim() || null,
    daysUntil: days,
    countdownLabel: countdownLabel(days),
  };
}

/** Upcoming events sorted soonest-first; past excluded. */
export function mapUpcomingEvents(
  raw: EventApi[] | undefined,
  now = new Date(),
): CalendarEventGlance[] {
  const glances = (raw ?? [])
    .map((e) => mapEventGlance(e, now))
    .filter((e): e is CalendarEventGlance => e != null);
  glances.sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title));
  return glances;
}

export function pickNextEvent(
  events: CalendarEventGlance[] | undefined,
): CalendarEventGlance | null {
  return events?.[0] ?? null;
}

export function mapEventDetail(raw: EventApi, now = new Date()): EventDetail | null {
  const title = raw.title?.trim();
  if (!title || !raw.id) return null;

  const days = daysUntilLocal(raw.date, now);
  const type = raw.type?.trim() || null;
  const subType = raw.subType?.trim() || null;
  const typeLine = [type, subType].filter(Boolean).join(' / ') || null;

  const distance =
    raw.distance != null && Number.isFinite(raw.distance) ? Number(raw.distance) : null;
  const elevation =
    raw.elevation != null && Number.isFinite(raw.elevation)
      ? Math.round(Number(raw.elevation))
      : null;

  const goals = (raw.goals ?? []).map(mapGoalGlance).filter((g): g is EventGoalGlance => g != null);

  return {
    id: raw.id,
    title,
    date: raw.date ? String(raw.date) : null,
    dateLabel: formatEventDateLabel(raw.date),
    type,
    subType,
    typeLine,
    priority: raw.priority?.trim() || null,
    distanceKm: distance,
    elevationM: elevation,
    locationLabel: formatEventLocation(raw),
    startTime: raw.startTime?.trim() || null,
    description: raw.description?.trim() || null,
    websiteUrl: raw.websiteUrl?.trim() || null,
    daysUntil: days,
    countdownLabel: days != null && days >= 0 ? countdownLabel(days) : null,
    goals,
  };
}

export function eventWebPath(id: string): string {
  return `/events/${encodeURIComponent(id)}`;
}
