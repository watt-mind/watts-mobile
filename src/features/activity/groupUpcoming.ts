import { localDateKey } from '@/src/lib/date';

import type { PlannedListItem } from './types';

export type UpcomingSection = {
  title: string;
  data: PlannedListItem[];
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addLocalDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function sectionTitleForKey(dateKey: string, todayKey: string, tomorrowKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === tomorrowKey) return 'Tomorrow';
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Group planned rows under Today / Tomorrow / weekday headers (local calendar). */
export function groupUpcomingByDay(
  items: PlannedListItem[] | undefined,
  now = new Date(),
): UpcomingSection[] {
  const today = startOfLocalDay(now);
  const todayKey = localDateKey(today)!;
  const tomorrowKey = localDateKey(addLocalDays(today, 1))!;

  const buckets = new Map<string, PlannedListItem[]>();
  for (const item of items ?? []) {
    const key = localDateKey(item.date);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  const keys = [...buckets.keys()].sort();
  return keys.map((key) => ({
    title: sectionTitleForKey(key, todayKey, tomorrowKey),
    data: buckets.get(key) ?? [],
  }));
}
